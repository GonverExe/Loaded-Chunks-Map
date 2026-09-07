/*
 * Seguimiento en vivo del mundo: vigila la carpeta del save y relee lo que ha
 * cambiado en cuanto el juego guarda.
 *
 * Hace falta la File System Access API. Los File que deja un <input
 * webkitdirectory> o un drag&drop son una foto fija: en cuanto Minecraft
 * reescribe el archivo, volver a leerlo da error, y encima no hay forma de
 * enterarse de los region files nuevos. Con un FileSystemDirectoryHandle sí se
 * puede releer y volver a listar la carpeta cuantas veces haga falta.
 *
 * Aviso importante que la interfaz repite: el juego no vuelca a disco al
 * momento. Escribe en el autoguardado (unos 5 minutos) y al salir del mundo, así
 * que entre volcado y volcado no hay nada nuevo que leer por mucho que se mire.
 *
 * De ese mismo hecho sale la detección de "mundo abierto": no hay forma desde el
 * navegador de preguntar si Minecraft está corriendo, pero sí de mirar cuándo se
 * escribió por última vez algo en la carpeta. Si la escritura más reciente es de
 * hace menos de lo que tarda un autoguardado, el juego está dentro.
 */
(function (global) {
    'use strict';

    /*
     * Dos ritmos, porque el juego no escribe cuando quiere el navegador sino cuando
     * le toca a él:
     *
     *  - INTERVAL: la pasada completa (listar la carpeta, releer level.dat,
     *    jugadores, forceload y lo que haya cambiado). Va al ritmo del autoguardado,
     *    5 minutos, porque antes de eso no suele haber nada nuevo que leer.
     *  - WATCH: un latido corto que solo mira la fecha de cuatro archivos testigo,
     *    sin abrir ninguno. Si el juego acaba de guardar (un /save-all, un cambio de
     *    dimensión, la salida del mundo), la pasada completa se dispara al momento
     *    en vez de esperar a que venza el ciclo largo.
     */
    const INTERVAL = 5 * 60 * 1000;
    const WATCH = 2000;

    /*
     * Ventana para dar el mundo por abierto. El autoguardado va cada 5 minutos,
     * así que con algo de margen: si en los últimos 7 no se ha escrito nada, el
     * juego no está dentro.
     *
     * El precio de este método es un rabo de unos minutos al cerrar el mundo:
     * la salida escribe todo de golpe, así que se sigue viendo "abierto" hasta
     * que esa escritura envejece. Por eso la interfaz enseña también cuándo fue
     * la última escritura, que es el dato de verdad.
     */
    const OPEN_WINDOW = 7 * 60 * 1000;

    const state = {
        dir: null, // FileSystemDirectoryHandle de la carpeta del mundo
        timer: null,
        tick: null,
        watch: null, // latido corto que vigila si el juego ha guardado
        witness: 0, // fecha más reciente de los archivos testigo
        running: false,
        busy: false,
        secondsLeft: 0,
        lastWrite: 0, // mtime del archivo más reciente de la carpeta
        seen: false, // ya se ha mirado la carpeta al menos una vez
        onTick: null, // (segundosRestantes) -> void
        onUpdate: null, // (resumen) -> void
        onError: null, // (claveI18n) -> void
    };

    function supported() {
        return typeof global.showDirectoryPicker === 'function';
    }

    function hasFolder() {
        return !!state.dir;
    }

    function running() {
        return state.running;
    }

    /* Diálogo del navegador para elegir la carpeta del mundo. */
    async function pickFolder() {
        if (!supported()) return null;
        const dir = await global.showDirectoryPicker({ mode: 'read', id: 'mcworld' });
        state.dir = dir;
        return dir;
    }

    /*
     * El drag&drop de Chromium sí puede dar un handle de la carpeta soltada, y
     * con él el seguimiento arranca sin volver a pedirla.
     *
     * Recibe las promesas ya empezadas, no los DataTransferItem: esos dejan de
     * ser válidos en cuanto termina el manejador del evento drop, así que quien
     * llama tiene que invocar getAsFileSystemHandle() antes de ceder el control.
     */
    async function adoptHandles(promises) {
        for (const pr of promises) {
            try {
                const handle = await pr;
                if (handle && handle.kind === 'directory') {
                    state.dir = handle;
                    return true;
                }
            } catch (_) {
                /* sin handle: se sigue con los File de siempre */
            }
        }
        return false;
    }

    function setFolder(dir) {
        state.dir = dir || null;
    }

    function forget() {
        stop();
        state.dir = null;
        state.lastWrite = 0;
        state.seen = false;
    }

    /* El permiso de lectura puede caducar entre sesiones; se vuelve a pedir. */
    async function ensurePermission() {
        const dir = state.dir;
        if (!dir || !dir.queryPermission) return true;
        const opts = { mode: 'read' };
        if ((await dir.queryPermission(opts)) === 'granted') return true;
        return (await dir.requestPermission(opts)) === 'granted';
    }

    /*
     * Recorre la carpeta y devuelve los File con su ruta relativa puesta, igual
     * que hace el <input webkitdirectory>, para que WorldReader no note la
     * diferencia.
     *
     * poi/ y entities/ sí entran: de ahí salen los portales del Nether y lo que
     * tengan encima. Aquí solo se listan (fecha y tamaño); leerlos de verdad
     * cuesta, así que WorldReader lo hace solo cuando su huella cambia.
     */
    async function walk(dir, prefix, out) {
        for await (const entry of dir.values()) {
            const path = prefix ? prefix + '/' + entry.name : entry.name;
            if (entry.kind === 'directory') {
                await walk(entry, path, out);
            } else {
                const lower = entry.name.toLowerCase();
                const interesa =
                    lower === 'level.dat' ||
                    lower === 'chunks.dat' ||
                    // Minecraft lo reescribe justo al abrir el mundo: es la señal
                    // más limpia de que alguien acaba de entrar. WorldReader lo
                    // ignora; aquí solo interesa su fecha.
                    lower === 'session.lock' ||
                    /^r\.-?\d+\.-?\d+\.mca$/.test(lower) ||
                    /^[0-9a-f]{8}-[0-9a-f-]+\.dat$/.test(lower);
                if (!interesa) continue;
                try {
                    const file = await entry.getFile();
                    try {
                        Object.defineProperty(file, 'webkitRelativePath', { value: path });
                    } catch (_) {}
                    out.push(file);
                } catch (_) {
                    /* archivo bloqueado por el juego justo ahora: se verá en la siguiente vuelta */
                }
            }
        }
        return out;
    }

    async function listFiles() {
        if (!state.dir) return [];
        return await walk(state.dir, '', []);
    }

    /*
     * Fecha del guardado más reciente, mirando solo los archivos testigo. No abre
     * ninguno: pregunta la fecha y ya, así que sale casi gratis y se puede repetir
     * cada dos segundos sin que se note.
     *
     * Los testigos son level.dat (lo reescribe cualquier guardado, sea el
     * autoguardado o un /save-all), session.lock (se toca al abrir el mundo) y los
     * playerdata, que además se escriben al cambiar de dimensión o al desconectar.
     * Con eso se pilla todo lo que pueda mover el mapa; lo que se escapara caería
     * igualmente en la pasada completa de cada cinco minutos.
     */
    async function witnessStamp() {
        if (!state.dir) return 0;
        let newest = 0;
        const mirar = async (handle) => {
            try {
                const f = await handle.getFile();
                if (f.lastModified > newest) newest = f.lastModified;
            } catch (_) {
                /* el juego lo tiene abierto justo ahora: se verá en la siguiente vuelta */
            }
        };
        for (const nombre of ['level.dat', 'session.lock']) {
            try {
                await mirar(await state.dir.getFileHandle(nombre));
            } catch (_) {
                /* no existe en este mundo */
            }
        }
        try {
            const pd = await state.dir.getDirectoryHandle('playerdata');
            for await (const entry of pd.values()) {
                if (entry.kind === 'file') await mirar(entry);
            }
        } catch (_) {
            /* mundo sin playerdata/ */
        }
        return newest;
    }

    /* Una pasada: relee lo que haya cambiado y avisa del resumen. */
    async function checkNow(world) {
        if (state.busy || !state.dir || !world) return null;
        state.busy = true;
        try {
            const files = await listFiles();
            if (!files.length) return null;

            // Escritura más reciente de toda la carpeta: de aquí sale el estado
            // abierto/cerrado sin tener que comparar contra la pasada anterior.
            let newest = 0;
            for (const f of files) if (f.lastModified > newest) newest = f.lastModified;
            if (newest > state.lastWrite) state.lastWrite = newest;
            state.seen = true;

            const res = await WorldReader.refresh(files, world);
            if (state.onUpdate) state.onUpdate(res);
            return res;
        } catch (err) {
            if (state.onError) state.onError(err);
            return null;
        } finally {
            state.busy = false;
        }
    }

    /*
     * Arranca el ciclo. El contador va aparte del temporizador de trabajo para
     * que la cuenta atrás siga siendo fiel aunque una pasada tarde más de la
     * cuenta en un mundo grande.
     */
    async function start(getWorld) {
        if (state.running) return true;
        if (!state.dir || !(await ensurePermission())) return false;
        state.running = true;
        state.secondsLeft = INTERVAL / 1000;

        // Una pasada completa, venga del ciclo largo o del latido, deja el
        // contador a cero otra vez: lo que importa es cuándo se miró de verdad.
        const pasada = async () => {
            await checkNow(getWorld());
            state.witness = await witnessStamp();
            state.secondsLeft = INTERVAL / 1000;
            if (state.onTick) state.onTick(state.secondsLeft);
        };

        state.tick = setInterval(() => {
            state.secondsLeft = Math.max(0, state.secondsLeft - 1);
            if (state.onTick) state.onTick(state.secondsLeft);
        }, 1000);

        state.timer = setInterval(pasada, INTERVAL);

        // El latido no lee el mundo: solo mira si alguien ha guardado. Cuando lo
        // detecta, adelanta la pasada completa en vez de esperar los 5 minutos.
        state.watch = setInterval(async () => {
            if (state.busy) return;
            const ahora = await witnessStamp();
            if (ahora && ahora !== state.witness) await pasada();
        }, WATCH);

        // Una primera pasada inmediata: si el mundo ya estaba abierto, lo que se
        // ve pasa a estar al día sin esperar al primer ciclo.
        await pasada();
        return true;
    }

    /* 'open' | 'closed' | 'unknown' (todavía sin mirar la carpeta). */
    function openState() {
        if (!state.seen || !state.lastWrite) return 'unknown';
        return Date.now() - state.lastWrite < OPEN_WINDOW ? 'open' : 'closed';
    }

    /* Momento de la última escritura vista en la carpeta, o 0. */
    function lastWrite() {
        return state.lastWrite;
    }

    /*
     * Arranque automático, sin botón. Solo se intenta si ya hay permiso
     * concedido: pedirlo exige un gesto del usuario, y aquí no lo hay. En la
     * práctica siempre lo hay, porque el handle viene del diálogo de elegir
     * carpeta o de soltarla, que ya son gestos.
     */
    async function autoStart(getWorld) {
        if (state.running) return true;
        if (!state.dir) return false;
        if (state.dir.queryPermission) {
            if ((await state.dir.queryPermission({ mode: 'read' })) !== 'granted') return false;
        }
        return await start(getWorld);
    }

    function stop() {
        state.running = false;
        if (state.timer) clearInterval(state.timer);
        if (state.tick) clearInterval(state.tick);
        if (state.watch) clearInterval(state.watch);
        state.timer = null;
        state.tick = null;
        state.watch = null;
        state.witness = 0;
    }

    global.Live = {
        INTERVAL,
        supported,
        hasFolder,
        running,
        pickFolder,
        adoptHandles,
        setFolder,
        forget,
        listFiles,
        checkNow,
        start,
        autoStart,
        stop,
        openState,
        lastWrite,
        set onTick(fn) {
            state.onTick = fn;
        },
        set onUpdate(fn) {
            state.onUpdate = fn;
        },
        set onError(fn) {
            state.onError = fn;
        },
    };
})(window);
