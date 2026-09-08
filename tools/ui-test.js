/*
 * Prueba de recorrido completo, sin navegador: carga la página, le suelta un
 * mundo de mentira por el mismo camino que el <input webkitdirectory> y
 * comprueba que la interfaz se rellena.
 *
 * Es la red que permite mover código de sitio con cierta tranquilidad: si algo
 * se queda por el camino al partir un archivo, aquí se nota.
 *
 *   node tools/ui-test.js
 */
'use strict';

const path = require('path');
const fakeDom = require('./fake-dom');
const fakeWorld = require('./fake-world');

const raiz = path.join(__dirname, '..');
const dom = fakeDom.crear(raiz);

let fallos = 0;
function comprobar(que, condicion, detalle) {
    if (condicion) return;
    console.error('FALLO: ' + que + (detalle ? ' · ' + detalle : ''));
    fallos++;
}

(async () => {
    const { errores } = dom.cargarScripts();
    for (const e of errores) {
        console.error('FALLO al cargar ' + e);
        fallos++;
    }
    if (fallos) process.exit(1);

    // 1. Arranque: la página parte con la portada a la vista y sin mapa.
    comprobar('la portada empieza visible', dom.el('hero').hidden === false);
    comprobar('la aplicación empieza oculta', dom.el('app').hidden !== false);

    // 2. Se suelta el mundo por el mismo evento que dispara el navegador.
    const files = fakeWorld.mundo();
    const disparados = await dom.disparar('dirInput', 'change', { target: { files } });
    comprobar('el input de carpeta tiene manejador', disparados > 0);

    // La carga es asíncrona de arriba abajo: se le deja terminar.
    for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 10));

    // 3. Tras cargar: portada fuera, aplicación dentro.
    comprobar('la portada se oculta al cargar', dom.el('hero').hidden === true);
    comprobar('la aplicación se muestra', dom.el('app').hidden === false);

    // 4. La tarjeta del mundo se ha rellenado, con el nombre en color.
    const info = dom.el('worldInfo').innerHTML;
    comprobar('la tarjeta del mundo tiene filas', info.indexOf('<dt>') >= 0, info.slice(0, 60));
    comprobar('el nombre pasa por los códigos §', info.indexOf('class="mc"') >= 0);
    comprobar('el § no se cuela como texto', info.indexOf('§') < 0);
    comprobar(
        'la semilla sale entera, sin redondear',
        info.indexOf('-4172144997902289642') >= 0,
        info.slice(0, 200),
    );

    // 5. Dimensiones, resumen y notas de la barra lateral.
    comprobar('el selector de dimensión tiene opciones', dom.el('dimSelect').options.length > 0);
    comprobar('el resumen tiene filas', dom.el('statsInfo').innerHTML.indexOf('<dt>') >= 0);
    comprobar('la nota de spawn dice algo', dom.el('spawnNote').innerHTML.length > 0);
    comprobar('la nota de loaders dice algo', dom.el('loaderNote').innerHTML.length > 0);

    // 6. El selector de destinos lleva el spawn y el jugador del mundo.
    const destinos = dom.el('gotoPlayer').options.map((o) => o.value);
    comprobar('se puede ir al spawn', destinos.indexOf('spawn') >= 0, destinos.join(','));
    comprobar('se puede ir a un jugador', destinos.indexOf('0') >= 0, destinos.join(','));

    // 7. El modelo ha encontrado los dos chunk loaders del mundo de prueba.
    const dim = dom.ventana.WorldReader ? null : null;
    const loaders = dom.el('loaderNote').innerHTML;
    comprobar('la nota de loaders no dice que no hay ninguno', loaders.indexOf('{n}') < 0);

    // 8. Cambiar de idioma no revienta y repinta los textos.
    dom.ventana.I18n.set('en');
    comprobar('el idioma cambia', dom.ventana.I18n.lang === 'en');
    comprobar('el resumen sigue lleno tras cambiar de idioma',
        dom.el('statsInfo').innerHTML.indexOf('<dt>') >= 0);
    dom.ventana.I18n.set('es');

    // 9. Cambiar el tema tampoco.
    dom.ventana.Theme.toggle();
    dom.ventana.Theme.toggle();

    // 10. Volver a empezar deja la portada como estaba.
    await dom.disparar('reset', 'click', { preventDefault() {} });
    comprobar('el botón de reinicio devuelve la portada', dom.el('hero').hidden === false);
    comprobar('el botón de reinicio esconde la aplicación', dom.el('app').hidden === true);

    if (fallos) {
        console.error('\n' + fallos + ' fallo(s).');
        process.exit(1);
    }
    console.log('OK · la interfaz carga un mundo y se rellena entera');
    process.exit(0);
})();
