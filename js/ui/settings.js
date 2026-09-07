/*
 * Ajustes de la esquina: tema e idioma, y el repintado que exige cambiarlos.
 */
(function (global) {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const { escapeHtml } = Fmt;

    /* ---------- Ajustes: tema e idioma ---------- */

    const SUN =
        '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>';
    const MOON = '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path>';

    function paintThemeButton() {
        const dark = Theme.current() === 'dark';
        // En oscuro se ofrece pasar a claro, y al revés.
        $('themeIcon').innerHTML = dark ? SUN : MOON;
        const key = dark ? 'settings.theme.toLight' : 'settings.theme.toDark';
        $('themeBtn').setAttribute('data-i18n-title', key);
        $('themeBtn').setAttribute('data-i18n-aria', key);
        $('themeBtn').title = I18n.t(key);
        $('themeBtn').setAttribute('aria-label', I18n.t(key));
    }

    /* El selector se rellena con los nombres nativos de cada idioma. */
    function paintLangSelect() {
        const sel = $('langSelect');
        if (!sel.options.length) {
            for (const code of I18n.langs) {
                const o = document.createElement('option');
                o.value = code;
                o.textContent = I18n.names[code] || code;
                sel.appendChild(o);
            }
        }
        sel.value = I18n.lang;
    }

    $('themeBtn').addEventListener('click', () => Theme.toggle());
    $('langSelect').addEventListener('change', (e) => I18n.set(e.target.value));

    Theme.onChange(() => {
        Settings.paintThemeButton();
        if (App.map) App.map.refreshTheme();
    });

    I18n.onChange(() => {
        Settings.paintLangSelect();
        Settings.paintThemeButton();
        if (App.lastErrorKey)
            $('dropHint').innerHTML =
                '<span class="err">' + escapeHtml(I18n.t(App.lastErrorKey)) + '</span>';
        if (App.world && App.dim) {
            Panel.renderWorldInfo();
            Panel.renderWarnings();
            Panel.renderDimSelect();
            Panel.renderSpawnNote();
            Panel.checkTerrainSupport();
            Panel.checkStructureSupport();
            StructMenu.render();
            LiveStatus.render();
            App.update(false); // recalcula los textos de cada chunk
        }
        if (App.map) App.map.refreshText();
    });

    global.Settings = { paintThemeButton, paintLangSelect };
})(window);
