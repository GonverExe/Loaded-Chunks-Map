/* Parser NBT (Named Binary Tag) para navegador. Sin dependencias. */
(function (global) {
    'use strict';

    const TAG_END = 0,
        TAG_BYTE = 1,
        TAG_SHORT = 2,
        TAG_INT = 3,
        TAG_LONG = 4,
        TAG_FLOAT = 5,
        TAG_DOUBLE = 6,
        TAG_BYTE_ARRAY = 7,
        TAG_STRING = 8,
        TAG_LIST = 9,
        TAG_COMPOUND = 10,
        TAG_INT_ARRAY = 11,
        TAG_LONG_ARRAY = 12;

    const utf8 = new TextDecoder('utf-8');

    function Reader(buffer) {
        this.view = new DataView(buffer);
        this.bytes = new Uint8Array(buffer);
        this.pos = 0;
    }
    Reader.prototype = {
        u8() {
            return this.view.getUint8(this.pos++);
        },
        i8() {
            return this.view.getInt8(this.pos++);
        },
        i16() {
            const v = this.view.getInt16(this.pos);
            this.pos += 2;
            return v;
        },
        i32() {
            const v = this.view.getInt32(this.pos);
            this.pos += 4;
            return v;
        },
        i64() {
            const v = this.view.getBigInt64(this.pos);
            this.pos += 8;
            return v;
        },
        f32() {
            const v = this.view.getFloat32(this.pos);
            this.pos += 4;
            return v;
        },
        f64() {
            const v = this.view.getFloat64(this.pos);
            this.pos += 8;
            return v;
        },
        str() {
            const len = this.view.getUint16(this.pos);
            this.pos += 2;
            const s = utf8.decode(this.bytes.subarray(this.pos, this.pos + len));
            this.pos += len;
            return s;
        },
    };

    function readPayload(r, type) {
        switch (type) {
            case TAG_BYTE:
                return r.i8();
            case TAG_SHORT:
                return r.i16();
            case TAG_INT:
                return r.i32();
            case TAG_LONG:
                return r.i64();
            case TAG_FLOAT:
                return r.f32();
            case TAG_DOUBLE:
                return r.f64();
            case TAG_BYTE_ARRAY: {
                const n = r.i32();
                const out = new Int8Array(r.view.buffer, r.pos, n).slice();
                r.pos += n;
                return out;
            }
            case TAG_STRING:
                return r.str();
            case TAG_LIST: {
                const itemType = r.u8();
                const n = r.i32();
                const out = [];
                for (let i = 0; i < n; i++) out.push(readPayload(r, itemType));
                out.__itemType = itemType;
                return out;
            }
            case TAG_COMPOUND: {
                const out = {};
                for (;;) {
                    const t = r.u8();
                    if (t === TAG_END) break;
                    const name = r.str();
                    out[name] = readPayload(r, t);
                }
                return out;
            }
            case TAG_INT_ARRAY: {
                const n = r.i32();
                const out = new Int32Array(n);
                for (let i = 0; i < n; i++) out[i] = r.i32();
                return out;
            }
            case TAG_LONG_ARRAY: {
                const n = r.i32();
                const out = new BigInt64Array(n);
                for (let i = 0; i < n; i++) out[i] = r.i64();
                return out;
            }
            default:
                throw new Error('Tag NBT desconocido: ' + type);
        }
    }

    /* Descomprime gzip/zlib si hace falta y devuelve un ArrayBuffer plano. */
    async function inflateIfNeeded(buffer) {
        const b = new Uint8Array(buffer);
        let format = null;
        if (b[0] === 0x1f && b[1] === 0x8b) format = 'gzip';
        else if (b[0] === 0x78) format = 'deflate'; // zlib
        if (!format) return buffer; // NBT sin comprimir
        if (typeof DecompressionStream === 'undefined') {
            const err = new Error(I18n.t('error.noDecompression'));
            err.i18nKey = 'error.noDecompression';
            throw err;
        }
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream(format));
        return await new Response(stream).arrayBuffer();
    }

    async function decompress(buffer, format) {
        if (format === 'none') return buffer;
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream(format));
        return await new Response(stream).arrayBuffer();
    }

    /* Devuelve { name, value } de la raíz del NBT. */
    async function parse(buffer) {
        const plain = await inflateIfNeeded(buffer);
        const r = new Reader(plain);
        const type = r.u8();
        if (type !== TAG_COMPOUND) throw new Error('NBT inválido: la raíz no es un compound.');
        const name = r.str();
        return { name, value: readPayload(r, TAG_COMPOUND) };
    }

    global.NBT = {
        parse,
        decompress,
        inflateIfNeeded,
        TAGS: {
            TAG_END,
            TAG_BYTE,
            TAG_SHORT,
            TAG_INT,
            TAG_LONG,
            TAG_FLOAT,
            TAG_DOUBLE,
            TAG_BYTE_ARRAY,
            TAG_STRING,
            TAG_LIST,
            TAG_COMPOUND,
            TAG_INT_ARRAY,
            TAG_LONG_ARRAY,
        },
    };
})(window);
