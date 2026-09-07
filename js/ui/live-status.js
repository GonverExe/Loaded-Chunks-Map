/*
 * Chapa de seguimiento en vivo y reacción a lo que cambia en la carpeta.
 */
(function (global) {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const { num } = Fmt;

    /* ---------- Seguimiento en vivo ---------- */

    let liveMsg = null; // último resumen, para no perderlo al repintar
    let liveEstado = null; // abierto/cerrado de la última vez que se pintó

    /*
     * Indicador central. Ya no se pulsa nada: el seguimiento arranca solo en
     * cuanto hay una carpeta relegible, y esto solo cuenta lo que está pasando.
     *
     * Tres estados: sin poder mirar (navegador sin File System Access API o
     * mundo cargado sin handle), mirando sin saber todavía, y sabiendo si el
     * mundo está abierto o cerrado.
     */
    function renderLive(secondsLeft) {
        const chip = $('liveStatus');
        const nota = $('liveNote');

        // Sin carpeta relegible no hay nada que decir del mundo: se esconde la
        // chapa entera en vez de afirmar que está cerrado, que no lo sabemos.
        if (!Live.supported() || !Live.hasFolder()) {
            chip.hidden = true;
            nota.textContent = Live.supported()
                ? I18n.t('live.nofolder')
                : I18n.t('live.unsupported');
            nota.classList.add('warn');
            return;
        }
        chip.hidden = false;
        nota.classList.remove('warn');

        const estado = Live.openState();
        /*
         * El estado cambia solo con que pase el tiempo, sin que nadie escriba
         * nada. Como de él depende que se vea al jugador, en cuanto cambia hay
         * que rehacer el mapa: si no, la chincheta tardaría un ciclo en irse.
         */
        if (estado !== liveEstado) {
            const primera = liveEstado === null;
            liveEstado = estado;
            if (!primera && App.world && App.dim) App.update(false);
        }
        chip.classList.toggle('open', estado === 'open');
        chip.classList.toggle('closed', estado === 'closed');

        if (estado === 'unknown') {
            $('liveLabel').textContent = I18n.t('live.waiting');
            nota.textContent = liveMsg || I18n.t('live.note');
            return;
        }

        /*
         * Con el mundo abierto interesa la cuenta atrás; con el mundo cerrado,
         * saber desde cuándo lo está. Si el ciclo es de un par de segundos la
         * cuenta atrás no aporta nada (parpadearía entre 1 y 0), así que se
         * enseña directamente que está mirando.
         */
        const s = secondsLeft == null ? Live.INTERVAL / 1000 : secondsLeft;
        const cuentaAtras = Live.INTERVAL >= 5000;
        const cabeza = estado === 'open' ? I18n.t('live.open') : I18n.t('live.closed');
        const cola =
            estado === 'open'
                ? cuentaAtras && s > 0
                    ? I18n.t('live.next', { t: Fmt.clock(s) })
                    : I18n.t('live.checking')
                : I18n.t('live.lastWrite', { t: Fmt.ago(Live.lastWrite()) });
        $('liveLabel').textContent = cabeza + ' · ' + cola;
        nota.textContent = liveMsg || I18n.t('live.note');
    }

    /*
     * Resumen de una pasada. Las regiones que el juego ha reescrito se invalidan
     * en el terreno y en las estructuras para que se vuelvan a leer; si no, el
     * mapa seguiría enseñando la tesela vieja.
     */
    function onLiveUpdate(res) {
        if (!res) return;
        for (const r of res.touched) {
            if (App.dim && r.dim !== App.dim.id) continue;
            Terrain.invalidate(r.rx, r.rz);
            Structures.invalidate(r.rx, r.rz);
        }

        const partes = [];
        if (res.newChunks > 0) partes.push(I18n.t('live.changed', { chunks: num(res.newChunks) }));
        if (res.playersMoved) partes.push(I18n.t('live.moved'));
        if (res.forcedChanged) partes.push(I18n.t('live.forced'));
        if (res.loadersChanged) partes.push(I18n.t('live.loaders'));
        if (res.versionChanged || res.spawnChanged) partes.push(I18n.t('live.version'));
        const hora = new Date().toLocaleTimeString(I18n.locale());
        liveMsg =
            (partes.length ? partes.join(' · ') : I18n.t('live.nochange')) +
            ' — ' +
            I18n.t('live.at', { time: hora });

        // El radio de spawn puede haber cambiado de versión: se relee del mundo.
        if (res.versionChanged) $('spawnRadius').value = App.spawnState().radius;
        Panel.renderWorldInfo();
        Panel.renderWarnings();
        Panel.renderDimSelect();
        Panel.renderSpawnNote();
        App.update(false);
        LiveStatus.render();
    }

    function onLiveError(err) {
        liveMsg = I18n.t('live.failed', { msg: err && err.message ? err.message : '?' });
        LiveStatus.render();
    }

    /*
     * Arranque automático tras cargar un mundo. Solo funciona si la carpeta se
     * eligió con el diálogo del navegador o se soltó con handle; con el <input
     * webkitdirectory> de repuesto no hay nada que releer y el indicador lo dice.
     */
    async function startLive() {
        LiveStatus.render();
        if (!Live.supported() || !Live.hasFolder()) return;
        $('liveStatus').classList.add('busy');
        const ok = await Live.autoStart(() => App.world);
        $('liveStatus').classList.remove('busy');
        if (!ok) liveMsg = I18n.t('live.denied');
        LiveStatus.render();
    }

    global.LiveStatus = {
        render: renderLive,
        onUpdate: onLiveUpdate,
        onError: onLiveError,
        start: startLive,
    };
})(window);
