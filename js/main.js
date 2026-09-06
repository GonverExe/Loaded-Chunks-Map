/* Pegamento de la interfaz: carga de archivos, controles y actualización del mapa. */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    /*
     * Spawn chunks según la versión del mundo:
     *  - 1.20.5 (DataVersion 3837) añadió la gamerule spawnChunkRadius, con valor
     *    por defecto 2 y rango 0-32; 0 los desactiva y 10 reproduce lo de antes.
     *  - 1.21.9 (snapshot 25w31a, DataVersion 4534) eliminó los spawn chunks.
     * El valor es el radio del ticket: con R quedan (2R-1)² chunks con entity
     * ticking, (2R+1)² con block ticking y (2R+3)² cargados.
     */
    const DV_GAMERULE_ADDED = 3837; // 1.20.5
    const DV_SPAWN_REMOVED = 4534; // 25w31a, camino de 1.21.9
    const CLASSIC_TICKET_RADIUS = 10; // equivale al comportamiento pre-1.20.5

    let world = null;
    let currentDim = null;
    let map = null;
    let lastErrorKey = null;

    const num = (n) => Number(n).toLocaleString(I18n.locale());

    /* ---------- Ajustes: tema e idioma ---------- */

    const SUN =
        '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>';
    const MOON = '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path>';

    function paintThemeButton() {
        const dark = Theme.current() === 'dark';
        // En oscuro se ofrece pasar a claro, y al revés.
        $('themeIcon').innerHTML = dark ? SUN : MOON;
        const key = dark ? 'settings.theme.toLight' : 'settings.theme.toDark';
        $('themeBtn').setAttribute('data-i18n-title', key);
        $('themeBtn').setAttribute('data-i18n-aria', key);
        $('themeBtn').title = I18n.t(key);
        $('themeBtn').setAttribute('aria-label', I18n.t(key));
    }

    /* El selector se rellena con los nombres nativos de cada idioma. */
    function paintLangSelect() {
        const sel = $('langSelect');
        if (!sel.options.length) {
            for (const code of I18n.langs) {
                const o = document.createElement('option');
                o.value = code;
                o.textContent = I18n.names[code] || code;
                sel.appendChild(o);
            }
        }
        sel.value = I18n.lang;
    }

    $('themeBtn').addEventListener('click', () => Theme.toggle());
    $('langSelect').addEventListener('change', (e) => I18n.set(e.target.value));

    Theme.onChange(() => {
        paintThemeButton();
        if (map) map.refreshTheme();
    });

    I18n.onChange(() => {
        paintLangSelect();
        paintThemeButton();
        if (lastErrorKey)
            $('dropHint').innerHTML =
                '<span class="err">' + escapeHtml(I18n.t(lastErrorKey)) + '</span>';
        if (world && currentDim) {
            renderWorldInfo();
            renderWarnings();
            renderDimSelect();
            renderSpawnNote();
            checkTerrainSupport();
            checkStructureSupport();
            renderStructList();
            renderLive();
            update(false); // recalcula los textos de cada chunk
        }
        if (map) map.refreshText();
    });

    /* ---------- Entrada de archivos ---------- */

    const drop = $('drop');
    /*
     * Con la File System Access API se pide un handle de la carpeta en vez de una
     * lista de File: es lo único que se puede releer y volver a listar más tarde,
     * y por tanto lo que hace posible el seguimiento en vivo. Sin ella se cae al
     * <input webkitdirectory> de siempre, que solo sirve para una foto fija.
     */
    $('pickDir').addEventListener('click', async () => {
        if (!Live.supported()) {
            $('dirInput').click();
            return;
        }
        let dir;
        try {
            dir = await Live.pickFolder();
        } catch (_) {
            return; // el usuario ha cancelado el diálogo
        }
        if (!dir) return;
        setLoading(true, I18n.t('loading.walking'));
        try {
            handleFiles(await Live.listFiles());
        } catch (err) {
            setLoading(false);
            $('dropHint').innerHTML = '<span class="err">' + escapeHtml(err.message) + '</span>';
        }
    });
    $('dirInput').addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));

    ['dragenter', 'dragover'].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            drop.classList.add('over');
        }),
    );
    ['dragleave', 'drop'].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            drop.classList.remove('over');
        }),
    );

    drop.addEventListener('drop', async (e) => {
        e.preventDefault();
        const items = Array.from(e.dataTransfer.items || []);
        /*
         * Los DataTransferItem dejan de valer en cuanto termina este manejador,
         * así que aquí se pide todo de golpe, antes del primer await: las
         * entradas del árbol clásico y las promesas de handle de Chromium.
         */
        const entries = items
            .map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry())
            .filter(Boolean);
        const handles = items
            .filter((i) => i.getAsFileSystemHandle)
            .map((i) => i.getAsFileSystemHandle());
        const sueltos = Array.from(e.dataTransfer.files || []);

        // Con handle se puede releer la carpeta más tarde: es la vía preferida.
        if (handles.length && (await Live.adoptHandles(handles))) {
            setLoading(true, I18n.t('loading.walking'));
            handleFiles(await Live.listFiles());
            return;
        }
        if (entries.length) {
            setLoading(true, I18n.t('loading.walking'));
            const files = [];
            for (const entry of entries) await walkEntry(entry, entry.name, files);
            handleFiles(files);
        } else {
            handleFiles(sueltos);
        }
    });

    function walkEntry(entry, path, out) {
        return new Promise((resolve) => {
            if (entry.isFile) {
                entry.file((file) => {
                    try {
                        Object.defineProperty(file, 'webkitRelativePath', { value: path });
                    } catch (_) {}
                    out.push(file);
                    resolve();
                }, resolve);
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                const all = [];
                const readBatch = () =>
                    reader.readEntries(async (batch) => {
                        if (!batch.length) {
                            for (const child of all)
                                await walkEntry(child, path + '/' + child.name, out);
                            resolve();
                            return;
                        }
                        all.push(...batch);
                        readBatch();
                    }, resolve);
                readBatch();
            } else resolve();
        });
    }

    async function handleFiles(files) {
        if (!files || !files.length) return;
        setLoading(true, I18n.t('loading.reading'));
        try {
            world = await WorldReader.load(files, (done, total, label) => {
                setProgress(
                    done / total,
                    I18n.t('loading.file', { file: label, done: done, total: total }),
                );
            });
            lastErrorKey = null;
        } catch (err) {
            setLoading(false);
            lastErrorKey = err.i18nKey || null;
            $('dropHint').innerHTML = '<span class="err">' + escapeHtml(err.message) + '</span>';
            return;
        }
        setLoading(false);
        showWorld();
    }

    /* ---------- Estado de carga ---------- */

    function setLoading(on, text) {
        $('loading').hidden = !on;
        if (text) $('loadingText').textContent = text;
        if (!on) $('bar').style.width = '0%';
    }
    function setProgress(frac, text) {
        $('bar').style.width = Math.round(frac * 100) + '%';
        $('loadingText').textContent = text;
    }

    /* ---------- Pintar la aplicación ---------- */

    function showWorld() {
        $('app').hidden = false;
        if (!map) {
            map = new ChunkMap($('map'), $('tooltip'));
            Terrain.onTile = () => map.draw();
            Terrain.onProgress = renderTerrainProgress;
            Structures.onScan = () => {
                renderStructList(); // los contadores suben según se escanea
                map.draw();
            };
            Structures.onProgress = renderStructProgress;
            Live.onTick = renderLive;
            Live.onUpdate = onLiveUpdate;
            Live.onError = onLiveError;
            buildStructList();
        }
        checkTerrainSupport();
        checkStructureSupport();
        renderLive();

        // El radio sale de la versión y de las gamerules del propio mundo.
        $('spawnManual').checked = false;
        $('spawnRadiusRow').hidden = true;
        $('spawnRadius').value = spawnState().radius;

        currentDim = null;
        renderDimSelect();
        renderSpawnNote();
        renderWorldInfo();
        renderWarnings();
        update(true);
        $('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* Dimensiones con algo que enseñar primero. */
    function renderDimSelect() {
        const dims = Array.from(world.dimensions.values()).sort(
            (a, b) => b.generated.size + b.forced.length - (a.generated.size + a.forced.length),
        );
        const sel = $('dimSelect');
        sel.innerHTML = '';
        for (const d of dims) {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = I18n.t('dim.option', { label: d.label, n: num(d.generated.size) });
            sel.appendChild(opt);
        }
        if (!currentDim || !world.dimensions.has(currentDim.id)) currentDim = dims[0];
        sel.value = currentDim.id;
    }

    /* Sin Web Workers (típico al abrir el archivo con doble clic) no hay terreno. */
    function checkTerrainSupport() {
        const ok = Terrain.probe();
        $('layerTerrain').disabled = !ok;
        $('terrainMode').disabled = !ok;
        if (!ok) $('layerTerrain').checked = false;
        $('terrainNote').hidden = ok;
        $('terrainNote').innerHTML = ok ? '' : I18n.t('terrain.unavailable');
    }

    function renderTerrainProgress(done, total) {
        const el = $('terrainStatus');
        if (!total || done >= total) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        $('terrainStatusText').textContent = I18n.t('terrain.rendering', {
            done: done,
            total: total,
        });
        $('terrainStatusBar').style.width = Math.round((done / total) * 100) + '%';
    }

    /* Las estructuras usan workers igual que el terreno: sin ellos, nada que hacer. */
    function checkStructureSupport() {
        const ok = Structures.isAvailable() && Terrain.probe();
        $('structBtn').disabled = !ok;
        $('structNote').innerHTML = ok ? I18n.t('struct.hint') : I18n.t('struct.unavailable');
    }

    function renderStructProgress(done, total) {
        const el = $('structStatus');
        if (!total || done >= total) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        $('structStatusText').textContent = I18n.t('struct.scanning', { done: done, total: total });
        $('structStatusBar').style.width = Math.round((done / total) * 100) + '%';
    }

    /* ---------- Desplegable de estructuras ---------- */

    /* Una fila por familia. Se construye una sola vez; luego solo se refrescan
       los nombres y los contadores. */
    function buildStructList() {
        const cont = $('structList');
        cont.innerHTML = '';
        for (const fam of Structures.families()) {
            const label = document.createElement('label');
            label.className = 'chk';
            label.dataset.family = fam.id;

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.family = fam.id;
            input.addEventListener('change', onStructChange);

            const icon = document.createElement('span');
            icon.className = 'sicon';
            icon.innerHTML = StructureIcons.markup(fam.id, fam.color);

            const name = document.createElement('span');
            name.className = 'sname';

            const count = document.createElement('span');
            count.className = 'scount';

            label.append(input, icon, name, count);
            cont.appendChild(label);
        }
        renderStructList();
    }

    /* Nombres traducidos y cuántas se han encontrado hasta ahora. */
    function renderStructList() {
        for (const label of $('structList').children) {
            const fam = label.dataset.family;
            const n = Structures.count(fam);
            label.querySelector('.sname').textContent = I18n.t('struct.' + fam);
            label.querySelector('.scount').textContent = n ? String(n) : '';
            label.classList.toggle('empty', n === 0);
        }
    }

    /* Marca la casilla maestra: llena, vacía o a medias. */
    function syncStructAll() {
        const boxes = Array.from($('structList').querySelectorAll('input'));
        const on = boxes.filter((b) => b.checked).length;
        const all = $('structAll');
        all.checked = on === boxes.length && on > 0;
        all.indeterminate = on > 0 && on < boxes.length;
    }

    function onStructChange() {
        const on = Array.from($('structList').querySelectorAll('input'))
            .filter((b) => b.checked)
            .map((b) => b.dataset.family);
        Structures.setEnabled(on);
        syncStructAll();
        if (map) map.draw();
    }

    $('structAll').addEventListener('change', (e) => {
        for (const b of $('structList').querySelectorAll('input')) b.checked = e.target.checked;
        onStructChange();
    });

    function toggleStructMenu(open) {
        const menu = $('structMenu');
        const abierto = open === undefined ? $('structPanel').hidden : open;
        $('structPanel').hidden = !abierto;
        menu.classList.toggle('open', abierto);
        $('structBtn').setAttribute('aria-expanded', String(abierto));
    }

    $('structBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStructMenu();
    });
    // Clic fuera o Escape: se cierra.
    document.addEventListener('click', (e) => {
        if (!$('structPanel').hidden && !$('structMenu').contains(e.target))
            toggleStructMenu(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('structPanel').hidden) toggleStructMenu(false);
    });

    /*
     * Qué spawn chunks tiene este mundo, deducido de su versión y sus gamerules.
     * kind: gamerule | disabled | classic | removed
     */
    function spawnState() {
        const dv = world.dataVersion || 0;
        if (dv >= DV_SPAWN_REMOVED) return { kind: 'removed', radius: 0 };
        const r = world.spawnChunkRadius;
        if (r != null) return { kind: r === 0 ? 'disabled' : 'gamerule', radius: r };
        return { kind: 'classic', radius: CLASSIC_TICKET_RADIUS };
    }

    function renderSpawnNote() {
        const st = spawnState();
        const version = world.versionName || world.dataVersion || '?';
        const manual = $('spawnManual').checked;
        const r = manual ? parseInt($('spawnRadius').value, 10) : st.radius;
        let html;
        if (manual) {
            html = I18n.t('spawn.manualNote', { side: Math.max(0, r * 2 - 1) });
        } else if (st.kind === 'removed') {
            html = I18n.t('spawn.removed', { version: version });
        } else if (st.kind === 'disabled') {
            html = I18n.t('spawn.disabled', { version: version });
        } else if (st.kind === 'gamerule') {
            html = I18n.t('spawn.gamerule', {
                version: version,
                r: st.radius,
                side: st.radius * 2 - 1,
            });
        } else {
            html = I18n.t('spawn.classic', { version: version, r: CLASSIC_TICKET_RADIUS });
        }
        $('spawnNote').innerHTML = html;

        // Sin spawn chunks no hay nada que dibujar: la casilla queda inerte.
        const nada = !manual && st.radius === 0;
        $('srcSpawn').disabled = nada;
        $('srcSpawn').parentElement.style.opacity = nada ? 0.5 : '';
    }

    function renderWorldInfo() {
        const rows = [];
        if (world.name) rows.push(['info.name', world.name]);
        if (world.versionName) rows.push(['info.version', world.versionName]);
        if (world.dataVersion) rows.push(['info.dataVersion', world.dataVersion]);
        if (world.spawn) rows.push(['info.spawn', world.spawn.x + ', ' + world.spawn.z]);
        if (world.lastPlayed)
            rows.push([
                'info.lastPlayed',
                new Date(world.lastPlayed).toLocaleDateString(I18n.locale()),
            ]);
        rows.push(['info.dimensions', world.dimensions.size]);
        $('worldInfo').innerHTML = rows
            .map(
                ([k, v]) =>
                    '<dt>' + escapeHtml(I18n.t(k)) + '</dt><dd>' + escapeHtml(String(v)) + '</dd>',
            )
            .join('');
    }

    function renderWarnings() {
        const list = world.warnings;
        $('warnCard').hidden = list.length === 0;
        $('warnList').innerHTML = list
            .map(
                (w) =>
                    '<li>' +
                    escapeHtml(I18n.t('warn.read', { file: w.file, msg: w.msg })) +
                    '</li>',
            )
            .join('');
    }

    function options() {
        return {
            // Radio de ticket: el detectado en el mundo, salvo ajuste manual.
            spawnRadius: $('spawnManual').checked
                ? parseInt($('spawnRadius').value, 10)
                : spawnState().radius,
            simulationDistance: parseInt($('simDist').value, 10),
            useSpawn: $('srcSpawn').checked,
            usePlayers: $('srcPlayers').checked,
            useForceload: $('srcForce').checked,
        };
    }

    function update(fit) {
        if (!world || !currentDim) return;
        const opts = options();
        // El slider manual muestra el área con entity ticking: (2R-1)².
        $('spawnRadiusOut').textContent = I18n.t('ctl.chunksGrid', {
            n: opts.spawnRadius,
            side: Math.max(0, opts.spawnRadius * 2 - 1),
        });
        renderSpawnNote();
        $('simDistOut').textContent = I18n.t('ctl.chunksGrid', {
            n: opts.simulationDistance,
            side: opts.simulationDistance * 2 + 1,
        });

        Terrain.setMode($('terrainMode').value);
        const loaded = ChunkModel.compute(world, currentDim, opts);
        map.layers = {
            terrain: $('layerTerrain').checked,
            generated: false, // capa retirada: el relleno gris tapaba el terreno
            activity: $('layerActivity').checked,
            loaded: $('layerLoaded').checked,
            markers: $('layerMarkers').checked,
            grid: $('layerGrid').checked,
        };
        Structures.setDimension(currentDim);
        map.setData(world, currentDim, loaded);
        if (fit) map.fit();
        renderStats(loaded);
        renderPlayerSelect();
    }

    function renderStats(loaded) {
        const s = ChunkModel.stats(loaded);
        const gen = currentDim.generated.size;
        const rows = [
            ['stats.loaded', num(s.total)],
            ['stats.entity', num(s.entity)],
            ['stats.ticking', num(s.ticking)],
            ['stats.border', num(s.border)],
            ['stats.generated', num(gen)],
            ['stats.regionFiles', currentDim.regionFiles],
            ['stats.forceload', currentDim.forced.length],
            ['stats.playersHere', currentDim.players.length],
        ];
        if (gen) rows.push(['stats.ratio', ((s.total / gen) * 100).toFixed(1) + ' %']);
        $('statsInfo').innerHTML = rows
            .map(
                ([k, v]) =>
                    '<dt>' + escapeHtml(I18n.t(k)) + '</dt><dd>' + escapeHtml(String(v)) + '</dd>',
            )
            .join('');
    }

    function renderPlayerSelect() {
        const sel = $('gotoPlayer');
        sel.innerHTML = '<option value="">' + escapeHtml(I18n.t('btn.gotoPlayer')) + '</option>';
        currentDim.players.forEach((p, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = WorldReader.playerName(p);
            sel.appendChild(o);
        });
        sel.disabled = currentDim.players.length === 0;
    }

    /* ---------- Seguimiento en vivo ---------- */

    let liveMsg = null; // último resumen, para no perderlo al repintar

    /*
     * Estado del botón central. Tiene tres situaciones: no se puede (navegador
     * sin File System Access API), parado, y siguiendo con cuenta atrás.
     */
    function renderLive(secondsLeft) {
        const btn = $('liveBtn');
        const nota = $('liveNote');
        const on = Live.running();

        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));

        if (!Live.supported()) {
            btn.disabled = true;
            $('liveLabel').textContent = I18n.t('live.start');
            nota.textContent = I18n.t('live.unsupported');
            nota.classList.add('warn');
            return;
        }
        btn.disabled = false;
        nota.classList.remove('warn');

        if (!on) {
            $('liveLabel').textContent = I18n.t('live.start');
            nota.textContent =
                liveMsg || (Live.hasFolder() ? I18n.t('live.note') : I18n.t('live.pick'));
            return;
        }
        const s = secondsLeft == null ? Live.INTERVAL / 1000 : secondsLeft;
        $('liveLabel').textContent =
            s > 0 ? I18n.t('live.next', { s: s }) : I18n.t('live.checking');
        nota.textContent = liveMsg || I18n.t('live.note');
    }

    /*
     * Resumen de una pasada. Las regiones que el juego ha reescrito se invalidan
     * en el terreno y en las estructuras para que se vuelvan a leer; si no, el
     * mapa seguiría enseñando la tesela vieja.
     */
    function onLiveUpdate(res) {
        if (!res) return;
        for (const r of res.touched) {
            if (currentDim && r.dim !== currentDim.id) continue;
            Terrain.invalidate(r.rx, r.rz);
            Structures.invalidate(r.rx, r.rz);
        }

        const partes = [];
        if (res.newChunks > 0) partes.push(I18n.t('live.changed', { chunks: num(res.newChunks) }));
        if (res.playersMoved) partes.push(I18n.t('live.moved'));
        if (res.forcedChanged) partes.push(I18n.t('live.forced'));
        if (res.versionChanged || res.spawnChanged) partes.push(I18n.t('live.version'));
        const hora = new Date().toLocaleTimeString(I18n.locale());
        liveMsg =
            (partes.length ? partes.join(' · ') : I18n.t('live.nochange')) +
            ' — ' +
            I18n.t('live.at', { time: hora });

        // El radio de spawn puede haber cambiado de versión: se relee del mundo.
        if (res.versionChanged) $('spawnRadius').value = spawnState().radius;
        renderWorldInfo();
        renderWarnings();
        renderDimSelect();
        renderSpawnNote();
        update(false);
        renderLive();
    }

    function onLiveError(err) {
        liveMsg = I18n.t('live.failed', { msg: err && err.message ? err.message : '?' });
        renderLive();
    }

    $('liveBtn').addEventListener('click', async () => {
        if (Live.running()) {
            Live.stop();
            liveMsg = null;
            renderLive();
            return;
        }
        // Sin carpeta relegible (mundo cargado por arrastre en un navegador sin
        // handles) hay que pedirla una vez.
        if (!Live.hasFolder()) {
            try {
                if (!(await Live.pickFolder())) return;
            } catch (_) {
                return; // diálogo cancelado
            }
        }
        $('liveBtn').classList.add('busy');
        const ok = await Live.start(() => world);
        $('liveBtn').classList.remove('busy');
        if (!ok) liveMsg = I18n.t('live.denied');
        renderLive();
    });

    /* ---------- Controles ---------- */

    [
        'srcSpawn',
        'srcPlayers',
        'srcForce',
        'spawnRadius',
        'simDist',
        'spawnManual',
        'layerTerrain',
        'terrainMode',
        'layerActivity',
        'layerLoaded',
        'layerMarkers',
        'layerGrid',
    ].forEach((id) => $(id).addEventListener('input', () => update(false)));

    $('spawnManual').addEventListener('change', (e) => {
        $('spawnRadiusRow').hidden = !e.target.checked;
        if (e.target.checked) $('spawnRadius').value = spawnState().radius;
    });

    $('dimSelect').addEventListener('change', (e) => {
        currentDim = world.dimensions.get(e.target.value);
        update(true);
    });

    $('fit').addEventListener('click', () => map.fit());

    $('gotoSpawn').addEventListener('click', () => {
        if (!world.spawn) return;
        map.centerOn(
            Math.floor(world.spawn.x / 16),
            Math.floor(world.spawn.z / 16),
            Math.max(map.scale, 6),
        );
    });

    $('gotoPlayer').addEventListener('change', (e) => {
        const p = currentDim.players[parseInt(e.target.value, 10)];
        if (p) map.centerOn(p.chunkX, p.chunkZ, Math.max(map.scale, 6));
        e.target.value = '';
    });

    $('png').addEventListener('click', () => {
        const a = document.createElement('a');
        a.download = ((world.name || 'world') + '-' + currentDim.label + '-chunks.png').replace(
            /[^\w.-]+/g,
            '_',
        );
        a.href = $('map').toDataURL('image/png');
        a.click();
    });

    $('reset').addEventListener('click', () => {
        Live.forget();
        renderLive();
        world = null;
        currentDim = null;
        $('app').hidden = true;
        $('dirInput').value = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    function escapeHtml(s) {
        return String(s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
        );
    }

    /* ---------- Arranque ---------- */

    I18n.apply();
    Theme.paint();
    paintLangSelect();
    paintThemeButton();
    $('loadingText').textContent = I18n.t('loading.reading');
})();
