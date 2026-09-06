/*
 * Worker de terreno: recibe un region file entero y devuelve su imagen de
 * 512x512 (16 px por chunk), como las teselas que dibuja MCA Selector.
 *
 * De cada columna se toma el bloque de superficie y se colorea con la paleta
 * de blockcolors.js; después se sombrea según el desnivel para dar relieve.
 */
'use strict';
importScripts('blockcolors.js', 'biomecolors.js');

const SIZE = 512;             // 32 chunks * 16 bloques

/* ---------- Lector NBT selectivo (salta lo que no se usa) ---------- */

function Reader(buf) {
  this.d = new DataView(buf);
  this.u = new Uint8Array(buf);
  this.p = 0;
}
Reader.prototype = {
  u8() { return this.d.getUint8(this.p++); },
  i8() { return this.d.getInt8(this.p++); },
  i16() { const v = this.d.getInt16(this.p); this.p += 2; return v; },
  i32() { const v = this.d.getInt32(this.p); this.p += 4; return v; },
  f32() { const v = this.d.getFloat32(this.p); this.p += 4; return v; },
  f64() { const v = this.d.getFloat64(this.p); this.p += 8; return v; },
  str() {
    const n = this.d.getUint16(this.p); this.p += 2;
    let s = '';
    // Los nombres de bloque son ASCII: se decodifica a mano, más rápido aquí.
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u[this.p + i]);
    this.p += n;
    return s;
  },
  /* LongArray como pares (hi, lo) de 32 bits: evita BigInt, que es lento. */
  longArray() {
    const n = this.i32();
    const out = new Int32Array(n * 2);
    for (let i = 0; i < n; i++) {
      out[i * 2] = this.d.getInt32(this.p);
      out[i * 2 + 1] = this.d.getInt32(this.p + 4);
      this.p += 8;
    }
    return out;
  },
  skipStr() { const n = this.d.getUint16(this.p); this.p += 2 + n; }
};

function skip(r, type) {
  switch (type) {
    case 1: r.p += 1; break;
    case 2: r.p += 2; break;
    case 3: r.p += 4; break;
    case 4: r.p += 8; break;
    case 5: r.p += 4; break;
    case 6: r.p += 8; break;
    // Ojo: la longitud se lee a una variable. Con `r.p += r.i32()` el valor
    // de r.p se toma antes de que i32() avance el puntero, y se pierden 4 bytes.
    case 7: { const n = r.i32(); r.p += n; break; }
    case 8: r.skipStr(); break;
    case 9: {
      const it = r.u8(), n = r.i32();
      for (let i = 0; i < n; i++) skip(r, it);
      break;
    }
    case 10: {
      for (;;) { const t = r.u8(); if (!t) break; r.skipStr(); skip(r, t); }
      break;
    }
    case 11: { const n = r.i32(); r.p += n * 4; break; }
    case 12: { const n = r.i32(); r.p += n * 8; break; }
    default: throw new Error('tag NBT desconocido ' + type);
  }
}

/* palette: lista de compounds; solo interesa Name. */
function readPalette(r) {
  const n = r.i32();
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let name = 'minecraft:air';
    for (;;) {
      const t = r.u8();
      if (!t) break;
      const k = r.str();
      if (t === 8 && k === 'Name') name = r.str();
      else skip(r, t);
    }
    out[i] = name;
  }
  return out;
}

function readBlockStates(r) {
  const out = { palette: null, data: null };
  for (;;) {
    const t = r.u8();
    if (!t) break;
    const k = r.str();
    if (k === 'palette' && t === 9) { r.u8(); out.palette = readPalette(r); }
    else if (k === 'data' && t === 12) out.data = r.longArray();
    else skip(r, t);
  }
  return out;
}

