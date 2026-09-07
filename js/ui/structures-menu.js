/*
 * Desplegable de estructuras de la barra lateral.
 *
 * Una fila por familia, con su contador. La lista se construye una sola vez
 * y luego solo se refrescan nombres y números.
 */
(function (global) {
    'use strict';

    const $ = (id) => document.getElementById(id);

    /* ---------- Desplegable de estructuras ---------- */

    /* Una fila por familia. Se construye una sola vez; luego solo se refrescan
       los nombres y los contadores. */
    function buildStructList() {
        const cont = $('structList');
        cont.innerHTML = '';
        for (const fam of Structures.families()) {
            const label = document.createElement('label');
            label.className = 'chk';
            label.dataset.family = fam.id;

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.family = fam.id;
            input.addEventListener('change', onStructChange);

            const icon = document.createElement('span');
            icon.className = 'sicon';
            icon.innerHTML = StructureIcons.markup(fam.id, fam.color);

            const name = document.createElement('span');
            name.className = 'sname';

            const count = document.createElement('span');
            count.className = 'scount';

            label.append(input, icon, name, count);
            cont.appendChild(label);
        }
        StructMenu.render();
    }

    /* Nombres traducidos y cuántas se han encontrado hasta ahora. */
    function renderStructList() {
        for (const label of $('structList').children) {
            const fam = label.dataset.family;
            const n = Structures.count(fam);
            label.querySelector('.sname').textContent = I18n.t('struct.' + fam);
            label.querySelector('.scount').textContent = n ? String(n) : '';
            label.classList.toggle('empty', n === 0);
        }
    }

    /* Marca la casilla maestra: llena, vacía o a medias. */
    function syncStructAll() {
        const boxes = Array.from($('structList').querySelectorAll('input'));
        const on = boxes.filter((b) => b.checked).length;
        const all = $('structAll');
        all.checked = on === boxes.length && on > 0;
        all.indeterminate = on > 0 && on < boxes.length;
    }

    function onStructChange() {
        const on = Array.from($('structList').querySelectorAll('input'))
            .filter((b) => b.checked)
            .map((b) => b.dataset.family);
        Structures.setEnabled(on);
        syncStructAll();
        if (App.map) App.map.draw();
    }

    $('structAll').addEventListener('change', (e) => {
        for (const b of $('structList').querySelectorAll('input')) b.checked = e.target.checked;
        onStructChange();
    });

    function toggleStructMenu(open) {
        const menu = $('structMenu');
        const abierto = open === undefined ? $('structPanel').hidden : open;
        $('structPanel').hidden = !abierto;
        menu.classList.toggle('open', abierto);
        $('structBtn').setAttribute('aria-expanded', String(abierto));
    }

    $('structBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStructMenu();
    });
    // Clic fuera o Escape: se cierra.
    document.addEventListener('click', (e) => {
        if (!$('structPanel').hidden && !$('structMenu').contains(e.target))
            toggleStructMenu(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('structPanel').hidden) toggleStructMenu(false);
    });

    global.StructMenu = { build: buildStructList, render: renderStructList };
})(window);
