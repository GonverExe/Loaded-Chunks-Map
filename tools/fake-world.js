/*
 * Fabrica un save de mentira: NBT binario de verdad dentro de region files de
 * verdad, para poder probar el lector sin necesitar una carpeta de Minecraft.
 */
'use strict';

const zlib = require('zlib');

const TAG = {
    BYTE: 1,
    SHORT: 2,
    INT: 3,
    LONG: 4,
    DOUBLE: 6,
    STRING: 8,
    LIST: 9,
    COMPOUND: 10,
    INT_ARRAY: 11,
};

class W {
    constructor() {
        this.b = [];
    }
    u8(v) {
        this.b.push(v & 255);
        return this;
    }
    i16(v) {
        this.b.push((v >> 8) & 255, v & 255);
        return this;
    }
    i32(v) {
        this.b.push((v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
        return this;
    }
    i64(v) {
        const buf = Buffer.alloc(8);
        buf.writeBigInt64BE(BigInt(v));
        for (const x of buf) this.b.push(x);
        return this;
    }
    f64(v) {
        const buf = Buffer.alloc(8);
        buf.writeDoubleBE(v);
        for (const x of buf) this.b.push(x);
        return this;
    }
    str(s) {
        const buf = Buffer.from(s, 'utf8');
        this.i16(buf.length);
        for (const x of buf) this.b.push(x);
        return this;
    }
    buf() {
        return Buffer.from(this.b);
    }
}

function escribeValor(w, tipo, v) {
    if (tipo === TAG.BYTE) w.u8(v);
    else if (tipo === TAG.SHORT) w.i16(v);
    else if (tipo === TAG.INT) w.i32(v);
    else if (tipo === TAG.LONG) w.i64(v);
    else if (tipo === TAG.DOUBLE) w.f64(v);
    else if (tipo === TAG.STRING) w.str(v);
    else if (tipo === TAG.INT_ARRAY) {
        w.i32(v.length);
        for (const n of v) w.i32(n);
    } else if (tipo === TAG.LIST) {
        w.u8(v.tipo).i32(v.items.length);
        for (const it of v.items) escribeValor(w, v.tipo, it);
    } else if (tipo === TAG.COMPOUND) {
        for (const [k, ent] of Object.entries(v)) {
            w.u8(ent.t).str(k);
            escribeValor(w, ent.t, ent.v);
        }
        w.u8(0);
    }
}

/* Compound raíz sin nombre, como el de cualquier archivo NBT del juego. */
function nbt(obj) {
    const w = new W();
    w.u8(TAG.COMPOUND).str('');
    escribeValor(w, TAG.COMPOUND, obj);
    return w.buf();
}

/* Contenedor .mca: 8 KiB de cabecera y luego cada chunk comprimido con zlib. */
function mca(chunks) {
    const cabecera = Buffer.alloc(8192);
    const cuerpos = [];
    let sector = 2;
    for (const { index, data } of chunks) {
        const comprimido = zlib.deflateSync(data);
        const cuerpo = Buffer.alloc(Math.ceil((comprimido.length + 5) / 4096) * 4096);
        cuerpo.writeUInt32BE(comprimido.length + 1, 0);
        cuerpo.writeUInt8(2, 4); // 2 = zlib
        comprimido.copy(cuerpo, 5);
        const sectores = cuerpo.length / 4096;
        cabecera.writeUInt8((sector >> 16) & 255, index * 4);
        cabecera.writeUInt8((sector >> 8) & 255, index * 4 + 1);
        cabecera.writeUInt8(sector & 255, index * 4 + 2);
        cabecera.writeUInt8(sectores, index * 4 + 3);
        cabecera.writeUInt32BE(1700000000, 4096 + index * 4);
        cuerpos.push(cuerpo);
        sector += sectores;
    }
    return Buffer.concat([cabecera, ...cuerpos]);
}

/* File de mentira con lo que usa WorldReader: arrayBuffer(), slice() y fechas. */
function archivo(ruta, buffer, mtime) {
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return {
        name: ruta.split('/').pop(),
        webkitRelativePath: ruta,
        size: buffer.length,
        lastModified: mtime || 1700000000000,
        arrayBuffer: async () => ab,
        slice: (a, b) => ({ arrayBuffer: async () => ab.slice(a, b) }),
    };
}

/*
 * Un mundo pequeño pero completo: nombre con códigos de color, spawn, jugador,
 * una región generada, un portal con una vagoneta encima y una perla suelta.
 */
function mundo(opciones) {
    const o = opciones || {};
    const portalX = o.portalX === undefined ? 544 : o.portalX;
    const portalZ = o.portalZ === undefined ? 672 : o.portalZ;
    const cx = Math.floor(portalX / 16),
        cz = Math.floor(portalZ / 16);
    const indice = (cz & 31) * 32 + (cx & 31);
    const rx = Math.floor(cx / 32),
        rz = Math.floor(cz / 32);

    const level = nbt({
        Data: {
            t: TAG.COMPOUND,
            v: {
                LevelName: { t: TAG.STRING, v: o.nombre || '§eMundo §bde prueba' },
                DataVersion: { t: TAG.INT, v: 3700 },
                LastPlayed: { t: TAG.LONG, v: 1700000000000 },
                SpawnX: { t: TAG.INT, v: 0 },
                SpawnY: { t: TAG.INT, v: 64 },
                SpawnZ: { t: TAG.INT, v: 0 },
                BorderCenterX: { t: TAG.DOUBLE, v: 0 },
                BorderCenterZ: { t: TAG.DOUBLE, v: 0 },
                BorderSize: { t: TAG.DOUBLE, v: o.border || 60000000 },
                Version: {
                    t: TAG.COMPOUND,
                    v: { Name: { t: TAG.STRING, v: o.version || '1.20.4' } },
                },
                Player: {
                    t: TAG.COMPOUND,
                    v: {
                        Pos: {
                            t: TAG.LIST,
                            v: { tipo: TAG.DOUBLE, items: [8.5, 70, 8.5] },
                        },
                        Dimension: { t: TAG.STRING, v: 'minecraft:overworld' },
                    },
                },
            },
        },
    });

    const poi = nbt({
        DataVersion: { t: TAG.INT, v: 3700 },
        Sections: {
            t: TAG.COMPOUND,
            v: {
                4: {
                    t: TAG.COMPOUND,
                    v: {
                        Valid: { t: TAG.BYTE, v: 1 },
                        Records: {
                            t: TAG.LIST,
                            v: {
                                tipo: TAG.COMPOUND,
                                items: [
                                    {
                                        pos: { t: TAG.INT_ARRAY, v: [portalX, 64, portalZ] },
                                        type: { t: TAG.STRING, v: 'minecraft:nether_portal' },
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        },
    });

    const entidades = nbt({
        DataVersion: { t: TAG.INT, v: 3700 },
        Position: { t: TAG.INT_ARRAY, v: [cx, cz] },
        Entities: {
            t: TAG.LIST,
            v: {
                tipo: TAG.COMPOUND,
                items: [
                    {
                        id: { t: TAG.STRING, v: 'minecraft:minecart' },
                        Pos: {
                            t: TAG.LIST,
                            v: { tipo: TAG.DOUBLE, items: [portalX + 0.5, 65, portalZ + 0.5] },
                        },
                    },
                    {
                        id: { t: TAG.STRING, v: 'minecraft:ender_pearl' },
                        Pos: {
                            t: TAG.LIST,
                            v: { tipo: TAG.DOUBLE, items: [portalX + 100, 70, portalZ + 100] },
                        },
                    },
                ],
            },
        },
    });

    // La región solo necesita cabecera: el mapa la usa para saber qué existe.
    const region = mca([{ index: indice, data: nbt({ DataVersion: { t: TAG.INT, v: 3700 } }) }]);
    const r = 'r.' + rx + '.' + rz + '.mca';

    return [
        archivo('mundo/level.dat', level),
        archivo('mundo/region/' + r, region),
        archivo('mundo/poi/' + r, mca([{ index: indice, data: poi }])),
        archivo('mundo/entities/' + r, mca([{ index: indice, data: entidades }])),
    ];
}

module.exports = { TAG, nbt, mca, archivo, mundo };