/* biomes: paleta de cadenas y datos en celdas de 4x4x4 (64 por sección). */
function readBiomes(r) {
  const out = { palette: null, data: null };
  for (;;) {
    const t = r.u8();
    if (!t) break;
    const k = r.str();
    if (k === 'palette' && t === 9) {
      const it = r.u8(), n = r.i32();
      const a = new Array(n);
      for (let i = 0; i < n; i++) {
        if (it === 8) a[i] = r.str();
        else { skip(r, it); a[i] = 'minecraft:the_void'; }
      }
      out.palette = a;
    } else if (k === 'data' && t === 12) out.data = r.longArray();
    else skip(r, t);
  }
  return out;
}

function readSections(r, itemType) {
  const n = r.i32();
  const out = [];
  for (let i = 0; i < n; i++) {
    const sec = { Y: 0, states: null, biomes: null };
    for (;;) {
      const t = r.u8();
      if (!t) break;
      const k = r.str();
      if (k === 'Y' && (t === 1 || t === 3)) sec.Y = t === 1 ? r.i8() : r.i32();
      else if (k === 'biomes' && t === 10) sec.biomes = readBiomes(r);
      else if (k === 'block_states' && t === 10) sec.states = readBlockStates(r);
      else if (k === 'Palette' && t === 9) {            // 1.13 - 1.17
        r.u8();
        (sec.states || (sec.states = { palette: null, data: null })).palette = readPalette(r);
      } else if (k === 'BlockStates' && t === 12) {
        (sec.states || (sec.states = { palette: null, data: null })).data = r.longArray();
      } else skip(r, t);
    }
    if (sec.states || sec.biomes) out.push(sec);
  }
  return out;
}

function readHeightmaps(r) {
  let surface = null, motion = null;
  for (;;) {
    const t = r.u8();
    if (!t) break;
    const k = r.str();
    if (k === 'WORLD_SURFACE' && t === 12) surface = r.longArray();
    else if (k === 'MOTION_BLOCKING' && t === 12) motion = r.longArray();
    else skip(r, t);
  }
  return surface || motion;
}

/* Devuelve { sections, heightmap, yPos, dataVersion } o null. */
function parseChunk(buf) {
  const r = new Reader(buf);
  if (r.u8() !== 10) return null;
  r.skipStr();
  const out = { sections: null, heightmap: null, yPos: 0, dataVersion: 0, full: true };
  const root = (r) => {
    for (;;) {
      const t = r.u8();
      if (!t) break;
      const k = r.str();
      if (k === 'sections' && t === 9) { r.u8(); out.sections = readSections(r); }
      else if (k === 'Sections' && t === 9) { r.u8(); out.sections = readSections(r); }
      else if (k === 'Heightmaps' && t === 10) out.heightmap = readHeightmaps(r);
      else if (k === 'yPos' && (t === 1 || t === 3)) out.yPos = t === 1 ? r.i8() : r.i32();
      else if (k === 'DataVersion' && t === 3) out.dataVersion = r.i32();
      else if (k === 'Status' && t === 8) { out.full = /full|postprocessed/.test(r.str()); }
      else if (k === 'Level' && t === 10) root(r);        // formato pre-1.18
      else skip(r, t);
    }
  };
  root(r);
  return out;
}

/* ---------- Acceso a bloques ---------- */

/* Un valor de `data` en el empaquetado moderno (1.16+): sin cruzar longs. */
function valueAt(data, index, bits, packed) {
  const mask = (1 << bits) - 1;
  let li, off;
  if (packed) {                       // 1.16+: valores alineados dentro del long
    const per = (64 / bits) | 0;
    li = (index / per) | 0;
    off = (index % per) * bits;
  } else {                            // 1.13 - 1.15: flujo continuo de bits
    const bit = index * bits;
    li = (bit / 64) | 0;
    off = bit % 64;
  }
  const hi = data[li * 2], lo = data[li * 2 + 1];
  let v;
  if (off + bits <= 32) v = (lo >>> off) & mask;
  else if (off >= 32) v = (hi >>> (off - 32)) & mask;
  else v = ((lo >>> off) | (hi << (32 - off))) & mask;
  if (!packed && off + bits > 64) {   // parte alta en el long siguiente
    const rest = off + bits - 64;
    const hi2 = data[(li + 1) * 2 + 1];
    v |= (hi2 & ((1 << rest) - 1)) << (bits - rest);
    v &= mask;
  }
  return v;
}

