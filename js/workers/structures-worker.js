/*
 * Worker de estructuras: recibe un region file entero y devuelve la lista de
 * estructuras que empiezan en él.
 *
 * Cada chunk guarda en su NBT las estructuras que arrancan ahí, en
 * `structures.starts` (1.18+) o `Level.Structures.Starts` (1.13 - 1.17). De ese
 * compound solo se necesitan el id y la posición, así que no se tocan ni los
 * bloques ni los biomas: es mucho más barato que renderizar el terreno.
 */
'use strict';
importScripts('nbt-lite.js');

/*
 * Un "start" trae id, ChunkX/ChunkZ y a veces BB (la caja envolvente en bloques:
 * [minX, minY, minZ, maxX, maxY, maxZ]). Si hay BB se usa su centro, que cae
 * mucho mejor sobre la estructura que el chunk de arranque.
 */
function readStart(r, name, out) {
    let id = null;
    let chunkX = null;
    let chunkZ = null;
    let bb = null;
    for (;;) {
        const t = r.u8();
        if (!t) break;
        const k = r.str();
        if (k === 'id' && t === 8) id = r.str();
        else if ((k === 'ChunkX' || k === 'chunkX') && t === 3) chunkX = r.i32();
        else if ((k === 'ChunkZ' || k === 'chunkZ') && t === 3) chunkZ = r.i32();
        else if (k === 'BB' && t === 11) {
            const n = r.i32();
            const a = new Array(n);
            for (let i = 0; i < n; i++) a[i] = r.i32();
            if (n >= 6) bb = a;
        } else skip(r, t);
    }

    // "INVALID" marca una estructura referenciada que nunca llegó a generarse:
    // se descarta entera, sin caer al nombre del compound (que sí es válido).
    if (id === 'INVALID') return;
    const real = id || name;
    if (!real || real === 'INVALID') return;

    let x = chunkX;
    let z = chunkZ;
    if (bb) {
        x = Math.floor((bb[0] + bb[3]) / 2 / 16);
        z = Math.floor((bb[2] + bb[5]) / 2 / 16);
    }
    if (x === null || z === null) return;
    out.push({ id: real, x, z });
}

function readStarts(r, out) {
    for (;;) {
        const t = r.u8();
        if (!t) break;
        const name = r.str();
        if (t === 10) readStart(r, name, out);
        else skip(r, t);
    }
}

/* structures / Structures: solo interesa la rama starts. */
function readStructures(r, out) {
    for (;;) {
        const t = r.u8();
        if (!t) break;
        const k = r.str();
        if ((k === 'starts' || k === 'Starts') && t === 10) readStarts(r, out);
        else skip(r, t);
    }
}

function scanChunk(buf, out) {
    const r = new Reader(buf);
    if (r.u8() !== 10) return;
    r.skipStr();
    const root = (r) => {
        for (;;) {
            const t = r.u8();
            if (!t) break;
            const k = r.str();
            if ((k === 'structures' || k === 'Structures') && t === 10) readStructures(r, out);
            else if (k === 'Level' && t === 10)
                root(r); // formato pre-1.18
            else skip(r, t);
        }
    };
    root(r);
}

async function inflate(bytes, compression) {
    if (compression === 3)
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const format = compression === 1 ? 'gzip' : 'deflate';
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return await new Response(stream).arrayBuffer();
}

async function scanRegion(buffer) {
    const view = new DataView(buffer);
    const found = [];
    let failed = 0;

    const jobs = [];
    for (let i = 0; i < 1024; i++) {
        const off =
            (view.getUint8(i * 4) << 16) |
            (view.getUint8(i * 4 + 1) << 8) |
            view.getUint8(i * 4 + 2);
        const sectors = view.getUint8(i * 4 + 3);
        if (!off || !sectors) continue;
        const start = off * 4096;
        if (start + 5 > buffer.byteLength) {
            failed++;
            continue;
        }
        const length = view.getUint32(start);
        const compression = view.getUint8(start + 4);
        if (compression !== 1 && compression !== 2 && compression !== 3) continue;
        const end = Math.min(buffer.byteLength, start + 4 + length);
        jobs.push({
            bytes: new Uint8Array(buffer, start + 5, Math.max(0, end - start - 5)),
            compression,
        });
    }

    const BATCH = 48;
    for (let b = 0; b < jobs.length; b += BATCH) {
        const slice = jobs.slice(b, b + BATCH);
        const raws = await Promise.all(
            slice.map(async (j) => {
                try {
                    return await inflate(j.bytes, j.compression);
                } catch (_) {
                    return null;
                }
            }),
        );
        for (const raw of raws) {
            if (!raw) {
                failed++;
                continue;
            }
            try {
                scanChunk(raw, found);
            } catch (_) {
                failed++;
            }
        }
    }

    /*
     * Una misma estructura puede aparecer en varios chunks del mismo region file
     * cuando el BB de sus piezas cae en distintos sitios; se deduplica por
     * id + posición para no apilar iconos en el mismo punto.
     */
    const seen = new Set();
    const out = [];
    for (const s of found) {
        const k = s.id + '@' + s.x + ',' + s.z;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
    }
    return { list: out, failed };
}

self.onmessage = async (e) => {
    const { id, rx, rz, buffer } = e.data;
    try {
        const res = await scanRegion(buffer);
        self.postMessage({ id, rx, rz, ok: true, list: res.list, failed: res.failed });
    } catch (err) {
        self.postMessage({ id, rx, rz, ok: false, error: err.message });
    }
};
