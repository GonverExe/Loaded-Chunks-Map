/*
 * Formateo de texto para la interfaz: escapado de HTML, números, cuentas atrás,
 * fechas relativas y los códigos de color de Minecraft.
 *
 * Todo aquí es función pura sobre su entrada (salvo el idioma activo, que sale
 * de I18n): no toca el DOM ni el estado del mundo, así que se puede leer y
 * probar suelto.
 */
(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
        );
    }

    /* Número con los separadores de miles del idioma activo. */
    function num(n) {
        return Number(n).toLocaleString(I18n.locale());
    }

    /* Cuenta atrás: en minutos y segundos si pasa del minuto, si no en segundos. */
    function clock(s) {
        if (s < 60) return s + ' s';
        const m = Math.floor(s / 60);
        return m + ':' + String(s % 60).padStart(2, '0');
    }

    /*
     * "hace 3 minutos", en el idioma activo. Intl.RelativeTimeFormat ya trae
     * todas las traducciones, así que no hay que inventarse cadenas.
     */
    function ago(ms) {
        if (!ms) return I18n.t('live.neverWrite');
        const seg = Math.round((ms - Date.now()) / 1000);
        const rtf = new Intl.RelativeTimeFormat(I18n.locale(), { numeric: 'auto' });
        const abs = Math.abs(seg);
        if (abs < 60) return rtf.format(seg, 'second');
        if (abs < 3600) return rtf.format(Math.round(seg / 60), 'minute');
        if (abs < 86400) return rtf.format(Math.round(seg / 3600), 'hour');
        return rtf.format(Math.round(seg / 86400), 'day');
    }

    /* ---------- Códigos de formato de Minecraft (§) ---------- */

    /* Paleta de Java Edition, tal cual la usa el juego al pintar texto. */
    const MC_COLORS = {
        0: '#000000',
        1: '#0000aa',
        2: '#00aa00',
        3: '#00aaaa',
        4: '#aa0000',
        5: '#aa00aa',
        6: '#ffaa00',
        7: '#aaaaaa',
        8: '#555555',
        9: '#5555ff',
        a: '#55ff55',
        b: '#55ffff',
        c: '#ff5555',
        d: '#ff55ff',
        e: '#ffff55',
        f: '#ffffff',
    };

    /* Para nombres de archivo y cualquier sitio donde solo cabe texto plano. */
    function stripFormat(s) {
        return String(s).replace(/§./g, '');
    }

    function mcWrap(st, text) {
        const css = [];
        if (st.color) css.push('color:' + st.color);
        if (st.bold) css.push('font-weight:700');
        if (st.italic) css.push('font-style:italic');
        const deco = [st.under ? 'underline' : '', st.strike ? 'line-through' : '']
            .filter(Boolean)
            .join(' ');
        if (deco) css.push('text-decoration:' + deco);
        if (!css.length && !st.obf) return text;
        // §k (obfuscated) no se anima: basta con que se lea como texto ilegible.
        return (
            '<span' +
            (st.obf ? ' class="mc-obf"' : '') +
            (css.length ? ' style="' + css.join(';') + '"' : '') +
            '>' +
            text +
            '</span>'
        );
    }

    /*
     * Convierte un LevelName con códigos § en HTML. Se sigue la regla del juego:
     * un código de color reinicia el resto del formato, §r lo reinicia todo y los
     * códigos que no existen simplemente se comen.
     */
    function mcFormat(s) {
        const txt = String(s);
        const limpio = () => ({
            color: null,
            bold: false,
            italic: false,
            under: false,
            strike: false,
            obf: false,
        });
        let cur = limpio();
        let buf = '';
        let html = '';
        const flush = () => {
            if (buf) html += mcWrap(cur, escapeHtml(buf));
            buf = '';
        };
        for (let i = 0; i < txt.length; i++) {
            if (txt[i] === '§' && i + 1 < txt.length) {
                const code = txt[++i].toLowerCase();
                flush();
                if (MC_COLORS[code]) {
                    cur = limpio();
                    cur.color = MC_COLORS[code];
                } else if (code === 'l') cur.bold = true;
                else if (code === 'o') cur.italic = true;
                else if (code === 'n') cur.under = true;
                else if (code === 'm') cur.strike = true;
                else if (code === 'k') cur.obf = true;
                else if (code === 'r') cur = limpio();
                continue;
            }
            buf += txt[i];
        }
        flush();
        return html;
    }

    global.Fmt = { escapeHtml, num, clock, ago, stripFormat, mcFormat };
})(window);