function bitsFor(paletteLength) {
  let b = 4;
  while ((1 << b) < paletteLength) b++;
  return b;
}

/* Los biomas no tienen mínimo de 4 bits: con 2 entradas basta 1 bit. */
function bitsForBiomes(paletteLength) {
  let b = 1;
  while ((1 << b) < paletteLength) b++;
  return b;
}

/* ---------- Render de un chunk ---------- */

const HEIGHT_BITS = 9;

const MAX_WATER_DEPTH = 40;   // más allá, el fondo ya no aporta nada

function renderChunk(chunk, pixels, heights, px0, pz0) {
  const sections = chunk.sections;
  if (!sections || !sections.length) return false;

  const packed = chunk.dataVersion === 0 || chunk.dataVersion >= 2529;

  // Secciones indexadas por su Y para poder bajar por una columna sin buscar.
  let minSec = Infinity, maxSec = -Infinity;
  for (const s of sections) {
    if (s.Y < minSec) minSec = s.Y;
    if (s.Y > maxSec) maxSec = s.Y;
  }
  const byY = new Array(maxSec - minSec + 1).fill(null);
  for (const s of sections) {
    const pal = (s.states && s.states.palette) || ['minecraft:air'];
    byY[s.Y - minSec] = {
      colors: pal.map((n) => BlockColors.colorOf(n)),
      air: pal.map((n) => BlockColors.isAir(n)),
      water: pal.map((n) => BlockColors.isWater(n)),
      data: s.states && s.states.data,
      bits: bitsFor(pal.length),
      empty: pal.length === 1 && BlockColors.isAir(pal[0])
    };
  }

  const minY = minSec * 16;
  const maxY = maxSec * 16 + 15;
  const chunkMinY = chunk.yPos * 16;

  /* Índice de paleta del bloque (x,y,z), o -1 fuera de rango. */
  const at = (x, y, z) => {
    const si = (y >> 4) - minSec;
    if (si < 0 || si >= byY.length) return null;
    const s = byY[si];
    if (!s || s.empty) return null;
    const idx = (((y & 15) * 256) + (z * 16) + x);
    return { s, pi: s.data ? valueAt(s.data, idx, s.bits, packed) : 0 };
  };

  const hm = chunk.heightmap;
  let painted = false;

  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      // Punto de partida: el heightmap si lo hay, si no la cima del mundo.
      let y = maxY;
      if (hm) {
        const v = valueAt(hm, z * 16 + x, HEIGHT_BITS, true);
        if (v > 0) y = Math.min(maxY, chunkMinY + v - 1);
      }

      let color = null, height = 0, depth = 0;
      for (; y >= minY; y--) {
        const b = at(x, y, z);
        if (!b) { y -= (y & 15); continue; }      // sección vacía: salta entera
        if (b.s.air[b.pi]) continue;

        if (b.s.water[b.pi]) {                    // superficie de agua: mide el fondo
          if (!depth) height = y;
          depth++;
          if (depth < MAX_WATER_DEPTH) continue;
        }
        color = b.s.colors[b.pi];
        if (!depth) height = y;
        break;
      }

      if (!color) continue;

      let r = color[0], g = color[1], bl = color[2];
      if (depth) {
        // Manda el azul; el fondo solo asoma en aguas someras. Después se
        // oscurece con la profundidad, que es lo que dibuja las orillas.
        const w = BlockColors.WATER;
        const wf = Math.min(1, 0.55 + depth * 0.15);
        const shade = 1 - Math.min(0.5, depth * 0.03);
        r = (w[0] * wf + r * (1 - wf)) * shade;
        g = (w[1] * wf + g * (1 - wf)) * shade;
        bl = (w[2] * wf + bl * (1 - wf)) * shade;
      }

      painted = true;
      const p = ((pz0 + z) * SIZE + (px0 + x));
      pixels[p * 4] = r;
      pixels[p * 4 + 1] = g;
      pixels[p * 4 + 2] = bl;
      pixels[p * 4 + 3] = 255;
      heights[p] = height;
    }
  }
  return painted;
}

