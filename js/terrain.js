/*
 * Teselas del mapa base: pide regiones a los workers, guarda el resultado como
 * ImageBitmap y avisa al mapa para que repinte. Una tesela = un region file.
 * Dos modos: bloques (terreno) y biomas.
 */
(function (global) {
  'use strict';

  const TILE = 512;                 // px por región (32 chunks x 16 px)
  const MAX_CACHE = 80;             // teselas guardadas, sumando los dos modos
  const MAX_QUEUE = 48;             // regiones pedidas de una vez

  const state = {
    workers: [],
    busy: [],
    queue: [],
    pending: new Set(),             // "rx,rz|modo" en cola o en proceso
    tiles: new Map(),               // "rx,rz|modo" -> ImageBitmap
    dim: null,
    mode: 'blocks',
    available: null,                // null = sin comprobar, false = sin workers
    error: null,
    done: 0,
    total: 0,
    onTile: null,
    onProgress: null,
    nextId: 1
  };

  function start() {
    if (state.available !== null) return state.available;
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker('js/terrain-worker.js');
        w.onmessage = (e) => onResult(i, e.data);
        w.onerror = (e) => { state.error = e.message || 'worker'; onResult(i, null); };
        state.workers.push(w);
        state.busy.push(false);
      }
      state.available = true;
    } catch (err) {
      // Sin servidor HTTP (página abierta con file://) no se pueden crear workers.
      state.available = false;
      state.error = err.message;
    }
    return state.available;
  }

  function regionKey(rx, rz) { return rx + ',' + rz; }
  function tileKey(rx, rz, mode) { return rx + ',' + rz + '|' + mode; }

  /*
   * Altura a la que mirar el bioma. En el overworld manda la superficie; en el
   * Nether (techo de bedrock) y el End (islas) hay que fijar una altura de juego.
   */
  function biomeYFor(dim) {
    if (!dim) return null;
    if (dim.id === 'minecraft:the_nether' || dim.id === 'minecraft:the_end') return 64;
    return null;
  }

  function trimCache(keep) {
    if (state.tiles.size <= MAX_CACHE) return;
    for (const k of Array.from(state.tiles.keys())) {
      if (state.tiles.size <= MAX_CACHE) break;
      if (keep.has(k)) continue;
      const bmp = state.tiles.get(k);
      if (bmp && bmp.close) bmp.close();
      state.tiles.delete(k);
    }
  }

  async function onResult(slot, msg) {
    state.busy[slot] = false;
    if (msg && msg.ok) {
      const k = tileKey(msg.rx, msg.rz, msg.mode);
      try {
        const img = new ImageData(msg.pixels, TILE, TILE);
        const bmp = await createImageBitmap(img);
        state.tiles.set(k, bmp);
      } catch (_) { /* región ilegible: se queda sin tesela */ }
      state.pending.delete(k);
      state.done++;
      if (state.onTile) state.onTile();
    } else if (msg) {
      state.pending.delete(tileKey(msg.rx, msg.rz, msg.mode));
      state.done++;
      if (msg.error && !state.error) state.error = msg.error;
    }
    if (state.onProgress) state.onProgress(state.done, state.total);
    pump();
  }

  function pump() {
    if (!state.queue.length) {
      if (state.done >= state.total) { state.done = 0; state.total = 0; }
      return;
    }
    for (let i = 0; i < state.workers.length; i++) {
      if (state.busy[i] || !state.queue.length) continue;
      const job = state.queue.shift();
      state.busy[i] = true;
      job.file.arrayBuffer().then((buffer) => {
        state.workers[i].postMessage({
          id: state.nextId++, rx: job.rx, rz: job.rz, mode: job.mode,
          biomeY: job.biomeY, buffer
        }, [buffer]);
      }).catch(() => onResult(i, { rx: job.rx, rz: job.rz, mode: job.mode, ok: false, error: 'read' }));
    }
  }

  function resetQueue() {
    state.queue.length = 0;
    state.pending.clear();
    state.done = 0;
    state.total = 0;
  }

  /* Cambia de dimensión: la caché anterior ya no vale. */
  function setDimension(dim) {
    if (state.dim === dim) return;
    state.dim = dim;
    resetQueue();
    for (const bmp of state.tiles.values()) if (bmp && bmp.close) bmp.close();
    state.tiles.clear();
  }

  /* Bloques o biomas. Las teselas ya hechas de cada modo se conservan. */
  function setMode(mode) {
    if (mode !== 'blocks' && mode !== 'biomes') return;
    if (state.mode === mode) return;
    state.mode = mode;
    resetQueue();
  }

  function mode() { return state.mode; }

  /*
   * Pide las regiones visibles. `regions` llega ordenada por cercanía al
   * centro de la vista, así se rellena antes lo que se está mirando.
   */
  function request(regions) {
    if (!state.dim || !state.dim.regions || !start()) return;
    const m = state.mode;
    const biomeY = biomeYFor(state.dim);
    const keep = new Set(regions.map((r) => tileKey(r.rx, r.rz, m)));
    let added = 0;
    for (const r of regions) {
      if (added >= MAX_QUEUE) break;
      const k = tileKey(r.rx, r.rz, m);
      if (state.tiles.has(k) || state.pending.has(k)) continue;
      const file = state.dim.regions.get(regionKey(r.rx, r.rz));
      if (!file) continue;
      state.pending.add(k);
      state.queue.push({ rx: r.rx, rz: r.rz, file, mode: m, biomeY });
      state.total++;
      added++;
    }
    trimCache(keep);
    if (added) {
      if (state.onProgress) state.onProgress(state.done, state.total);
      pump();
    }
  }

  function get(rx, rz) { return state.tiles.get(tileKey(rx, rz, state.mode)) || null; }
  function isAvailable() { return state.available !== false; }
  function lastError() { return state.error; }
  function stats() {
    return { done: state.done, total: state.total, cached: state.tiles.size, mode: state.mode };
  }

  global.Terrain = {
    setDimension, setMode, mode, request, get, stats, isAvailable, lastError, TILE,
    probe: start,
    set onTile(fn) { state.onTile = fn; },
    set onProgress(fn) { state.onProgress = fn; }
  };
})(window);
