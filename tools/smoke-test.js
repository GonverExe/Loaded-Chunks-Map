/*
 * Comprobación de arranque sin navegador.
 *
 * Lee index.html, carga en orden todos los <script> que declara sobre un DOM
 * fingido y verifica que cada módulo se registra y que la interfaz se monta sin
 * reventar. No sustituye a abrir la página, pero pilla lo que más duele después
 * de mover archivos: rutas rotas, orden de carga mal puesto, ids que ya no
 * existen y referencias a funciones que se han ido a otro sitio.
 *
 *   node tools/smoke-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

/* ---------- DOM de mentira, lo justo para que los módulos se monten ---------- */

const ids = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
const elementos = new Map();

function nuevoElemento(id) {
    const el = {
        id,
        tagName: 'DIV',
        hidden: false,
        disabled: false,
        checked: false,
        value: '',
        textContent: '',
        innerHTML: '',
        title: '',
        options: [],
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {},
        removeEventListener() {},
        setAttribute() {},
        getAttribute: () => null,
        appendChild(hijo) {
            this.options.push(hijo);
            return hijo;
        },
        contains: () => false,
        matches: () => false,
        click() {},
        getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
        getContext: () => contexto2d,
        toDataURL: () => 'data:,',
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    el.parentElement = el;
    return el;
}

const contexto2d = new Proxy(
    { canvas: { width: 0, height: 0 } },
    {
        get(destino, prop) {
            if (prop in destino) return destino[prop];
            if (prop === 'measureText') return () => ({ width: 10 });
            return () => {};
        },
        set(destino, prop, valor) {
            destino[prop] = valor;
            return true;
        },
    },
);

const document = {
    documentElement: nuevoElemento('html'),
    body: nuevoElemento('body'),
    title: '',
    getElementById(id) {
        if (!elementos.has(id)) elementos.set(id, nuevoElemento(id));
        return elementos.get(id);
    },
    createElement: (tag) => {
        const el = nuevoElemento('');
        el.tagName = String(tag).toUpperCase();
        return el;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
};

class WorkerFalso {
    constructor(url) {
        WorkerFalso.creados.push(url);
    }
    postMessage() {}
    terminate() {}
}
WorkerFalso.creados = [];

const ventana = {
    document,
    navigator: { hardwareConcurrency: 4 },
    devicePixelRatio: 1,
    location: { href: 'http://localhost/', protocol: 'http:' },
    localStorage: {
        _d: {},
        getItem(k) {
            return this._d[k] === undefined ? null : this._d[k];
        },
        setItem(k, v) {
            this._d[k] = String(v);
        },
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: () => 0,
    addEventListener() {},
    setTimeout,
    setInterval,
    clearInterval,
    clearTimeout,
    Worker: WorkerFalso,
    Intl,
    Date,
    TextDecoder,
    TextEncoder,
    Blob,
    Response,
    DecompressionStream,
    ImageData: function () {},
    createImageBitmap: async () => ({ close() {} }),
    performance,
    BigInt,
    Math,
    JSON,
    console,
};
ventana.window = ventana;
ventana.self = ventana;

/* ---------- Carga de los scripts en el orden que manda el HTML ---------- */

const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
if (!scripts.length) {
    console.error('FALLO: index.html no declara ningún script');
    process.exit(1);
}

/*
 * El objeto de ventana hace de global del contexto, igual que en el navegador:
 * así un `window.Modulo = {...}` deja de verdad la variable `Modulo` a la vista
 * del siguiente script, que es de lo que depende todo el proyecto.
 */
const contexto = vm.createContext(ventana);

let fallos = 0;
for (const src of scripts) {
    const archivo = path.join(raiz, src);
    if (!fs.existsSync(archivo)) {
        console.error('FALLO: ' + src + ' no existe');
        fallos++;
        continue;
    }
    try {
        vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto, { filename: src });
    } catch (err) {
        console.error('FALLO al cargar ' + src + ': ' + err.message);
        fallos++;
    }
}

/* ---------- Lo que tiene que haber quedado montado ---------- */

const esperados = [
    'I18n',
    'Theme',
    'NBT',
    'WorldReader',
    'ChunkModel',
    'Live',
    'StructureIcons',
    'Terrain',
    'Structures',
    'ChunkMap',
    'Fmt',
];
for (const g of esperados) {
    if (!ventana[g]) {
        console.error('FALLO: no se ha registrado ' + g);
        fallos++;
    }
}

/* Los ids que pide el JS tienen que existir de verdad en el HTML. */
for (const archivo of scripts) {
    const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    for (const m of codigo.matchAll(/\$\('([\w-]+)'\)/g)) {
        if (!ids.has(m[1])) {
            console.error('FALLO: ' + archivo + ' usa #' + m[1] + ', que no está en el HTML');
            fallos++;
        }
    }
}

/* Las hojas de estilo y los workers también tienen que estar donde se dice. */
for (const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
    if (!fs.existsSync(path.join(raiz, m[1]))) {
        console.error('FALLO: hoja de estilo inexistente: ' + m[1]);
        fallos++;
    }
}
for (const archivo of scripts) {
    const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    for (const m of codigo.matchAll(/new Worker\('([^']+)'\)/g)) {
        if (!fs.existsSync(path.join(raiz, m[1]))) {
            console.error('FALLO: worker inexistente: ' + m[1] + ' (en ' + archivo + ')');
            fallos++;
        }
    }
}
/* importScripts se resuelve desde la carpeta del propio worker. */
for (const worker of fs.readdirSync(path.join(raiz, 'js/workers'))) {
    const codigo = fs.readFileSync(path.join(raiz, 'js/workers', worker), 'utf8');
    const m = codigo.match(/importScripts\(([^)]*)\)/);
    if (!m) continue;
    for (const dep of m[1].match(/'([^']+)'/g) || []) {
        const rel = dep.slice(1, -1);
        if (!fs.existsSync(path.join(raiz, 'js/workers', rel))) {
            console.error('FALLO: ' + worker + ' importa ' + rel + ', que no está a su lado');
            fallos++;
        }
    }
}

