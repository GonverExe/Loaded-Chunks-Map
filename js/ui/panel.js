/*
 * Barra lateral: tarjetas del mundo, fuentes de carga, capas y resumen.
 *
 * Solo pinta lo que App le dice: no decide nada por su cuenta.
 */
(function (global) {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const { escapeHtml, num, mcFormat } = Fmt;

    /* Dimensiones con algo que enseñar primero. */
    function renderDimSelect() {
        const dims = Array.from(App.world.dimensions.values()).sort(
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
        if (!App.dim || !App.world.dimensions.has(App.dim.id)) App.dim = dims[0];
        sel.value = App.dim.id;
    }

    /*
     * Sin Web Workers (típico al abrir el archivo con doble clic) no hay terreno.
     * Fuera de ese caso el mapa siempre se pinta: ya no hay casilla para apagarlo.
     */
    let terrainSupported = true;

    function checkTerrainSupport() {
        terrainSupported = Terrain.probe();
        $('terrainMode').disabled = !terrainSupported;
        $('terrainNote').hidden = terrainSupported;
        $('terrainNote').innerHTML = terrainSupported ? '' : I18n.t('terrain.unavailable');
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

    function renderSpawnNote() {
        const st = App.spawnState();
        const version = App.world.versionName || App.world.dataVersion || '?';
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
            html = I18n.t('spawn.classic', { version: version, r: App.classicTicketRadius });
        }
        $('spawnNote').innerHTML = html;

        // Sin spawn chunks no hay nada que dibujar: la casilla queda inerte.
        const nada = !manual && st.radius === 0;
        $('srcSpawn').disabled = nada;
        $('srcSpawn').parentElement.style.opacity = nada ? 0.5 : '';
    }

    /* Cada fila trae su valor ya en HTML: el nombre pasa por los códigos §. */

    function renderWorldInfo() {
        const rows = [];
        if (App.world.name) {
            rows.push(['info.name', '<span class="mc">' + mcFormat(App.world.name) + '</span>']);
        }
        if (App.world.versionName) rows.push(['info.version', escapeHtml(App.world.versionName)]);
        if (App.world.lastPlayed)
            rows.push([
                'info.lastPlayed',
                escapeHtml(new Date(App.world.lastPlayed).toLocaleDateString(I18n.locale())),
            ]);
        $('worldInfo').innerHTML = rows
            .map(([k, v]) => '<dt>' + escapeHtml(I18n.t(k)) + '</dt><dd>' + v + '</dd>')
            .join('');
    }

    function renderWarnings() {
        const list = App.world.warnings;
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

    /*
     * ¿Se enseña al jugador? Solo si el mundo está abierto: alguien desconectado
     * no mantiene ningún chunk cargado, así que su posición guardada no es una
     * fuente de carga, es solo el sitio donde lo dejó.
     *
     * Cuando no se puede saber (navegador sin File System Access API, o mundo
     * cargado sin carpeta relegible) se enseña igual: es mejor eso que esconder
     * al jugador sin motivo.
     */

    /* Si el jugador está oculto por mundo cerrado, se dice; si no, estorba. */
    function renderPlayersNote() {
        const nota = $('playersNote');
        const oculto = !App.playersVisible();
        nota.hidden = !oculto;
        if (oculto) nota.textContent = I18n.t('note.playersClosed');
    }

    /*
     * Cuántos chunk loaders se han encontrado. Se dice siempre, porque un cero
     * también informa: evita pensar que el mapa no se ha enterado de alguno.
     */
    function renderLoaderNote() {
        const nota = $('loaderNote');
        const lista = App.dim ? App.dim.loaders : [];
        $('loaderRadiusRow').hidden = !lista.length;
        if (!lista.length) {
            nota.innerHTML = I18n.t('note.loaderNone');
            return;
        }
        const perlas = lista.filter((l) => l.kind === 'pearl').length;
        nota.innerHTML = I18n.t('note.loaderFound', {
            n: lista.length,
            pearls: perlas,
            portals: lista.length - perlas,
        });
    }

    function renderStats(loaded) {
        const s = ChunkModel.stats(loaded);
        const gen = App.dim.generated.size;
        const rows = [
            ['stats.loaded', num(s.total)],
            ['stats.entity', num(s.entity)],
            ['stats.ticking', num(s.ticking)],
            ['stats.border', num(s.border)],
            ['stats.generated', num(gen)],
            ['stats.regionFiles', App.dim.regionFiles],
            ['stats.forceload', App.dim.forced.length],
            ['stats.loaders', App.dim.loaders.length],
            ['stats.playersHere', App.dim.players.length],
        ];
        if (gen) rows.push(['stats.ratio', ((s.total / gen) * 100).toFixed(1) + ' %']);
        // Solo se enseña si hay alguno: si no, es una fila de ruido en todos los mundos.
        if (App.world.stalePlayers) rows.push(['stats.stalePlayers', App.world.stalePlayers]);
        $('statsInfo').innerHTML = rows
            .map(
                ([k, v]) =>
                    '<dt>' + escapeHtml(I18n.t(k)) + '</dt><dd>' + escapeHtml(String(v)) + '</dd>',
            )
            .join('');
    }

    /*
     * Único selector de destinos del mapa: el spawn del mundo y cada jugador de
     * la dimensión. Vuelve a su opción vacía en cuanto se usa, para que se pueda
     * repetir el mismo destino dos veces seguidas.
     */
    function renderPlayerSelect() {
        const sel = $('gotoPlayer');
        // Opción fantasma: da nombre al botón cerrado ("Ir a…") pero no
        // aparece como opción al desplegar la lista (hidden) ni se puede
        // volver a elegir a mano (disabled).
        sel.innerHTML =
            '<option value="" hidden disabled selected>' +
            escapeHtml(I18n.t('btn.goto')) +
            '</option>';
        // El spawn solo tiene sentido en el overworld: en las demás dimensiones
        // no hay ningún punto de aparición que enseñar.
        if (App.world.spawn && App.dim.id === 'minecraft:overworld') {
            const o = document.createElement('option');
            o.value = 'spawn';
            o.textContent = I18n.t('btn.gotoSpawn');
            sel.appendChild(o);
        }
        App.dim.players.forEach((p, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = WorldReader.playerName(p);
            sel.appendChild(o);
        });
        sel.disabled = sel.options.length === 1;
    }

    global.Panel = {
        renderDimSelect,
        checkTerrainSupport,
        checkStructureSupport,
        renderTerrainProgress,
        renderStructProgress,
        renderSpawnNote,
        renderWorldInfo,
        renderWarnings,
        renderPlayersNote,
        renderLoaderNote,
        renderStats,
        renderPlayerSelect,
        /* ¿Hay Web Workers y, por tanto, terreno que pintar? */
        terrainSupported: () => terrainSupported,
    };
})(window);
