/*
 * Seguimiento en vivo del mundo: cada pocos segundos vuelve a recorrer la
 * carpeta del save y relee lo que ha cambiado.
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
 */
(function (global) {
    'use strict';

    const INTERVAL = 15000;

    const state = {
        dir: null, // FileSystemDirectoryHandle de la carpeta del mundo
        timer: null,
        tick: null,
        running: false,
        busy: false,
        secondsLeft: 0,
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
     * Se poda lo que no se lee nunca: region/ de entities y poi pesa mucho y no
     * aporta nada al mapa.
     */
    async function walk(dir, prefix, out) {
        for await (const entry of dir.values()) {
            const path = prefix ? prefix + '/' + entry.name : entry.name;
            if (entry.kind === 'directory') {
                if (entry.name === 'entities' || entry.name === 'poi') continue;
                await walk(entry, path, out);
            } else {
                const lower = entry.name.toLowerCase();
                const interesa =
                    lower === 'level.dat' ||
                    lower === 'chunks.dat' ||
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

    /* Una pasada: relee lo que haya cambiado y avisa del resumen. */
    async function checkNow(world) {
        if (state.busy || !state.dir || !world) return null;
        state.busy = true;
        try {
            const files = await listFiles();
            if (!files.length) return null;
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

        state.tick = setInterval(() => {
            state.secondsLeft = Math.max(0, state.secondsLeft - 1);
            if (state.onTick) state.onTick(state.secondsLeft);
        }, 1000);

        state.timer = setInterval(async () => {
            await checkNow(getWorld());
            state.secondsLeft = INTERVAL / 1000;
            if (state.onTick) state.onTick(state.secondsLeft);
        }, INTERVAL);

        // Una primera pasada inmediata: si el mundo ya estaba abierto, lo que se
        // ve pasa a estar al día sin esperar los quince segundos.
        await checkNow(getWorld());
        if (state.onTick) state.onTick(state.secondsLeft);
        return true;
    }

    function stop() {
        state.running = false;
        if (state.timer) clearInterval(state.timer);
        if (state.tick) clearInterval(state.tick);
        state.timer = null;
        state.tick = null;
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
        stop,
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
