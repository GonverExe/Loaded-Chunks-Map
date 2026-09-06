/*
 * Estructuras del mundo: escanea los region files que se están mirando, saca de
 * cada chunk las estructuras que arrancan ahí y las agrupa en familias para
 * pintarlas en el mapa.
 *
 * El escaneo va por detrás, con sus propios workers y la misma prioridad que el
 * terreno: primero lo que está en pantalla. Solo se escanea si hay alguna
 * familia activada, así no se gasta CPU con el desplegable cerrado.
 */
(function (global) {
    'use strict';

    const MAX_QUEUE = 24;
    const MAX_REGIONS = 400; // regiones escaneadas que se guardan en memoria

    /*
     * Familias: varias estructuras del juego caen en la misma (todas las
     * variantes de aldea, de portal en ruinas…). `test` recibe el id ya
     * normalizado: en minúsculas y sin el prefijo "minecraft:".
     *
     * El orden importa: gana la primera que encaja.
     */
    const FAMILIES = [
        { id: 'village', color: '#a3e635', test: (s) => s.startsWith('village') },
        { id: 'pillager_outpost', color: '#94a3b8', test: (s) => s.includes('pillager_outpost') },
        { id: 'mineshaft', color: '#a16207', test: (s) => s.startsWith('mineshaft') },
        { id: 'stronghold', color: '#22d3ee', test: (s) => s === 'stronghold' },
        { id: 'desert_pyramid', color: '#fde047', test: (s) => s.includes('desert_pyramid') },
        { id: 'jungle_pyramid', color: '#15803d', test: (s) => s.includes('jungle_pyramid') },
        { id: 'swamp_hut', color: '#7c3aed', test: (s) => s.includes('swamp_hut') },
        { id: 'igloo', color: '#e0f2fe', test: (s) => s === 'igloo' },
        { id: 'ocean_ruin', color: '#5eead4', test: (s) => s.startsWith('ocean_ruin') },
        { id: 'shipwreck', color: '#d97706', test: (s) => s.startsWith('shipwreck') },
        { id: 'buried_treasure', color: '#facc15', test: (s) => s.includes('buried_treasure') },
        { id: 'monument', color: '#0ea5e9', test: (s) => s.includes('monument') },
        { id: 'mansion', color: '#b45309', test: (s) => s.includes('mansion') },
        { id: 'ruined_portal', color: '#c026d3', test: (s) => s.startsWith('ruined_portal') },
        { id: 'ancient_city', color: '#2dd4bf', test: (s) => s.includes('ancient_city') },
        { id: 'trail_ruins', color: '#d6d3d1', test: (s) => s.includes('trail_ruins') },
        { id: 'trial_chambers', color: '#fb923c', test: (s) => s.includes('trial_chambers') },
        {
            id: 'fortress',
            color: '#dc2626',
            test: (s) => s === 'fortress' || s === 'nether_bridge',
        },
        { id: 'bastion_remnant', color: '#4b5563', test: (s) => s.includes('bastion') },
        { id: 'nether_fossil', color: '#e7e5e4', test: (s) => s.includes('nether_fossil') },
        {
            id: 'end_city',
            color: '#a78bfa',
            test: (s) => s.includes('endcity') || s.includes('end_city'),
        },
        { id: 'other', color: '#f472b6', test: () => true },
    ];

    const FAMILY_BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));
    const familyCache = new Map(); // id crudo -> id de familia

    /*
     * Antes de 1.16 los ids iban sin espacio de nombres y con mayúsculas
     * ("Village", "Swamp_Hut", "EndCity"), así que se normaliza todo.
     */
    function familyOf(rawId) {
        let fam = familyCache.get(rawId);
        if (fam) return fam;
        const s = String(rawId)
            .toLowerCase()
            .replace(/^minecraft:/, '')
            .replace(/[\s-]/g, '_');
        fam = 'other';
        for (const f of FAMILIES) {
            if (f.test(s)) {
                fam = f.id;
                break;
            }
        }
        familyCache.set(rawId, fam);
        return fam;
    }

    function colorOf(familyId) {
        const f = FAMILY_BY_ID.get(familyId);
        return f ? f.color : '#f472b6';
    }

    const state = {
        workers: [],
        busy: [],
        queue: [],
        pending: new Set(), // "rx,rz" en cola o en proceso
        regions: new Map(), // "rx,rz" -> [{ id, family, x, z }]
        counts: new Map(), // familia -> cuántas van encontradas
        enabled: new Set(), // familias que se pintan
        dim: null,
        available: null,
        done: 0,
        total: 0,
        onScan: null,
        onProgress: null,
        nextId: 1,
    };

    function start() {
        if (state.available !== null) return state.available;
        try {
            // Dos bastan: el escaneo no decodifica bloques, va muy por delante
            // del render de terreno y no conviene quitarle hilos.
            const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
            for (let i = 0; i < n; i++) {
                const w = new Worker('js/structures-worker.js');
                w.onmessage = (e) => onResult(i, e.data);
                w.onerror = () => onResult(i, null);
                state.workers.push(w);
                state.busy.push(false);
            }
            state.available = true;
        } catch (_) {
            state.available = false;
        }
        return state.available;
    }

    function key(rx, rz) {
        return rx + ',' + rz;
    }

    /* Las regiones lejanas se sueltan para no crecer sin límite. */
    function trim(keep) {
        if (state.regions.size <= MAX_REGIONS) return;
        for (const k of Array.from(state.regions.keys())) {
            if (state.regions.size <= MAX_REGIONS) break;
            if (keep.has(k)) continue;
            for (const s of state.regions.get(k)) {
                const c = state.counts.get(s.family);
                if (c) state.counts.set(s.family, c - 1);
            }
            state.regions.delete(k);
        }
    }

    function onResult(slot, msg) {
        state.busy[slot] = false;
        if (msg) {
            const k = key(msg.rx, msg.rz);
            state.pending.delete(k);
            const list = [];
            if (msg.ok && msg.list) {
                for (const s of msg.list) {
                    const family = familyOf(s.id);
                    list.push({ id: s.id, family, x: s.x, z: s.z });
                    state.counts.set(family, (state.counts.get(family) || 0) + 1);
                }
            }
            state.regions.set(k, list);
            state.done++;
            if (state.onScan) state.onScan();
        }
        if (state.onProgress) state.onProgress(state.done, state.total);
        pump();
    }

    function pump() {
        if (!state.queue.length) {
            if (state.done >= state.total) {
                state.done = 0;
                state.total = 0;
            }
            return;
        }
        for (let i = 0; i < state.workers.length; i++) {
            if (state.busy[i] || !state.queue.length) continue;
            const job = state.queue.shift();
            state.busy[i] = true;
            job.file
                .arrayBuffer()
                .then((buffer) => {
                    state.workers[i].postMessage(
                        { id: state.nextId++, rx: job.rx, rz: job.rz, buffer },
                        [buffer],
                    );
                })
                .catch(() => onResult(i, { rx: job.rx, rz: job.rz, ok: false }));
        }
    }

    function resetQueue() {
        state.queue = [];
        state.pending.clear();
        state.done = 0;
        state.total = 0;
    }

    function setDimension(dim) {
        if (state.dim === dim) return;
        state.dim = dim;
        resetQueue();
        state.regions.clear();
        state.counts.clear();
    }

    /*
     * Pide el escaneo de las regiones visibles, con la misma política que el
     * terreno: `regions` llega ordenada por cercanía al centro y lo que sale de
     * pantalla se descarta de la cola.
     */
    function request(regions) {
        if (!state.enabled.size) return;
        if (!state.dim || !state.dim.regions || !start()) return;

        const keep = new Set();
        const want = new Map();
        for (let i = 0; i < regions.length; i++) {
            const r = regions[i];
            const k = key(r.rx, r.rz);
            keep.add(k);
            want.set(k, r.d != null ? r.d : i);
        }

        let dropped = 0;
        const kept = [];
        for (const job of state.queue) {
            const prio = want.get(job.key);
            if (prio === undefined) {
                state.pending.delete(job.key);
                dropped++;
                continue;
            }
            job.d = prio;
            kept.push(job);
        }
        if (dropped) {
            state.queue = kept;
            state.total -= dropped;
        }

        let added = 0;
        for (const r of regions) {
            if (state.queue.length >= MAX_QUEUE) break;
            const k = key(r.rx, r.rz);
            if (state.regions.has(k) || state.pending.has(k)) continue;
            const file = state.dim.regions.get(k);
            if (!file) continue;
            state.pending.add(k);
            state.queue.push({ key: k, rx: r.rx, rz: r.rz, file, d: want.get(k) });
            state.total++;
            added++;
        }
        if (added || dropped) state.queue.sort((a, b) => a.d - b.d);
        trim(keep);
        if (added || dropped) {
            if (state.onProgress) state.onProgress(state.done, state.total);
            pump();
        }
    }

    /*
     * El juego ha reescrito esta región: puede haber estructuras nuevas, así que
     * se olvida lo escaneado (descontando sus contadores) y el siguiente
     * repintado la vuelve a pedir.
     */
    function invalidate(rx, rz) {
        const k = key(rx, rz);
        const list = state.regions.get(k);
        if (!list) return;
        for (const s2 of list) {
            const c = state.counts.get(s2.family);
            if (c) state.counts.set(s2.family, c - 1);
        }
        state.regions.delete(k);
    }

    /* ¿Esta región está en la cola o escaneándose? */
    function isScanning(rx, rz) {
        return state.pending.has(key(rx, rz));
    }

    /*
     * Estructuras activadas dentro del rectángulo de chunks pedido. Se recorren
     * solo las regiones que lo tocan, no toda la caché.
     */
    function inView(minX, minZ, maxX, maxZ) {
        const out = [];
        if (!state.enabled.size) return out;
        const rx0 = Math.floor(minX / 32),
            rx1 = Math.floor(maxX / 32);
        const rz0 = Math.floor(minZ / 32),
            rz1 = Math.floor(maxZ / 32);
        for (let rz = rz0; rz <= rz1; rz++) {
            for (let rx = rx0; rx <= rx1; rx++) {
                const list = state.regions.get(key(rx, rz));
                if (!list) continue;
                for (const s of list) {
                    if (!state.enabled.has(s.family)) continue;
                    if (s.x < minX || s.x > maxX || s.z < minZ || s.z > maxZ) continue;
                    out.push(s);
                }
            }
        }
        return out;
    }

    /* Las estructuras que arrancan en un chunk concreto (para el tooltip). */
    function at(cx, cz) {
        const list = state.regions.get(key(Math.floor(cx / 32), Math.floor(cz / 32)));
        if (!list) return [];
        return list.filter((s) => s.x === cx && s.z === cz && state.enabled.has(s.family));
    }

    function setEnabled(ids) {
        state.enabled = new Set(ids);
    }
    function enabled() {
        return state.enabled;
    }
    function families() {
        return FAMILIES;
    }
    function count(familyId) {
        return state.counts.get(familyId) || 0;
    }
    function scanned() {
        return state.regions.size;
    }
    function isAvailable() {
        return state.available !== false;
    }

    global.Structures = {
        setDimension,
        request,
        inView,
        at,
        isScanning,
        invalidate,
        setEnabled,
        enabled,
        families,
        familyOf,
        colorOf,
        count,
        scanned,
        isAvailable,
        probe: start,
        set onScan(fn) {
            state.onScan = fn;
        },
        set onProgress(fn) {
            state.onProgress = fn;
        },
    };
})(window);
