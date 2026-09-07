/*
 * Estado compartido de la interfaz.
 *
 * Aquí viven el mundo cargado, la dimensión que se mira y el mapa, más las
 * operaciones que tocan a todos: leer los controles, recalcular los chunks y
 * montar o desmontar la aplicación. Los demás módulos de ui/ se cuelgan de
 * este objeto en vez de llamarse entre ellos.
 */
(function (global) {
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

    const App = {
        world: null, // mundo cargado, tal como lo deja WorldReader
        dim: null, // dimensión que se está mirando
        map: null, // instancia de ChunkMap, una para toda la sesión
        lastErrorKey: null, // último error de carga, para repetirlo al cambiar de idioma
        // El radio clásico lo necesita también la nota de la barra lateral.
        classicTicketRadius: CLASSIC_TICKET_RADIUS,
    };

    /* ---------- Estado de carga ---------- */

    App.setLoading = function (on, text) {
        $('loading').hidden = !on;
        if (text) $('loadingText').textContent = text;
        if (!on) $('bar').style.width = '0%';
    };
    App.setProgress = function (frac, text) {
        $('bar').style.width = Math.round(frac * 100) + '%';
        $('loadingText').textContent = text;
    };

    /*
     * Qué spawn chunks tiene este mundo, deducido de su versión y sus gamerules.
     * kind: gamerule | disabled | classic | removed
     */
    App.spawnState = function () {
        const dv = App.world.dataVersion || 0;
        if (dv >= DV_SPAWN_REMOVED) return { kind: 'removed', radius: 0 };
        const r = App.world.spawnChunkRadius;
        if (r != null) return { kind: r === 0 ? 'disabled' : 'gamerule', radius: r };
        return { kind: 'classic', radius: CLASSIC_TICKET_RADIUS };
    };

    App.playersVisible = function () {
        return !window.Live || Live.openState() !== 'closed';
    };

    App.options = function () {
        return {
            // Radio de ticket: el detectado en el mundo, salvo ajuste manual.
            spawnRadius: $('spawnManual').checked
                ? parseInt($('spawnRadius').value, 10)
                : App.spawnState().radius,
            simulationDistance: parseInt($('simDist').value, 10),
            loaderRadius: parseInt($('loaderRadius').value, 10),
            useSpawn: $('srcSpawn').checked,
            usePlayers: $('srcPlayers').checked && App.playersVisible(),
            useForceload: $('srcForce').checked,
            // Un loader solo carga con el mundo abierto: si nadie juega, no hay ticket.
            useLoaders: $('srcLoaders').checked && App.playersVisible(),
        };
    };

    App.update = function (fit) {
        if (!App.world || !App.dim) return;
        const opts = App.options();
        // El slider manual muestra el área con entity ticking: (2R-1)².
        $('spawnRadiusOut').textContent = I18n.t('ctl.chunksGrid', {
            n: opts.spawnRadius,
            side: Math.max(0, opts.spawnRadius * 2 - 1),
        });
        Panel.renderSpawnNote();
        Panel.renderPlayersNote();
        $('simDistOut').textContent = I18n.t('ctl.chunksGrid', {
            n: opts.simulationDistance,
            side: opts.simulationDistance * 2 + 1,
        });
        $('loaderRadiusOut').textContent = I18n.t('ctl.chunksGrid', {
            n: opts.loaderRadius,
            side: opts.loaderRadius * 2 + 1,
        });
        Panel.renderLoaderNote();

        Terrain.setMode($('terrainMode').value);
        const loaded = ChunkModel.compute(App.world, App.dim, opts);
        App.map.layers = {
            terrain: Panel.terrainSupported(),
            generated: false, // capa retirada: el relleno gris tapaba el terreno
            activity: false, // capa retirada de la interfaz: siempre apagada
            loaded: $('layerLoaded').checked,
            markers: $('layerMarkers').checked,
            players: App.playersVisible(),
            grid: $('layerGrid').checked,
        };
        Structures.setDimension(App.dim);
        App.map.setData(App.world, App.dim, loaded);
        if (fit) App.map.fit();
        Panel.renderStats(loaded);
        Panel.renderPlayerSelect();
    };

    /* ---------- Pintar la aplicación ---------- */

    App.showWorld = function () {
        $('hero').hidden = true;
        $('app').hidden = false;
        if (!App.map) {
            App.map = new ChunkMap($('map'), $('tooltip'));
            Terrain.onTile = () => App.map.draw();
            Terrain.onProgress = Panel.renderTerrainProgress;
            Structures.onScan = () => {
                StructMenu.render(); // los contadores suben según se escanea
                App.map.draw();
            };
            Structures.onProgress = Panel.renderStructProgress;
            Live.onTick = LiveStatus.render;
            Live.onUpdate = LiveStatus.onUpdate;
            Live.onError = LiveStatus.onError;
            StructMenu.build();
        }
        Panel.checkTerrainSupport();
        Panel.checkStructureSupport();
        LiveStatus.start();

        // El radio sale de la versión y de las gamerules del propio mundo.
        $('spawnManual').checked = false;
        $('spawnRadiusRow').hidden = true;
        $('spawnRadius').value = App.spawnState().radius;

        App.dim = null;
        Panel.renderDimSelect();
        Panel.renderSpawnNote();
        Panel.renderWorldInfo();
        Panel.renderWarnings();
        App.update(true);
        $('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    global.App = App;
})(window);