/*
 * Mapa de biomas: color plano por celda de bioma (4x4x4), sin sombreado.
 * En el overworld se muestrea a la altura de la superficie; en el Nether y el
 * End no hay "superficie" útil (techo de bedrock, islas flotantes), así que se
 * muestrea a una altura fija de juego.
 */
/* ¿El chunk tiene terreno de verdad, o es un proto-chunk todavía sin generar? */
function hasTerrain(chunk) {
  if (chunk.heightmap) return true;          // el heightmap solo existe si hay relieve
  for (const s of chunk.sections) {          // formatos sin Heightmaps: mirar las paletas
    if (!s.states || !s.states.palette) continue;
    for (const name of s.states.palette) if (!BlockColors.isAir(name)) return true;
  }
  return false;
}

function renderChunkBiomes(chunk, pixels, px0, pz0, fixedY) {
  const sections = chunk.sections;
  if (!sections || !sections.length) return false;
  // Los proto-chunks (structure_starts, biomes…) ya traen biomas asignados pero
  // no tienen mundo: pintarlos llenaba el mapa de color y tapaba las otras capas.
  if (!hasTerrain(chunk)) return false;

  let minSec = Infinity, maxSec = -Infinity;
  for (const s of sections) {
    if (s.Y < minSec) minSec = s.Y;
    if (s.Y > maxSec) maxSec = s.Y;
  }
  const byY = new Array(maxSec - minSec + 1).fill(null);
  let any = false;
  for (const s of sections) {
    if (!s.biomes || !s.biomes.palette) continue;
    any = true;
    byY[s.Y - minSec] = {
      colors: s.biomes.palette.map((n) => BiomeColors.colorOf(n)),
      data: s.biomes.data,
      bits: bitsForBiomes(s.biomes.palette.length)
    };
  }
  if (!any) return false;

  const chunkMinY = chunk.yPos * 16;
  const hm = chunk.heightmap;
  let painted = false;

  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      /*
       * Los proto-chunks ya tienen biomas asignados pero aún no tienen terreno.
       * Sin este filtro el mapa de biomas pintaría color donde no hay mundo, y
       * encima taparía la capa de chunks generados. El heightmap a 0 delata la
       * columna vacía; sin heightmap se acepta (formatos antiguos).
       */
      const h = hm ? valueAt(hm, z * 16 + x, HEIGHT_BITS, true) : -1;
      if (h === 0) continue;

      let y = fixedY;
      if (y === null) {
        y = h > 0 ? chunkMinY + h - 1 : chunkMinY + 64;
      }
      let si = (y >> 4) - minSec;
      if (si < 0) si = 0;
      if (si >= byY.length) si = byY.length - 1;
      let s = byY[si];
      if (!s) {                                  // sección sin biomas: busca cerca
        for (let d = 1; d < byY.length && !s; d++) {
          s = byY[Math.min(byY.length - 1, si + d)] || byY[Math.max(0, si - d)];
        }
        if (!s) continue;
      }
      const idx = (((y & 15) >> 2) * 16) + ((z >> 2) * 4) + (x >> 2);
      const c = s.colors[s.data ? valueAt(s.data, idx, s.bits, true) : 0];
      if (!c) continue;
      painted = true;
      const p = ((pz0 + z) * SIZE + (px0 + x));
      pixels[p * 4] = c[0];
      pixels[p * 4 + 1] = c[1];
      pixels[p * 4 + 2] = c[2];
      pixels[p * 4 + 3] = 255;
    }
  }
  return painted;
}

