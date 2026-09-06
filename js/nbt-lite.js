/*
 * Lector NBT selectivo compartido por los workers: solo sabe avanzar y saltar
 * lo que no interesa, sin construir el árbol entero. Cada worker lee de aquí
 * las etiquetas que necesita.
 *
 * Se carga con importScripts(), así que Reader y skip quedan en el ámbito global
 * del worker.
 */
'use strict';

function Reader(buf) {
    this.d = new DataView(buf);
    this.u = new Uint8Array(buf);
    this.p = 0;
}
Reader.prototype = {
    u8() {
        return this.d.getUint8(this.p++);
    },
    i8() {
        return this.d.getInt8(this.p++);
    },
    i16() {
        const v = this.d.getInt16(this.p);
        this.p += 2;
        return v;
    },
    i32() {
        const v = this.d.getInt32(this.p);
        this.p += 4;
        return v;
    },
    f32() {
        const v = this.d.getFloat32(this.p);
        this.p += 4;
        return v;
    },
    f64() {
        const v = this.d.getFloat64(this.p);
        this.p += 8;
        return v;
    },
    str() {
        const n = this.d.getUint16(this.p);
        this.p += 2;
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
    skipStr() {
        const n = this.d.getUint16(this.p);
        this.p += 2 + n;
    },
};

function skip(r, type) {
    switch (type) {
        case 1:
            r.p += 1;
            break;
        case 2:
            r.p += 2;
            break;
        case 3:
            r.p += 4;
            break;
        case 4:
            r.p += 8;
            break;
        case 5:
            r.p += 4;
            break;
        case 6:
            r.p += 8;
            break;
        // Ojo: la longitud se lee a una variable. Con `r.p += r.i32()` el valor
        // de r.p se toma antes de que i32() avance el puntero, y se pierden 4 bytes.
        case 7: {
            const n = r.i32();
            r.p += n;
            break;
        }
        case 8:
            r.skipStr();
            break;
        case 9: {
            const it = r.u8(),
                n = r.i32();
            for (let i = 0; i < n; i++) skip(r, it);
            break;
        }
        case 10: {
            for (;;) {
                const t = r.u8();
                if (!t) break;
                r.skipStr();
                skip(r, t);
            }
            break;
        }
        case 11: {
            const n = r.i32();
            r.p += n * 4;
            break;
        }
        case 12: {
            const n = r.i32();
            r.p += n * 8;
            break;
        }
        default:
            throw new Error('tag NBT desconocido ' + type);
    }
}
