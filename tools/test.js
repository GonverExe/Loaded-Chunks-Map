/*
 * Lanza todas las comprobaciones del proyecto.
 *
 *   node tools/test.js
 *
 * No hace falta instalar nada: son scripts de Node sueltos que cargan el mismo
 * código que sirve la página, con un DOM y un save de mentira.
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const pruebas = [
    ['smoke-test.js', 'arranque de la página'],
    ['world-test.js', 'lectura del save y modelo de chunks'],
    ['ui-test.js', 'recorrido completo de la interfaz'],
    ['terrain-test.js', 'cola de teselas (tarda ~25 s)'],
];

let fallos = 0;
for (const [archivo, que] of pruebas) {
    process.stdout.write('· ' + que + '… ');
    try {
        const salida = execFileSync(process.execPath, [path.join(__dirname, archivo)], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        process.stdout.write(salida.trim().split('\n').pop() + '\n');
    } catch (err) {
        process.stdout.write('FALLA\n');
        process.stdout.write((err.stdout || '') + (err.stderr || ''));
        fallos++;
    }
}

if (fallos) {
    console.error('\n' + fallos + ' prueba(s) con fallos.');
    process.exit(1);
}
console.log('\nTodo en orden.');
