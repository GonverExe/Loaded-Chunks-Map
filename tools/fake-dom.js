/*
 * DOM de mentira, lo justo para cargar los scripts de la página fuera del
 * navegador. Guarda los manejadores que registra cada elemento, así que las
 * pruebas pueden disparar un evento y recorrer el mismo camino que un clic.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function crear(raiz) {
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    const ids = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
    const elementos = new Map();

    const contexto2d = new Proxy(
        { canvas: { width: 0, height: 0 } },
        {
            get: (d, p) =>
                p in d ? d[p] : p === 'measureText' ? () => ({ width: 10 }) : () => {},
            set: (d, p, v) => ((d[p] = v), true),
        },
    );

    /* ¿Este id nace con el atributo hidden puesto en el HTML? */
    const naceOculto = (id) =>
        new RegExp('id="' + id + '"[^>]*\\shidden').test(html) ||
        new RegExp('hidden[^>]*\\sid="' + id + '"').test(html);

    function nuevoElemento(id) {
        const el = {
            id,
            tagName: 'DIV',
            hidden: naceOculto(id),
            disabled: false,
            checked: false,
            value: '',
            textContent: '',
            innerHTML: '',
            title: '',
            options: [],
            children: [],
            style: {},
            dataset: {},
            _handlers: {},
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            addEventListener(tipo, fn) {
                (this._handlers[tipo] = this._handlers[tipo] || []).push(fn);
            },
            removeEventListener() {},
            setAttribute() {},
            getAttribute: () => null,
            append(...hijos) {
                for (const h of hijos) this.appendChild(h);
            },
            appendChild(hijo) {
                this.children.push(hijo);
                if (hijo.tagName === 'OPTION') this.options.push(hijo);
                return hijo;
            },
            contains: () => false,
            matches: () => false,
            className: '',
            click() {},
            scrollIntoView() {},
            focus() {},
            blur() {},
            getBoundingClientRect: () => ({ width: 900, height: 600, left: 0, top: 0 }),
            getContext: () => contexto2d,
            toDataURL: () => 'data:,',
            querySelector(sel) {
                return this.querySelectorAll(sel)[0] || null;
            },
            /* Solo lo que usa el proyecto: una clase suelta o un nombre de etiqueta. */
            querySelectorAll(sel) {
                const busca = String(sel).trim();
                const porClase = busca.charAt(0) === '.';
                const aguja = porClase ? busca.slice(1) : busca.toUpperCase();
                const salida = [];
                const mirar = (nodo) => {
                    for (const h of nodo.children || []) {
                        const clases = String(h.className || '').split(/\s+/);
                        if (porClase ? clases.indexOf(aguja) >= 0 : h.tagName === aguja) {
                            salida.push(h);
                        }
                        mirar(h);
                    }
                };
                mirar(this);
                return salida;
            },
        };
        el.parentElement = el;
        return el;
    }

    const document = {
        documentElement: nuevoElemento('html'),
        body: nuevoElemento('body'),
        title: '',
        _handlers: {},
        getElementById(id) {
            if (!elementos.has(id)) elementos.set(id, nuevoElemento(id));
            return elementos.get(id);
        },
        createElement(tag) {
            const el = nuevoElemento('');
            el.tagName = String(tag).toUpperCase();
            return el;
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(tipo, fn) {
            (this._handlers[tipo] = this._handlers[tipo] || []).push(fn);
        },
    };

    class WorkerFalso {
        constructor(url) {
            WorkerFalso.creados.push(url);
            this.onmessage = null;
            this.onerror = null;
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
        requestAnimationFrame: (fn) => {
            fn(0);
            return 0;
        },
        scrollTo() {},
        addEventListener() {},
        setTimeout,
        setInterval,
        clearInterval,
        clearTimeout,
        Worker: WorkerFalso,
        Intl,
        Date,
        Math,
        JSON,
        console,
        TextDecoder,
        TextEncoder,
        Blob,
        Response,
        DecompressionStream,
        ImageData: function () {},
        createImageBitmap: async () => ({ close() {} }),
        performance,
        BigInt,
        Promise,
        Error,
        Set,
        Map,
        Array,
        Object,
        Number,
        String,
        Uint8Array,
        Uint8ClampedArray,
        Int16Array,
        DataView,
        ArrayBuffer,
    };
    ventana.window = ventana;
    ventana.self = ventana;

    const contexto = vm.createContext(ventana);

    return {
        html,
        ids,
        ventana,
        document,
        WorkerFalso,
        el: (id) => document.getElementById(id),
        /* Ejecuta los <script> de index.html en orden, como haría el navegador. */
        cargarScripts() {
            const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
            const errores = [];
            for (const src of scripts) {
                const archivo = path.join(raiz, src);
                if (!fs.existsSync(archivo)) {
                    errores.push(src + ' no existe');
                    continue;
                }
                try {
                    vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto, { filename: src });
                } catch (err) {
                    errores.push(src + ': ' + err.message);
                }
            }
            return { scripts, errores };
        },
        /* Dispara un evento sobre un elemento y espera a lo que deje pendiente. */
        async disparar(id, tipo, evento) {
            const el = document.getElementById(id);
            const fns = el._handlers[tipo] || [];
            for (const fn of fns) await fn(evento || { target: el, preventDefault() {} });
            return fns.length;
        },
    };
}

module.exports = { crear };
