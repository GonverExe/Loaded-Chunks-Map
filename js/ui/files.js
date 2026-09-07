/*
 * Entrada de archivos: elegir carpeta, arrastrarla y leerla.
 *
 * Con la File System Access API se pide un handle, que es lo único que se
 * puede releer luego; sin ella se cae al <input webkitdirectory> de siempre.
 */
(function (global) {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const { escapeHtml } = Fmt;

    /* ---------- Entrada de archivos ---------- */

    const drop = $('drop');
    /*
     * Con la File System Access API se pide un handle de la carpeta en vez de una
     * lista de File: es lo único que se puede releer y volver a listar más tarde,
     * y por tanto lo que hace posible el seguimiento en vivo. Sin ella se cae al
     * <input webkitdirectory> de siempre, que solo sirve para una foto fija.
     */
    $('pickDir').addEventListener('click', async () => {
        if (!Live.supported()) {
            $('dirInput').click();
            return;
        }
        let dir;
        try {
            dir = await Live.pickFolder();
        } catch (_) {
            return; // el usuario ha cancelado el diálogo
        }
        if (!dir) return;
        App.setLoading(true, I18n.t('loading.walking'));
        try {
            App.handleFiles(await Live.listFiles());
        } catch (err) {
            App.setLoading(false);
            $('dropHint').innerHTML = '<span class="err">' + escapeHtml(err.message) + '</span>';
        }
    });
    $('dirInput').addEventListener('change', (e) => App.handleFiles(Array.from(e.target.files)));

    ['dragenter', 'dragover'].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            drop.classList.add('over');
        }),
    );
    ['dragleave', 'drop'].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            drop.classList.remove('over');
        }),
    );

    drop.addEventListener('drop', async (e) => {
        e.preventDefault();
        const items = Array.from(e.dataTransfer.items || []);
        /*
         * Los DataTransferItem dejan de valer en cuanto termina este manejador,
         * así que aquí se pide todo de golpe, antes del primer await: las
         * entradas del árbol clásico y las promesas de handle de Chromium.
         */
        const entries = items
            .map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry())
            .filter(Boolean);
        const handles = items
            .filter((i) => i.getAsFileSystemHandle)
            .map((i) => i.getAsFileSystemHandle());
        const sueltos = Array.from(e.dataTransfer.files || []);

        // Con handle se puede releer la carpeta más tarde: es la vía preferida.
        if (handles.length && (await Live.adoptHandles(handles))) {
            App.setLoading(true, I18n.t('loading.walking'));
            App.handleFiles(await Live.listFiles());
            return;
        }
        if (entries.length) {
            App.setLoading(true, I18n.t('loading.walking'));
            const files = [];
            for (const entry of entries) await walkEntry(entry, entry.name, files);
            App.handleFiles(files);
        } else {
            App.handleFiles(sueltos);
        }
    });

    function walkEntry(entry, path, out) {
        return new Promise((resolve) => {
            if (entry.isFile) {
                entry.file((file) => {
                    try {
                        Object.defineProperty(file, 'webkitRelativePath', { value: path });
                    } catch (_) {}
                    out.push(file);
                    resolve();
                }, resolve);
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                const all = [];
                const readBatch = () =>
                    reader.readEntries(async (batch) => {
                        if (!batch.length) {
                            for (const child of all)
                                await walkEntry(child, path + '/' + child.name, out);
                            resolve();
                            return;
                        }
                        all.push(...batch);
                        readBatch();
                    }, resolve);
                readBatch();
            } else resolve();
        });
    }

    App.handleFiles = async function (files) {
        if (!files || !files.length) return;
        App.setLoading(true, I18n.t('loading.reading'));
        try {
            App.world = await WorldReader.load(files, (done, total, label) => {
                App.setProgress(
                    done / total,
                    I18n.t('loading.file', { file: label, done: done, total: total }),
                );
            });
            App.lastErrorKey = null;
        } catch (err) {
            App.setLoading(false);
            App.lastErrorKey = err.i18nKey || null;
            $('dropHint').innerHTML = '<span class="err">' + escapeHtml(err.message) + '</span>';
            return;
        }
        App.setLoading(false);
        App.showWorld();
    };
})(window);
