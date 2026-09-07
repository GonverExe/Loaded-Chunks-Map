/*
 * Arranque: engancha los controles que repintan el mapa y deja la página lista.
 *
 * Todo lo demás vive en los módulos de js/ui/; aquí solo queda el cableado.
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const { stripFormat } = Fmt;

    /* ---------- Controles ---------- */

    [
        'srcSpawn',
        'srcPlayers',
        'srcForce',
        'srcLoaders',
        'loaderRadius',
        'spawnRadius',
        'simDist',
        'spawnManual',
        'terrainMode',
        'layerLoaded',
        'layerMarkers',
        'layerGrid',
    ].forEach((id) => $(id).addEventListener('input', () => App.update(false)));

    $('spawnManual').addEventListener('change', (e) => {
        $('spawnRadiusRow').hidden = !e.target.checked;
        if (e.target.checked) $('spawnRadius').value = App.spawnState().radius;
    });

    $('dimSelect').addEventListener('change', (e) => {
        App.dim = App.world.dimensions.get(e.target.value);
        App.update(true);
    });

    $('gotoPlayer').addEventListener('change', (e) => {
        const destino = e.target.value;
        const zoom = Math.max(App.map.scale, 6);
        if (destino === 'spawn') {
            if (App.world.spawn) {
                App.map.centerOn(
                    Math.floor(App.world.spawn.x / 16),
                    Math.floor(App.world.spawn.z / 16),
                    zoom,
                );
            }
        } else {
            const p = App.dim.players[parseInt(destino, 10)];
            if (p) App.map.centerOn(p.chunkX, p.chunkZ, zoom);
        }
        e.target.value = '';
    });

    $('png').addEventListener('click', () => {
        const a = document.createElement('a');
        a.download = (
            (stripFormat(App.world.name || '') || 'world') +
            '-' +
            App.dim.label +
            '-chunks.png'
        ).replace(/[^\w.-]+/g, '_');
        a.href = $('map').toDataURL('image/png');
        a.click();
    });

    $('reset').addEventListener('click', () => {
        Live.forget();
        LiveStatus.render();
        App.world = null;
        App.dim = null;
        $('app').hidden = true;
        $('hero').hidden = false;
        $('dirInput').value = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    /* ---------- Arranque ---------- */

    I18n.apply();
    Theme.paint();
    Settings.paintLangSelect();
    Settings.paintThemeButton();
    $('loadingText').textContent = I18n.t('loading.reading');
})();
