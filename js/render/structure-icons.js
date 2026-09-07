/*
 * Iconos de las estructuras: una silueta dibujada a mano por familia, sobre una
 * rejilla de 24x24. Cada icono es una chapa redonda del color de la familia con
 * la silueta encima, para que se lea sobre cualquier terreno.
 *
 * Las siluetas son solo datos de path, así que sirven para las dos salidas sin
 * duplicarlas: Path2D en el canvas del mapa y <svg> en la lista del desplegable.
 * Se usa Path2D y no una Image con data URI a propósito: pintar un SVG en el
 * canvas puede contaminarlo en algunos navegadores y dejar sin funcionar el
 * botón de exportar PNG.
 */
(function (global) {
    'use strict';

    const INK = '#101828'; // huecos oscuros: puertas, ojos, ventanas
    const FILL = '#ffffff';

    /*
     * Cada silueta es una lista de trazos. `k: true` pinta el trazo en oscuro
     * en vez de en blanco, que es lo que da los huecos.
     */
    const GLYPHS = {
        // Dos casas con tejado a dos aguas.
        village: [{ d: 'M4 12.5 8 9l4 3.5V18H4z' }, { d: 'M12 14l3.5-3L19 14v4h-7z' }],
        // Torre de vigilancia con voladizo.
        pillager_outpost: [{ d: 'M9 8h6v10H9z' }, { d: 'M7.5 5.5h9V8h-9z' }],
        // Pico de minero: arco del hierro y mango.
        mineshaft: [
            { d: 'M4.4 12.2c4.3-4.2 10.9-4.2 15.2 0l-1.6 1.8c-3.5-3.2-8.5-3.2-12 0z' },
            { d: 'M10.8 10.6h2.4V19h-2.4z' },
        ],
        // Ojo de ender.
        stronghold: [
            { d: 'M3.5 12S7 7.5 12 7.5 20.5 12 20.5 12 17 16.5 12 16.5 3.5 12 3.5 12z' },
            { d: 'M9.6 12a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 1 0-4.8 0z', k: true },
        ],
        // Pirámide lisa con la entrada marcada.
        desert_pyramid: [{ d: 'M12 5 20 18H4z' }, { d: 'M10.6 18v-3.4h2.8V18z', k: true }],
        // Pirámide escalonada.
        jungle_pyramid: [
            { d: 'M8.5 7h7v3.2h-7z' },
            { d: 'M6 10.6h12v3.2H6z' },
            { d: 'M3.5 14h17v4h-17z' },
        ],
        // Cabaña de bruja: tejado, cuerpo y las dos patas sobre el pantano.
        swamp_hut: [
            { d: 'M12 4 3.5 10.6h17z' },
            { d: 'M6.5 10.6h11V15h-11z' },
            { d: 'M7.6 15h2.1v4.5H7.6z' },
            { d: 'M14.3 15h2.1v4.5h-2.1z' },
            { d: 'M10.7 11.8h2.6v3.2h-2.6z', k: true },
        ],
        // Cúpula de hielo con el túnel de entrada.
        igloo: [
            { d: 'M3.5 17a8.5 8.5 0 0 1 17 0z' },
            { d: 'M9.8 17v-3.4a2.2 2.2 0 0 1 4.4 0V17z', k: true },
        ],
        // Columnas partidas a distinta altura.
        ocean_ruin: [
            { d: 'M5 9.5h3.2V18H5z' },
            { d: 'M10.4 12.4h3.2V18h-3.2z' },
            { d: 'M15.8 8h3.2v10h-3.2z' },
        ],
        // Casco, mástil y vela.
        shipwreck: [
            { d: 'M3.5 13.5h17L18 18.5H6z' },
            { d: 'M11 3.5h1.8v10H11z' },
            { d: 'M12.8 4.6 18 8l-5.2 3.4z' },
        ],
        // Cofre con el cierre.
        buried_treasure: [
            { d: 'M4.5 7.5h15v3.4h-15z' },
            { d: 'M4.5 11.4h15V18h-15z' },
            { d: 'M10.9 10.2h2.2v3.4h-2.2z', k: true },
        ],
        // Templo del monumento con el ojo del guardián.
        monument: [
            { d: 'M12 4 20.5 10H3.5z' },
            { d: 'M5.5 10.4h13V18h-13z' },
            { d: 'M9.9 14a2.1 2.1 0 1 0 4.2 0 2.1 2.1 0 1 0-4.2 0z', k: true },
        ],
        // Casa grande con ventanas.
        mansion: [
            { d: 'M12 3.6 21 10H3z' },
            { d: 'M4.6 10.4h14.8V18H4.6z' },
            { d: 'M7 12.4h2.6v2.6H7z', k: true },
            { d: 'M14.4 12.4H17v2.6h-2.6z', k: true },
        ],
        // Marco de portal con el dintel roto.
        ruined_portal: [
            { d: 'M5.5 5.5h13v3.2h-13z' },
            { d: 'M5.5 8.7h3.4V18H5.5z' },
            { d: 'M15.1 8.7h3.4V18h-3.4z' },
            { d: 'M13.6 5.5h2.2v3.2h-2.2z', k: true },
        ],
        // Bloque de sculk hexagonal con el núcleo oscuro.
        ancient_city: [
            { d: 'M12 3.4 19.4 7.7v8.6L12 20.6 4.6 16.3V7.7z' },
            { d: 'M12 8.6 15.6 10.7v4.2L12 17l-3.6-2.1v-4.2z', k: true },
        ],
        // Losas del sendero.
        trail_ruins: [
            { d: 'M4.5 7.6h5.2v4H4.5z' },
            { d: 'M11.5 7.6h8v4h-8z' },
            { d: 'M4.5 13.2h8v4h-8z' },
            { d: 'M14.3 13.2h5.2v4h-5.2z' },
        ],
        // Cámara acorazada con la cerradura.
        trial_chambers: [
            { d: 'M4.6 5.6h14.8v13H4.6z' },
            { d: 'M9.8 10.6a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0z', k: true },
            { d: 'M11 11.6h2v4.2h-2z', k: true },
        ],
        // Arcos de ladrillo del Nether.
        fortress: [
            { d: 'M3.5 7.4h17v3.2h-17z' },
            { d: 'M3.5 10.6h3.4V19H3.5z' },
            { d: 'M10.3 10.6h3.4V19h-3.4z' },
            { d: 'M17.1 10.6h3.4V19h-3.4z' },
        ],
        // Muralla almenada.
        bastion_remnant: [
            { d: 'M4 10.4h16V18.5H4z' },
            { d: 'M4 6.6h3.4v3.8H4z' },
            { d: 'M10.3 6.6h3.4v3.8h-3.4z' },
            { d: 'M16.6 6.6H20v3.8h-3.4z' },
        ],
        // Costillar del fósil.
        nether_fossil: [
            { d: 'M10.9 4.5h2.2v15h-2.2z' },
            { d: 'M6.4 7h11.2v2H6.4z' },
            { d: 'M6.4 11h11.2v2H6.4z' },
            { d: 'M6.4 15h11.2v2H6.4z' },
        ],
        // Torre del End con la baliza.
        end_city: [
            { d: 'M8.8 7.4h6.4V19H8.8z' },
            { d: 'M6.8 7.4h10.4v2.2H6.8z' },
            { d: 'M11 2.6h2v4.8h-2z' },
        ],
        // Cualquier estructura no reconocida (mods, versiones nuevas).
        other: [
            { d: 'M12 4.4 17 12l-5 7.6L7 12z' },
            { d: 'M10.1 12a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 1 0-3.8 0z', k: true },
        ],
    };

    const paths = new Map(); // familia -> [{ path: Path2D, k }]

    function glyphOf(family) {
        return GLYPHS[family] || GLYPHS.other;
    }

    /* Path2D se construye una vez por familia y se reutiliza en cada frame. */
    function compiled(family) {
        let list = paths.get(family);
        if (list) return list;
        list = glyphOf(family).map((s) => ({ path: new Path2D(s.d), k: s.k }));
        paths.set(family, list);
        return list;
    }

    /*
     * Pinta el icono centrado en (x, y) con el tamaño pedido, en píxeles de
     * pantalla. La silueta viene en coordenadas 0..24, así que se escala.
     */
    function draw(ctx, family, color, x, y, size) {
        const s = size / 24;
        ctx.save();
        ctx.translate(x - size / 2, y - size / 2);
        ctx.scale(s, s);

        ctx.beginPath();
        ctx.arc(12, 12, 11, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = INK;
        ctx.stroke();

        for (const shape of compiled(family)) {
            ctx.fillStyle = shape.k ? INK : FILL;
            ctx.fill(shape.path);
        }
        ctx.restore();
    }

    /* El mismo icono como SVG, para la lista del desplegable. */
    function markup(family, color) {
        let out =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
            '<circle cx="12" cy="12" r="11" fill="' +
            color +
            '" stroke="' +
            INK +
            '" stroke-width="1.6"/>';
        for (const shape of glyphOf(family)) {
            out += '<path d="' + shape.d + '" fill="' + (shape.k ? INK : FILL) + '"/>';
        }
        return out + '</svg>';
    }

    global.StructureIcons = { draw, markup };
})(window);
