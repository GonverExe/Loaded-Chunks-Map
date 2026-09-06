/* Lectura de una carpeta de mundo de Minecraft (Java Edition) desde el navegador. */
(function (global) {
  'use strict';

  const DIM_LABELS = {
    'minecraft:overworld': 'Overworld',
    'minecraft:the_nether': 'Nether',
    'minecraft:the_end': 'End'
  };

  function readFile(file, start, end) {
    const blob = (start === undefined) ? file : file.slice(start, end);
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
    let m = p.match(/(?:^|\/)dimensions\/([a-z0-9_.-]+)\/([a-z0-9_./-]+?)\/(region|data|entities|poi)(?:\/|$)/);
    if (m) return m[1] + ':' + m[2];
    if (/(?:^|\/)dim-1(?:\/|$)/.test(p)) return 'minecraft:the_nether';
    if (/(?:^|\/)dim1(?:\/|$)/.test(p)) return 'minecraft:the_end';
    return 'minecraft:overworld';
  }

  function emptyDim(id) {
    return {
      id,
      label: DIM_LABELS[id] || id,
      generated: new Map(),   // "x,z" -> { x, z, mtime }
      forced: [],             // [{x,z}]
      players: [],            // [{name, x, z, y, source}]
      regionFiles: 0,
      lastPlayed: 0
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
      const off = (view.getUint8(i * 4) << 16) | (view.getUint8(i * 4 + 1) << 8) | view.getUint8(i * 4 + 2);
      const sectors = view.getUint8(i * 4 + 3);
      if (off === 0 || sectors === 0) continue;   // chunk no generado
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
      const x = Number(BigInt.asIntN(32, packed & 0xFFFFFFFFn));
      const z = Number(BigInt.asIntN(32, packed >> 32n));
      dim.forced.push({ x, z });
    }
  }

  function playerFromNBT(data, name, source) {
    const pos = data.Pos;
    if (!pos || pos.length < 3) return null;
    let dimId = data.Dimension;
    if (typeof dimId === 'number') {
      dimId = dimId === -1 ? 'minecraft:the_nether' : dimId === 1 ? 'minecraft:the_end' : 'minecraft:overworld';
    }
    if (typeof dimId !== 'string') dimId = 'minecraft:overworld';
    if (dimId.indexOf(':') === -1) dimId = 'minecraft:' + dimId;
    return {
      name,
      source,
      dimension: dimId,
      x: pos[0], y: pos[1], z: pos[2],
      chunkX: Math.floor(pos[0] / 16),
      chunkZ: Math.floor(pos[2] / 16)
    };
  }

  /* Lee la lista de ficheros (input webkitdirectory o drag&drop) y construye el mundo. */
  async function load(files, onProgress) {
    const world = {
      name: null,
      versionName: null,
      dataVersion: null,
      spawn: null,
      spawnChunkRadius: null,     // gamerule leída del level.dat, si existe
      lastPlayed: null,
      warnings: [],
      dimensions: new Map()
    };

    const regionFiles = [];
    const forceloadFiles = [];
    const playerFiles = [];
    let levelDat = null;

    for (const f of files) {
      const path = relPath(f);
      const lower = path.toLowerCase();
      // Se acepta tanto la ruta completa (carpeta) como archivos sueltos sin ruta.
      if (/(?:^|\/)level\.dat$/.test(lower)) {
        if (!levelDat || path.length < relPath(levelDat).length) levelDat = f;
      } else if (/r\.-?\d+\.-?\d+\.mca$/.test(lower) && !/(?:^|\/)(entities|poi)\//.test(lower)) {
        regionFiles.push(f);
      } else if (/(?:^|\/)chunks\.dat$/.test(lower)) {
        forceloadFiles.push(f);
      } else if (/(?:^|\/)[0-9a-f]{8}-[0-9a-f-]+\.dat$/.test(lower)) {
        playerFiles.push(f);
      }
    }

    if (!levelDat && regionFiles.length === 0) {
      const err = new Error(I18n.t('error.noWorld'));
      err.i18nKey = 'error.noWorld';
      throw err;
    }

    const total = regionFiles.length + forceloadFiles.length + playerFiles.length + (levelDat ? 1 : 0);
    let done = 0;
    const tick = (label) => { done++; if (onProgress) onProgress(done, total, label); };

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
          world.spawn = { x: Number(d.SpawnX), y: Number(d.SpawnY || 0), z: Number(d.SpawnZ) };
        }
        const rules = d.GameRules || {};
        if (rules.spawnChunkRadius != null) {
          const r = parseInt(rules.spawnChunkRadius, 10);
          if (!isNaN(r)) world.spawnChunkRadius = r;
        }
        if (d.Player) {
          const p = playerFromNBT(d.Player, null, 'level.dat');
          if (p) getDim(world, p.dimension).players.push(p);
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
        const p = playerFromNBT(nbt.value, uuid.slice(0, 8) + '…', 'playerdata');
        if (p) getDim(world, p.dimension).players.push(p);
      } catch (e) {
        world.warnings.push({ file: relPath(f), msg: e.message });
      }
      tick('playerdata');
    }

    // 4. chunks generados (solo cabeceras de los .mca: rápido incluso en mundos grandes)
    for (const f of regionFiles) {
      const path = relPath(f);
      const m = f.name.match(/r\.(-?\d+)\.(-?\d+)\.mca/i);
      const dim = getDim(world, dimensionOf(path));
      dim.regionFiles++;
      if (m) {
        try {
          await readRegionHeader(f, parseInt(m[1], 10), parseInt(m[2], 10), dim);
        } catch (e) {
          world.warnings.push({ file: path, msg: e.message });
        }
      }
      tick(f.name);
    }

    if (!world.dimensions.has('minecraft:overworld')) getDim(world, 'minecraft:overworld');
    return world;
  }

  /* Nombre visible de un jugador; el del level.dat se traduce al idioma activo. */
  function playerLabel(player) {
    return player.name || I18n.t('player.singleplayer');
  }

  global.WorldReader = { load, playerLabel, DIM_LABELS };
})(window);