/* Todas las claves de traducción que se usan tienen que existir en los 5 idiomas. */
const i18n = fs.readFileSync(path.join(raiz, 'js/core/i18n.js'), 'utf8');
const idiomas = ['es', 'en', 'pt', 'zh', 'ru'];
const bloques = idiomas
    .map((l) => ({ l, i: i18n.indexOf('\n        ' + l + ': {\n') }))
    .sort((a, b) => a.i - b.i);
const claves = {};
bloques.forEach((b, n) => {
    const fin = n + 1 < bloques.length ? bloques[n + 1].i : i18n.length;
    claves[b.l] = new Set(
        [...i18n.slice(b.i, fin).matchAll(/^\s+'([\w.]+)':/gm)].map((m) => m[1]),
    );
});
for (const l of idiomas) {
    const faltan = [...claves.es].filter((k) => !claves[l].has(k));
    if (faltan.length) {
        console.error('FALLO: a ' + l + ' le faltan claves: ' + faltan.join(', '));
        fallos++;
    }
}
const usadas = new Set();
for (const archivo of scripts) {
    const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
    for (const m of codigo.matchAll(/I18n\.t\(\s*'([\w.]+)'/g)) usadas.add(m[1]);
}
for (const m of html.matchAll(/data-i18n(?:-\w+)?="([\w.]+)"/g)) usadas.add(m[1]);
for (const k of usadas) {
    // struct.<familia> y level.<n> se componen en tiempo de ejecución.
    if (k.endsWith('.')) continue;
    if (!claves.es.has(k)) {
        console.error('FALLO: se usa la traducción ' + k + ', que no existe');
        fallos++;
    }
}

if (fallos) {
    console.error('\n' + fallos + ' fallo(s).');
    process.exit(1);
}
console.log(
    'OK · ' +
        scripts.length +
        ' scripts, ' +
        esperados.length +
        ' módulos, ' +
        claves.es.size +
        ' traducciones × ' +
        idiomas.length +
        ' idiomas',
);
