/* Lectura de una carpeta de mundo de Minecraft (Java Edition) desde el navegador. */
(function (global) {
    'use strict';

    const DIM_LABELS = {
        'minecraft:overworld': 'Overworld',
        'minecraft:the_nether': 'Nether',
        'minecraft:the_end': 'End',
    };

    function readFile(file, start, end) {
        const blob = start === undefined ? file : file.slice(start, end);
        return blob.arrayBuffer();
    }

    /* Ruta relativa dentro del mundo, sin la carpeta raíz que añade el input. */
    function relPath(file) {
        const p = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
        return p;
    }

    /* Detecta la dimensión a la que pertenece una ruta tipo ".../DIM-1/region/r.0.0.mca". */
    function dimensionOf(path) {
        const p = path.toLowerCase();
        let m = p.match(
            /(?:^|\/)dimensions\/([a-z0-9_.-]+)\/([a-z0-9_./-]+?)\/(region|data|entities|poi)(?:\/|$)/,
        );
        if (m) return m[1] + ':' + m[2];
        if (/(?:^|\/)dim-1(?:\/|$)/.test(p)) return 'minecraft:the_nether';
        if (/(?:^|\/)dim1(?:\/|$)/.test(p)) return 'minecraft:the_end';
        return 'minecraft:overworld';
    }

    // Clasificación de rutas dentro del save, compartida por load() y refresh().
    const RE_LEVEL = /(?:^|\/)level\.dat$/;
    const RE_REGION = /r\.-?\d+\.-?\d+\.mca$/;
    const RE_REGION_XZ = /r\.(-?\d+)\.(-?\d+)\.mca/i;
    const RE_SIDECAR = /(?:^|\/)(entities|poi)\//;
    const RE_POI = /(?:^|\/)poi\/r\.-?\d+\.-?\d+\.mca$/;
    const RE_ENTITIES = /(?:^|\/)entities\/r\.-?\d+\.-?\d+\.mca$/;
    const RE_FORCED = /(?:^|\/)chunks\.dat$/;
    const RE_PLAYER = /(?:^|\/)[0-9a-f]{8}-[0-9a-f-]+\.dat$/;

    function emptyDim(id) {
        return {
            id,
            label: DIM_LABELS[id] || id,
            generated: new Map(), // "x,z" -> { x, z, mtime }
            regions: new Map(), // "rx,rz" -> File, para renderizar el terreno luego
            regionStamp: new Map(), // "rx,rz" -> huella, para releer solo lo que cambia
            forced: [], // [{x,z}]
            players: [], // [{name, x, z, y, source}]
            loaders: [], // [{chunkX, chunkZ, x, z, kind, entities:[id]}], de poi/ + entities/
            poiFiles: new Map(), // "rx,rz" -> File de poi/, para releerlos en vivo
            entityFiles: new Map(), // "rx,rz" -> File de entities/
            regionFiles: 0,
            lastPlayed: 0,
        };
    }

    function getDim(world, id) {
        if (!world.dimensions.has(id)) world.dimensions.set(id, emptyDim(id));
        return world.dimensions.get(id);
    }

    /* Cabecera de un region file (.mca): 1024 entradas de localización + 1024 timestamps. */
    async function readRegionHeader(file, rx, rz, dim) {
        const buf = await readFile(file, 0, 8192);
        if (buf.byteLength < 4096) return;
        const view = new DataView(buf);
        const hasTimestamps = buf.byteLength >= 8192;
        for (let i = 0; i < 1024; i++) {
            const off =
                (view.getUint8(i * 4) << 16) |
                (view.getUint8(i * 4 + 1) << 8) |
                view.getUint8(i * 4 + 2);
            const sectors = view.getUint8(i * 4 + 3);
            if (off === 0 || sectors === 0) continue; // chunk no generado
            const x = rx * 32 + (i % 32);
            const z = rz * 32 + Math.floor(i / 32);
            const mtime = hasTimestamps ? view.getUint32(4096 + i * 4) : 0;
            dim.generated.set(x + ',' + z, { x, z, mtime });
            if (mtime > dim.lastPlayed) dim.lastPlayed = mtime;
        }
    }

    /* data/chunks.dat -> LongArray "Forced" con posiciones de chunk empaquetadas. */
    async function readForceload(file, dim) {
        const nbt = await NBT.parse(await readFile(file));
        const data = nbt.value.data || nbt.value.Data || nbt.value;
        const forced = data.Forced;
        if (!forced) return;
        for (const packed of forced) {
            const x = Number(BigInt.asIntN(32, packed & 0xffffffffn));
            const z = Number(BigInt.asIntN(32, packed >> 32n));
            dim.forced.push({ x, z });
        }
    }

    /*
     * World border del level.dat. Es un cuadrado centrado en BorderCenterX/Z con
     * BorderSize bloques de lado, el mismo para todas las dimensiones (Java no lo
     * divide entre 8 en el Nether). Sin la etiqueta se aplica el valor de fábrica,
     * 60 000 000 de lado, que es lo que usa el juego cuando nadie lo ha tocado.
     */
    const BORDER_DEFAULT = 60000000;

    function borderFromNBT(d) {
        const size = d.BorderSize != null ? Number(d.BorderSize) : BORDER_DEFAULT;
        if (!isFinite(size) || size <= 0) return null;
        return {
            x: Number(d.BorderCenterX || 0),
            z: Number(d.BorderCenterZ || 0),
            size: size,
        };
    }

    function playerFromNBT(data, name, source) {
        const pos = data.Pos;
        if (!pos || pos.length < 3) return null;
        let dimId = data.Dimension;
        if (typeof dimId === 'number') {
            dimId =
                dimId === -1
                    ? 'minecraft:the_nether'
                    : dimId === 1
                      ? 'minecraft:the_end'
                      : 'minecraft:overworld';
        }
        if (typeof dimId !== 'string') dimId = 'minecraft:overworld';
        if (dimId.indexOf(':') === -1) dimId = 'minecraft:' + dimId;
        return {
            name,
            source,
            dimension: dimId,
            x: pos[0],
            y: pos[1],
            z: pos[2],
            chunkX: Math.floor(pos[0] / 16),
            chunkZ: Math.floor(pos[2] / 16),
        };
    }

    /* ---------- Chunk loaders (poi/ + entities/) ---------- */

    /*
     * region/, poi/ y entities/ comparten el mismo contenedor .mca: cabecera de
     * 8 KiB y luego cada chunk comprimido por su cuenta. Esto recorre uno y
     * entrega el NBT ya parseado de cada chunk que tenga datos. Se descomprime
     * en lotes porque DecompressionStream es asíncrono y de uno en uno se
     * arrastra muchísimo.
     */
    async function eachChunk(file, onChunk) {
        const buf = await readFile(file);
        if (buf.byteLength < 4096) return;
        const view = new DataView(buf);
        const trozos = [];
        for (let i = 0; i < 1024; i++) {
            const off =
                (view.getUint8(i * 4) << 16) |
                (view.getUint8(i * 4 + 1) << 8) |
                view.getUint8(i * 4 + 2);
            const sectors = view.getUint8(i * 4 + 3);
            if (!off || !sectors) continue;
            const start = off * 4096;
            if (start + 5 > buf.byteLength) continue;
            const length = view.getUint32(start);
            const end = Math.min(buf.byteLength, start + 4 + length);
            if (end <= start + 5) continue;
            // Los 5 primeros bytes son longitud y tipo de compresión; NBT.parse
            // reconoce gzip y zlib solo, así que basta con darle el resto.
            trozos.push(buf.slice(start + 5, end));
        }
        const LOTE = 32;
        for (let b = 0; b < trozos.length; b += LOTE) {
            const nbts = await Promise.all(
                trozos.slice(b, b + LOTE).map(async (bytes) => {
                    try {
                        return await NBT.parse(bytes);
                    } catch (_) {
                        return null; // chunk ilegible: no vale la pena romper por él
                    }
                }),
            );
            for (const nbt of nbts) if (nbt) onChunk(nbt.value);
        }
    }

    /*
     * Entidades que delatan un chunk loader.
     *
     * Conviene tener claro qué carga chunks en vanilla, porque es menos de lo
     * que suele creerse: el spawn, los jugadores, /forceload, el ticket que crea
     * un portal cuando algo lo cruza y la perla de ender mientras vuela. Los
     * hoppers, los relojes de redstone y las granjas no cargan nada; solo
     * funcionan si el chunk ya está cargado por otro motivo.
     *
     * De todo eso, en el disco no queda ni un ticket. Lo que sí queda escrito es
     * la entidad que lo provoca, y de ahí sale esta lista:
     *
     *  - una perla de ender guardada a medio vuelo: chunk loader clásico;
     *  - cualquier entidad parada sobre un portal del Nether: al cruzarlo una y
     *    otra vez mantiene vivo el ticket del portal.
     */
    const LOADER_ENTITIES = new Set(['minecraft:ender_pearl']);
    const PORTAL_NEAR = 16; // bloques hasta el portal para darlo por encima

    /*
     * poi/r.X.Z.mca: el juego apunta ahí cada bloque de portal del Nether como
     * punto de interés (lo usa para emparejar portales). Aquí solo interesan
     * como posible sitio de un loader, no como dato a enseñar: un portal sin
     * nada encima no carga nada y no sale por ninguna parte.
     */
    async function readPortals(file, out) {
        await eachChunk(file, (chunk) => {
            const secciones = chunk.Sections;
            if (!secciones) return;
            for (const clave of Object.keys(secciones)) {
                const sec = secciones[clave];
                const recs = sec && sec.Records;
                if (!recs || !recs.length) continue;
                for (const r of recs) {
                    if (!r || r.type !== 'minecraft:nether_portal') continue;
                    const pos = r.pos;
                    if (!pos || pos.length < 3) continue;
                    const x = Number(pos[0]),
                        z = Number(pos[2]);
                    const k = Math.floor(x / 16) + ',' + Math.floor(z / 16);
                    if (!out.has(k)) out.set(k, { x, z });
                }
            }
        });
    }

    /* entities/r.X.Z.mca: se queda con lo que carga chunks y descarta el resto. */
    async function readLoaderEntities(file, portales, out) {
        await eachChunk(file, (chunk) => {
            const lista = chunk.Entities;
            if (!lista || !lista.length) return;
            for (const e of lista) {
                const pos = e && e.Pos;
                if (!pos || pos.length < 3) continue;
                const id = String((e && e.id) || '');
                const x = Number(pos[0]),
                    z = Number(pos[2]);
                const cx = Math.floor(x / 16),
                    cz = Math.floor(z / 16);
                const k = cx + ',' + cz;

                let kind = null;
                if (LOADER_ENTITIES.has(id)) {
                    kind = 'pearl';
                } else {
                    const p = portales.get(k);
                    if (p && Math.abs(x - p.x) <= PORTAL_NEAR && Math.abs(z - p.z) <= PORTAL_NEAR) {
                        kind = 'portal';
                    }
                }
                if (!kind) continue;

                let l = out.get(k);
                if (!l) {
                    l = { chunkX: cx, chunkZ: cz, x: x, z: z, kind: kind, entities: [] };
                    out.set(k, l);
                }
                // Una perla manda sobre el portal: es la señal más clara.
                if (kind === 'pearl') l.kind = 'pearl';
                l.entities.push(id);
            }
        });
    }

    /*
     * Recorre poi/ y entities/ de la dimensión y deja en dim.loaders un punto por
     * chunk que esté cargando. Los entities/ se leen enteros, no solo los de las
     * regiones con portal: una perla puede estar en cualquier sitio.
     */
    async function readLoaders(dim, tick) {
        dim.loaders = [];
        const portales = new Map(); // "cx,cz" -> { x, z }
        for (const [, file] of dim.poiFiles) {
            try {
                await readPortals(file, portales);
            } catch (_) {
                /* un poi/ ilegible no debe tumbar la carga del mundo entero */
            }
            if (tick) tick('poi');
        }

        const encontrados = new Map(); // "cx,cz" -> loader
        for (const [, file] of dim.entityFiles) {
            try {
                await readLoaderEntities(file, portales, encontrados);
            } catch (_) {
                /* entities/ ilegible: esa región se queda sin mirar */
            }
            if (tick) tick('entities');
        }
        for (const l of encontrados.values()) dim.loaders.push(l);
    }

    /*
     * Margen para considerar que dos playerdata son de la misma tanda de
     * guardado. El juego solo reescribe el archivo de quien está conectado, y el
     * autoguardado va cada 5 minutos, así que con 10 sobra: lo que quede fuera es
     * alguien que no estaba en el mundo la última vez que se guardó.
     */
    const SAVE_WINDOW = 10 * 60 * 1000;

    /*
     * Decide qué jugadores cuentan y los reparte por dimensión. Hay dos formas de
     * que aparezca un jugador de más, y las dos se resuelven aquí:
     *
     * 1. El mismo humano está en el Player de level.dat y en su
     *    playerdata/<uuid>.dat. Los dos archivos no se escriben siempre en el
     *    mismo instante, así que comparar posiciones no vale: manda la fecha.
     *
     * 2. La carpeta playerdata/ guarda a todo el que haya pisado el mundo alguna
     *    vez, aunque fuera con otra cuenta hace meses. Esa gente no está dentro y
     *    no mantiene ningún chunk cargado, pero salía como un marcador más,
     *    clavado donde se desconectó. Se quedan solo los guardados a la vez que
     *    el más reciente.
     *
     * "level" es { player, mtime } o null; "data", la lista de { player, mtime }
     * salida de playerdata/. Deja en world.stalePlayers cuántos se han ignorado,
     * para que la interfaz pueda decirlo en vez de hacerlos desaparecer sin más.
     */
    function assignPlayers(world, level, data) {
        let elegidos;
        let ignorados = 0;

        if (!data.length) {
            // Mundo antiguo o sin playerdata: solo queda el de level.dat.
            elegidos = level ? [level.player] : [];
        } else {
            const ultimo = data.reduce((m, d) => Math.max(m, d.mtime), 0);
            const dentro = data.filter((d) => ultimo - d.mtime <= SAVE_WINDOW);
            ignorados = data.length - dentro.length;

            if (dentro.length > 1 || !level) {
                // Varios de verdad: el anfitrión, si lo hay, ya está entre ellos.
                elegidos = dentro.map((d) => d.player);
            } else {
                // Uno solo: gana la copia guardada más recientemente.
                elegidos = [dentro[0].mtime >= level.mtime ? dentro[0].player : level.player];
            }
        }

        world.stalePlayers = ignorados;
        for (const dim of world.dimensions.values()) dim.players = [];
        for (const pl of elegidos) getDim(world, pl.dimension).players.push(pl);
    }

    /* Lee la lista de ficheros (input webkitdirectory o drag&drop) y construye el mundo. */
    async function load(files, onProgress) {
        const world = {
            name: null,
            versionName: null,
            dataVersion: null,
            spawn: null,
            spawnChunkRadius: null, // gamerule leída del level.dat, si existe
            border: null, // world border del level.dat, en bloques
            stalePlayers: 0, // playerdata de gente que no estaba en el último guardado
            sidecarStamp: null, // huella de los poi/ y entities/ ya leídos
            lastPlayed: null,
            warnings: [],
            dimensions: new Map(),
        };

        const regionFiles = [];
        const forceloadFiles = [];
        const playerFiles = [];
        const poiFiles = [];
        const entityFiles = [];
        let levelDat = null;
        let levelPlayer = null; // { player, mtime }, resuelto junto al playerdata
        const dataPlayers = []; // ídem, uno por archivo de playerdata/

        for (const f of files) {
            const path = relPath(f);
            const lower = path.toLowerCase();
            // Se acepta tanto la ruta completa (carpeta) como archivos sueltos sin ruta.
            if (RE_LEVEL.test(lower)) {
                if (!levelDat || path.length < relPath(levelDat).length) levelDat = f;
            } else if (RE_POI.test(lower)) {
                poiFiles.push(f);
            } else if (RE_ENTITIES.test(lower)) {
                entityFiles.push(f);
            } else if (RE_REGION.test(lower) && !RE_SIDECAR.test(lower)) {
                regionFiles.push(f);
            } else if (RE_FORCED.test(lower)) {
                forceloadFiles.push(f);
            } else if (RE_PLAYER.test(lower)) {
                playerFiles.push(f);
            }
        }

        if (!levelDat && regionFiles.length === 0) {
            const err = new Error(I18n.t('error.noWorld'));
            err.i18nKey = 'error.noWorld';
            throw err;
        }

        const total =
            regionFiles.length +
            forceloadFiles.length +
            playerFiles.length +
            poiFiles.length +
            (levelDat ? 1 : 0);
        let done = 0;
        const tick = (label) => {
            done++;
            if (onProgress) onProgress(done, total, label);
        };

        // 1. level.dat
        if (levelDat) {
            try {
                const nbt = await NBT.parse(await readFile(levelDat));
                const d = nbt.value.Data || nbt.value;
                world.name = d.LevelName || null;
                world.versionName = (d.Version && d.Version.Name) || null;
                world.dataVersion = d.DataVersion != null ? Number(d.DataVersion) : null;
                world.lastPlayed = d.LastPlayed != null ? Number(d.LastPlayed) : null;
                if (d.SpawnX != null) {
                    world.spawn = {
                        x: Number(d.SpawnX),
                        y: Number(d.SpawnY || 0),
                        z: Number(d.SpawnZ),
                    };
                }
                const rules = d.GameRules || {};
                if (rules.spawnChunkRadius != null) {
                    const r = parseInt(rules.spawnChunkRadius, 10);
                    if (!isNaN(r)) world.spawnChunkRadius = r;
                }
                world.border = borderFromNBT(d);
                if (d.Player) {
                    const pl = playerFromNBT(d.Player, null, 'level.dat');
                    if (pl) levelPlayer = { player: pl, mtime: levelDat.lastModified || 0 };
                }
            } catch (e) {
                world.warnings.push({ file: 'level.dat', msg: e.message });
            }
            tick('level.dat');
        }

        // 2. forceload por dimensión
        for (const f of forceloadFiles) {
            const dim = getDim(world, dimensionOf(relPath(f)));
            try {
                await readForceload(f, dim);
            } catch (e) {
                world.warnings.push({ file: relPath(f), msg: e.message });
            }
            tick('forceload');
        }

        // 3. jugadores guardados
        for (const f of playerFiles) {
            try {
                const nbt = await NBT.parse(await readFile(f));
                const uuid = f.name.replace(/\.dat$/i, '');
                const pl = playerFromNBT(nbt.value, uuid.slice(0, 8) + '…', 'playerdata');
                if (pl) dataPlayers.push({ player: pl, mtime: f.lastModified || 0 });
            } catch (e) {
                world.warnings.push({ file: relPath(f), msg: e.message });
            }
            tick('playerdata');
        }
        assignPlayers(world, levelPlayer, dataPlayers);

        // 4. chunks generados (solo cabeceras de los .mca: rápido incluso en mundos grandes)
        for (const f of regionFiles) {
            const path = relPath(f);
            const m = f.name.match(RE_REGION_XZ);
            const dim = getDim(world, dimensionOf(path));
            dim.regionFiles++;
            if (m) {
                const rx = parseInt(m[1], 10),
                    rz = parseInt(m[2], 10);
                dim.regions.set(rx + ',' + rz, f);
                dim.regionStamp.set(rx + ',' + rz, stampOf(f));
                try {
                    await readRegionHeader(f, rx, rz, dim);
                } catch (e) {
                    world.warnings.push({ file: path, msg: e.message });
                }
            }
            tick(f.name);
        }

        // 5. chunk loaders: perlas en vuelo y entidades sobre un portal
        registerSidecars(world, poiFiles, entityFiles);
        for (const dim of world.dimensions.values()) {
            try {
                await readLoaders(dim, () => tick('poi'));
            } catch (e) {
                world.warnings.push({ file: dim.id + '/entities', msg: e.message });
            }
        }

        if (!world.dimensions.has('minecraft:overworld')) getDim(world, 'minecraft:overworld');
        return world;
    }

    /* Coloca los poi/ y entities/ en su dimensión, indexados por región. */
    function registerSidecars(world, poiFiles, entityFiles) {
        const meter = (files, campo) => {
            for (const f of files) {
                const m = f.name.match(RE_REGION_XZ);
                if (!m) continue;
                const dim = getDim(world, dimensionOf(relPath(f)));
                dim[campo].set(parseInt(m[1], 10) + ',' + parseInt(m[2], 10), f);
            }
        };
        meter(poiFiles, 'poiFiles');
        meter(entityFiles, 'entityFiles');
    }

    /*
     * Huella de un archivo. Minecraft reescribe el .mca entero al guardar, así
     * que fecha + tamaño bastan para saber si hay que releer su cabecera.
     */
    function stampOf(file) {
        return (file.lastModified || 0) + ':' + (file.size || 0);
    }

    /* Clasifica la lista de archivos igual que load(), sin leer nada todavía. */
    function classify(files) {
        const out = { level: null, regions: [], forced: [], players: [], poi: [], entities: [] };
        for (const f of files) {
            const path = relPath(f);
            const lower = path.toLowerCase();
            if (RE_LEVEL.test(lower)) {
                if (!out.level || path.length < relPath(out.level).length) out.level = f;
            } else if (RE_POI.test(lower)) {
                out.poi.push(f);
            } else if (RE_ENTITIES.test(lower)) {
                out.entities.push(f);
            } else if (RE_REGION.test(lower) && !RE_SIDECAR.test(lower)) {
                out.regions.push(f);
            } else if (RE_FORCED.test(lower)) {
                out.forced.push(f);
            } else if (RE_PLAYER.test(lower)) {
                out.players.push(f);
            }
        }
        return out;
    }

    /* Firma comparable de los jugadores: sirve para detectar que alguien se movió. */
    function playerSignature(world) {
        return JSON.stringify(
            Array.from(world.dimensions.values()).map((d) =>
                d.players.map((p) => [p.source, p.name, p.chunkX, p.chunkZ]),
            ),
        );
    }

    /*
     * Vuelve a leer un mundo ya cargado, en el sitio, y cuenta qué ha cambiado.
     *
     * Lo barato se relee siempre (level.dat, jugadores y forceload son unos pocos
     * KB); de los region files solo se releen los nuevos y aquellos cuya huella ha
     * cambiado, que es lo que hace viable repetirlo cada pocos segundos aunque el
     * mundo tenga miles de regiones.
     */
    async function refresh(files, world) {
        const sets = classify(files);
        const res = {
            newChunks: 0,
            touched: [], // regiones reescritas: { dim, rx, rz }
            newRegions: 0,
            playersMoved: false,
            forcedChanged: false,
            versionChanged: false,
            spawnChanged: false,
            loadersChanged: false,
        };
        world.warnings = [];

        // Foto de los jugadores antes de tocar nada: assignPlayers() rehace las
        // listas enteras, así que hay que capturarla aquí y no más abajo.
        const playersBefore = playerSignature(world);

        // 1. level.dat: versión, gamerules y spawn. Si el jugador ha vuelto a
        // entrar con otra versión, el radio de spawn chunks sale de aquí.
        let levelPlayer = null;
        if (sets.level) {
            const prevVer = world.dataVersion;
            const prevRadius = world.spawnChunkRadius;
            const prevSpawn = world.spawn ? world.spawn.x + ',' + world.spawn.z : null;
            try {
                const nbt = await NBT.parse(await readFile(sets.level));
                const d = nbt.value.Data || nbt.value;
                world.name = d.LevelName || world.name;
                world.versionName = (d.Version && d.Version.Name) || world.versionName;
                world.dataVersion = d.DataVersion != null ? Number(d.DataVersion) : null;
                world.lastPlayed = d.LastPlayed != null ? Number(d.LastPlayed) : world.lastPlayed;
                if (d.SpawnX != null) {
                    world.spawn = {
                        x: Number(d.SpawnX),
                        y: Number(d.SpawnY || 0),
                        z: Number(d.SpawnZ),
                    };
                }
                // Se reinicia antes de leer: si han quitado la gamerule, el mundo
                // debe volver al comportamiento clásico, no quedarse con el valor viejo.
                world.spawnChunkRadius = null;
                const rules = d.GameRules || {};
                if (rules.spawnChunkRadius != null) {
                    const r = parseInt(rules.spawnChunkRadius, 10);
                    if (!isNaN(r)) world.spawnChunkRadius = r;
                }
                world.border = borderFromNBT(d);
                if (d.Player) {
                    const pl = playerFromNBT(d.Player, null, 'level.dat');
                    if (pl) levelPlayer = { player: pl, mtime: sets.level.lastModified || 0 };
                }
            } catch (e) {
                world.warnings.push({ file: 'level.dat', msg: e.message });
            }
            res.versionChanged =
                world.dataVersion !== prevVer || world.spawnChunkRadius !== prevRadius;
            res.spawnChanged =
                (world.spawn ? world.spawn.x + ',' + world.spawn.z : null) !== prevSpawn;
        }

        /*
         * Los jugadores se releen siempre, haya level.dat o no, y se rehacen
         * enteros: es la única forma de ver que alguien ha cambiado de dimensión
         * y no solo de chunk.
         */
        const dataPlayers = [];
        for (const f of sets.players) {
            try {
                const nbt = await NBT.parse(await readFile(f));
                const uuid = f.name.replace(/\.dat$/i, '');
                const pl = playerFromNBT(nbt.value, uuid.slice(0, 8) + '…', 'playerdata');
                if (pl) dataPlayers.push({ player: pl, mtime: f.lastModified || 0 });
            } catch (e) {
                world.warnings.push({ file: relPath(f), msg: e.message });
            }
        }
        assignPlayers(world, levelPlayer, dataPlayers);
        res.playersMoved = playersBefore !== playerSignature(world);

        // 2. /forceload: se rehace la lista de cada dimensión.
        const forcedBefore = JSON.stringify(
            Array.from(world.dimensions.values()).map((d) => d.forced),
        );
        for (const dim of world.dimensions.values()) dim.forced = [];
        for (const f of sets.forced) {
            const dim = getDim(world, dimensionOf(relPath(f)));
            try {
                await readForceload(f, dim);
            } catch (e) {
                world.warnings.push({ file: relPath(f), msg: e.message });
            }
        }
        res.forcedChanged =
            forcedBefore !==
            JSON.stringify(Array.from(world.dimensions.values()).map((d) => d.forced));

        // 3. Regiones: solo las nuevas y las que el juego ha reescrito.
        for (const f of sets.regions) {
            const path = relPath(f);
            const m = f.name.match(RE_REGION_XZ);
            if (!m) continue;
            const rx = parseInt(m[1], 10),
                rz = parseInt(m[2], 10);
            const dim = getDim(world, dimensionOf(path));
            const k = rx + ',' + rz;
            const stamp = stampOf(f);
            if (!dim.regions.has(k)) {
                dim.regionFiles++;
                res.newRegions++;
            }
            /*
             * El File se reemplaza siempre, haya cambiado o no: el de la pasada
             * anterior apunta a una versión del archivo que el juego ya puede
             * haber reescrito, y leerlo daría error de lectura.
             */
            dim.regions.set(k, f);
            if (dim.regionStamp.get(k) === stamp) continue;
            dim.regionStamp.set(k, stamp);
            const antesN = dim.generated.size;
            try {
                await readRegionHeader(f, rx, rz, dim);
                res.newChunks += dim.generated.size - antesN;
                res.touched.push({ dim: dim.id, rx, rz });
            } catch (e) {
                world.warnings.push({ file: path, msg: e.message });
            }
        }

        // 4. Portales: releer un poi/ entero es caro, así que solo se rehace si
        // alguno de los archivos implicados ha cambiado de huella.
        const loadersAntes = loaderSignature(world);
        registerSidecars(world, sets.poi, sets.entities);
        const huella = sidecarSignature(sets);
        if (huella !== world.sidecarStamp) {
            world.sidecarStamp = huella;
            for (const dim of world.dimensions.values()) {
                try {
                    await readLoaders(dim, null);
                } catch (e) {
                    world.warnings.push({ file: dim.id + '/entities', msg: e.message });
                }
            }
        }
        res.loadersChanged = loadersAntes !== loaderSignature(world);

        return res;
    }

    /* Huella conjunta de los poi/ y entities/: si no cambia, no hay nada que releer. */
    function sidecarSignature(sets) {
        const h = [];
        for (const f of sets.poi) h.push(relPath(f) + '=' + stampOf(f));
        for (const f of sets.entities) h.push(relPath(f) + '=' + stampOf(f));
        h.sort();
        return h.join('|');
    }

    /* Firma comparable de los loaders, para detectar cambios en vivo. */
    function loaderSignature(world) {
        return JSON.stringify(
            Array.from(world.dimensions.values()).map((d) =>
                d.loaders.map((l) => [l.chunkX, l.chunkZ, l.kind, l.entities.length]),
            ),
        );
    }

    /*
     * Etiqueta del marcador en el mapa: solo la palabra "jugador". Junto al
     * punto azul no cabe más, y un UUID recortado ahí no dice nada.
     */
    function playerLabel() {
        return I18n.t('player.label');
    }

    /*
     * Nombre identificativo, para el tooltip y el selector "Ir a jugador…":
     * el UUID recortado del playerdata, o la etiqueta del level.dat en una
     * partida de un jugador. Es lo único que distingue a dos jugadores, porque
     * el save no guarda nombres, solo UUID.
     */
    function playerName(player) {
        return player.name || I18n.t('player.singleplayer');
    }

    global.WorldReader = { load, refresh, playerLabel, playerName, DIM_LABELS };
})(window);
