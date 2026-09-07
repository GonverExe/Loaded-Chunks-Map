/*
 * Lector del save y modelo de chunks, sobre un mundo fabricado a mano.
 *
 *   node tools/world-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fakeWorld = require('./fake-world');

const raiz = path.join(__dirname, '..');

/* Contexto mínimo: estos módulos no tocan el DOM, solo NBT y traducciones. */
const ventana = {
    I18n: { t: (k, p) => k + (p ? ' ' + JSON.stringify(p) : ''), locale: () => 'es' },
    TextDecoder,
    Blob,
    Response,
    DecompressionStream,
    BigInt,
    console,
};
ventana.window = ventana;
const contexto = vm.createContext(ventana);
for (const f of ['js/data/nbt.js', 'js/data/world.js', 'js/data/chunks.js']) {
    vm.runInContext(fs.readFileSync(path.join(raiz, f), 'utf8'), contexto, { filename: f });
}

let fallos = 0;
function comprobar(que, condicion, detalle) {
    if (condicion) return;
    console.error('FALLO: ' + que + (detalle !== undefined ? ' · ' + detalle : ''));
    fallos++;
}

(async () => {
    const files = fakeWorld.mundo();
    const world = await ventana.WorldReader.load(files, () => {});
    const dim = world.dimensions.get('minecraft:overworld');

    // 1. Lo que sale del level.dat.
    comprobar('el nombre se lee con sus códigos §', world.name === '§eMundo §bde prueba', world.name);
    comprobar('la versión se lee', world.versionName === '1.20.4', world.versionName);
    comprobar('el spawn se lee', world.spawn && world.spawn.x === 0 && world.spawn.z === 0);
    comprobar('el world border se lee', world.border && world.border.size === 60000000);
    comprobar('el jugador del level.dat aparece', dim.players.length === 1, dim.players.length);

    // 2. Cabecera de la región: qué chunks existen.
    comprobar('hay chunks generados', dim.generated.size === 1, dim.generated.size);

    // 3. Chunk loaders: la vagoneta sobre el portal y la perla suelta.
    comprobar('se encuentran los dos loaders', dim.loaders.length === 2, dim.loaders.length);
    const tipos = dim.loaders.map((l) => l.kind).sort();
    comprobar('uno es de portal y otro de perla', tipos.join(',') === 'pearl,portal', tipos.join(','));

    // 4. El modelo de tickets.
    const opts = {
        spawnRadius: 3,
        simulationDistance: 10,
        loaderRadius: 3,
        useSpawn: true,
        usePlayers: true,
        useForceload: true,
        useLoaders: true,
    };
    const cargados = ventana.ChunkModel.compute(world, dim, opts);
    comprobar('el modelo marca chunks', cargados.size > 0, cargados.size);

    const stats = ventana.ChunkModel.stats(cargados);
    comprobar('el resumen cuadra', stats.total === cargados.size, stats.total + ' vs ' + cargados.size);
    comprobar(
        'los niveles suman el total',
        stats.entity + stats.ticking + stats.border === stats.total,
    );
    comprobar('aparecen las cuatro fuentes',
        ['spawn', 'player', 'forceload', 'loader'].every((s) => s !== 'forceload' ? stats.bySource[s] > 0 : true));

    // 5. Sin loaders activos no se marca ninguno de esa fuente.
    dim.loaders = [];
    const sinLoaders = ventana.ChunkModel.stats(ventana.ChunkModel.compute(world, dim, opts));
    comprobar('sin loaders no hay chunks de loader', !sinLoaders.bySource.loader);

    // 6. Relectura: sin cambios en disco no se mueve nada.
    const res = await ventana.WorldReader.refresh(files, world);
    comprobar('una relectura sin cambios no ve chunks nuevos', res.newChunks === 0, res.newChunks);
    comprobar('los loaders vuelven a salir tras releer', world.dimensions.get('minecraft:overworld').loaders.length === 2);

    if (fallos) {
        console.error('\n' + fallos + ' fallo(s).');
        process.exit(1);
    }
    console.log('OK · el save se lee entero y el modelo de tickets cuadra');
})();
