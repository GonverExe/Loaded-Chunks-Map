/*
 * Cola de teselas del terreno. Comprueba lo que costó encontrar: que una región
 * ilegible no se pida en bucle y que ningún trabajo se quede pendiente para
 * siempre, ni porque el worker muera ni porque no conteste.
 *
 * Tarda unos 25 s: espera de verdad a que venza el tope de tiempo de un trabajo.
 *
 *   node tools/terrain-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');

/* Cómo se comporta cada región: contesta, revienta el worker o se calla. */
const politica = { '2,0': 'muere', '3,0': 'callado' };
let creados = 0;
let terminados = 0;

class WorkerFalso {
    constructor() {
        creados++;
        this.muerto = false;
        this.onmessage = null;
        this.onerror = null;
    }
    postMessage(msg) {
        const modo = politica[msg.rx + ',' + msg.rz] || 'ok';
        if (modo === 'callado') return;
        setTimeout(() => {
            if (this.muerto) return;
            if (modo === 'muere') {
                this.muerto = true;
                if (this.onerror) this.onerror({ message: 'boom' });
                return;
            }
            this.onmessage({
                data: {
                    rx: msg.rx,
                    rz: msg.rz,
                    mode: msg.mode,
                    ok: true,
                    pixels: new Uint8ClampedArray(4),
                    painted: new Uint8Array(1024),
                    chunks: 1,
                },
            });
        }, 5);
    }
    terminate() {
        this.muerto = true;
        terminados++;
    }
}

const ventana = {
    navigator: { hardwareConcurrency: 3 },
    Worker: WorkerFalso,
    ImageData: function () {},
    createImageBitmap: async () => ({ close() {} }),
    setTimeout,
    setInterval,
    clearInterval,
    console,
    Date,
    Math,
    Map,
    Set,
    Uint8Array,
    Uint8ClampedArray,
};
ventana.window = ventana;
const contexto = vm.createContext(ventana);
vm.runInContext(fs.readFileSync(path.join(raiz, 'js/render/terrain.js'), 'utf8'), contexto, {
    filename: 'js/render/terrain.js',
});
const Terrain = ventana.Terrain;

let lecturas = 0;
const archivo = (legible) => ({
    arrayBuffer: async () => {
        lecturas++;
        if (!legible) throw new Error('The requested file could not be read');
        return new ArrayBuffer(8);
    },
});

const dim = {
    id: 'minecraft:overworld',
    regions: new Map([
        ['0,0', archivo(true)],
        ['1,0', archivo(false)], // ilegible: el juego la está reescribiendo
        ['2,0', archivo(true)],
        ['3,0', archivo(true)],
    ]),
};
const regiones = [0, 1, 2, 3].map((rx) => ({ rx, rz: 0, d: rx }));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const pendientes = () => regiones.filter((r) => Terrain.isLoading(r.rx, r.rz)).map((r) => r.rx);

let fallos = 0;
function comprobar(que, condicion, detalle) {
    if (condicion) return;
    console.error('FALLO: ' + que + (detalle !== undefined ? ' · ' + detalle : ''));
    fallos++;
}

(async () => {
    Terrain.setDimension(dim);

    // El mapa repinta a ~16 fps mientras haya algo pendiente: se imita igual.
    for (let i = 0; i < 12; i++) {
        Terrain.request(regiones);
        await espera(60);
    }

    comprobar('la región buena se pinta', !!Terrain.get(0, 0));
    comprobar(
        'la ilegible no se pide en cada repintado',
        lecturas - 3 <= 3,
        lecturas - 3 + ' lecturas',
    );
    // Con hardwareConcurrency 3 el pool es de 2: el que muere se tira y se repone.
    comprobar('el worker muerto se tira', terminados >= 1, terminados);
    comprobar('y se pone otro en su hueco', creados - terminados === 2, creados + '/' + terminados);
    comprobar('solo queda pendiente la que no contesta', pendientes().join(',') === '3', pendientes());

    // La muda tiene que caer sola al vencer su plazo.
    const t0 = Date.now();
    while (pendientes().length && Date.now() - t0 < 30000) {
        Terrain.request(regiones);
        await espera(500);
    }
    comprobar('nada se queda pendiente para siempre', pendientes().length === 0, pendientes());

    if (fallos) {
        console.error('\n' + fallos + ' fallo(s).');
        process.exit(1);
    }
    console.log('OK · la cola de teselas no se atasca ni machaca el disco');
    process.exit(0);
})();