/* Relieve: se compara cada píxel con el de arriba, como en los mapas del juego. */
function shade(pixels, heights) {
  for (let z = SIZE - 1; z >= 0; z--) {
    for (let x = 0; x < SIZE; x++) {
      const p = z * SIZE + x;
      if (!pixels[p * 4 + 3]) continue;
      const north = z > 0 ? p - SIZE : p;
      if (!pixels[north * 4 + 3]) continue;
      const d = heights[p] - heights[north];
      if (!d) continue;
      const f = d > 0 ? Math.min(1.28, 1 + d * 0.07) : Math.max(0.68, 1 + d * 0.07);
      pixels[p * 4] = Math.min(255, pixels[p * 4] * f);
      pixels[p * 4 + 1] = Math.min(255, pixels[p * 4 + 1] * f);
      pixels[p * 4 + 2] = Math.min(255, pixels[p * 4 + 2] * f);
    }
  }
}

/* ---------- Descompresión ---------- */

async function inflate(bytes, compression) {
  if (compression === 3) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const format = compression === 1 ? 'gzip' : 'deflate';
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return await new Response(stream).arrayBuffer();
}

/* ---------- Región completa ---------- */

async function renderRegion(buffer, mode, biomeY) {
  const view = new DataView(buffer);
  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  const heights = new Int16Array(SIZE * SIZE);
  let chunks = 0, failed = 0, unsupported = 0, firstError = null;

  const jobs = [];
  for (let i = 0; i < 1024; i++) {
    const off = (view.getUint8(i * 4) << 16) | (view.getUint8(i * 4 + 1) << 8) | view.getUint8(i * 4 + 2);
    const sectors = view.getUint8(i * 4 + 3);
    if (!off || !sectors) continue;
    const start = off * 4096;
    if (start + 5 > buffer.byteLength) { failed++; continue; }
    const length = view.getUint32(start);
    const compression = view.getUint8(start + 4);
    if (compression !== 1 && compression !== 2 && compression !== 3) { unsupported++; continue; }
    const end = Math.min(buffer.byteLength, start + 4 + length);
    jobs.push({ i, bytes: new Uint8Array(buffer, start + 5, Math.max(0, end - start - 5)), compression });
  }

  // En lotes: descomprimir es asíncrono y encadenarlo de uno en uno sale caro.
  const BATCH = 32;
  for (let b = 0; b < jobs.length; b += BATCH) {
    const slice = jobs.slice(b, b + BATCH);
    const raws = await Promise.all(slice.map(async (j) => {
      try { return await inflate(j.bytes, j.compression); } catch (_) { return null; }
    }));
    for (let k = 0; k < slice.length; k++) {
      const raw = raws[k];
      if (!raw) { failed++; continue; }
      try {
        const chunk = parseChunk(raw);
        if (!chunk) { failed++; continue; }
        const i = slice[k].i;
        const px0 = (i % 32) * 16, pz0 = ((i / 32) | 0) * 16;
        const ok = mode === 'biomes'
          ? renderChunkBiomes(chunk, pixels, px0, pz0, biomeY)
          : renderChunk(chunk, pixels, heights, px0, pz0);
        if (ok) chunks++;
      } catch (err) {
        failed++;
        if (!firstError) firstError = err.message;
      }
    }
  }

  if (mode !== 'biomes') shade(pixels, heights);   // el mapa de biomas va plano
  return { pixels, chunks, failed, unsupported, firstError };
}

self.onmessage = async (e) => {
  const { id, rx, rz, buffer, mode, biomeY } = e.data;
  const t0 = performance.now();
  try {
    const res = await renderRegion(buffer, mode || 'blocks',
      biomeY === undefined ? null : biomeY);
    self.postMessage({
      id, rx, rz, mode: mode || 'blocks', ok: true,
      pixels: res.pixels, chunks: res.chunks, failed: res.failed,
      unsupported: res.unsupported, firstError: res.firstError, ms: Math.round(performance.now() - t0)
    }, [res.pixels.buffer]);
  } catch (err) {
    self.postMessage({ id, rx, rz, mode: mode || 'blocks', ok: false, error: err.message });
  }
};
