/* Pegamento de la interfaz: carga de archivos, controles y actualización del mapa. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SPAWN_RADIUS_CLASSIC = 9;   // 19x19 chunks con ticking, más borde

  let world = null;
  let currentDim = null;
  let map = null;
  let lastErrorKey = null;

  const num = (n) => Number(n).toLocaleString(I18n.locale());

  /* ---------- Ajustes: tema e idioma ---------- */

  const SUN = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>';
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

  function paintLangButtons() {
    document.querySelectorAll('.lang-switch button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === I18n.lang));
    });
  }

  $('themeBtn').addEventListener('click', () => Theme.toggle());
  document.querySelectorAll('.lang-switch button').forEach((b) => {
    b.addEventListener('click', () => I18n.set(b.dataset.lang));
  });

  Theme.onChange(() => {
    paintThemeButton();
    if (map) map.refreshTheme();
  });

  I18n.onChange(() => {
    paintLangButtons();
    paintThemeButton();
    if (lastErrorKey) $('dropHint').innerHTML = '<span class="err">' + escapeHtml(I18n.t(lastErrorKey)) + '</span>';
    if (world && currentDim) {
      renderWorldInfo();
      renderWarnings();
      renderDimSelect();
      renderSpawnNote();
      update(false);          // recalcula los textos de cada chunk
    }
    if (map) map.refreshText();
  });

  /* ---------- Entrada de archivos ---------- */

  const drop = $('drop');
  $('pickDir').addEventListener('click', () => $('dirInput').click());
  $('pickFiles').addEventListener('click', () => $('fileInput').click());
  $('dirInput').addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));
  $('fileInput').addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));

  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));

  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items || []);
    const entries = items.map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (entries.length) {
      setLoading(true, I18n.t('loading.walking'));
      const files = [];
      for (const entry of entries) await walkEntry(entry, entry.name, files);
      handleFiles(files);
    } else {
      handleFiles(Array.from(e.dataTransfer.files || []));
    }
  });

  function walkEntry(entry, path, out) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file) => {
          try { Object.defineProperty(file, 'webkitRelativePath', { value: path }); } catch (_) {}
          out.push(file);
          resolve();
        }, resolve);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const all = [];
        const readBatch = () => reader.readEntries(async (batch) => {
          if (!batch.length) {
            for (const child of all) await walkEntry(child, path + '/' + child.name, out);
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

  async function handleFiles(files) {
    if (!files || !files.length) return;
    setLoading(true, I18n.t('loading.reading'));
    try {
      world = await WorldReader.load(files, (done, total, label) => {
        setProgress(done / total, I18n.t('loading.file', { file: label, done: done, total: total }));
      });
      lastErrorKey = null;
    } catch (err) {
      setLoading(false);
      lastErrorKey = err.i18nKey || null;
      $('dropHint').innerHTML = '<span class="err">' + escapeHtml(err.message) + '</span>';
      return;
    }
    setLoading(false);
    showWorld();
  }

  /* ---------- Estado de carga ---------- */

  function setLoading(on, text) {
    $('loading').hidden = !on;
    if (text) $('loadingText').textContent = text;
    if (!on) $('bar').style.width = '0%';
  }
  function setProgress(frac, text) {
    $('bar').style.width = Math.round(frac * 100) + '%';
    $('loadingText').textContent = text;
  }

  /* ---------- Pintar la aplicación ---------- */

  function showWorld() {
    $('app').hidden = false;
    if (!map) map = new ChunkMap($('map'), $('tooltip'));

    // Radio de spawn: de la gamerule si el mundo la trae, si no el clásico.
    $('spawnRadius').value = world.spawnChunkRadius != null ? world.spawnChunkRadius : SPAWN_RADIUS_CLASSIC;

    currentDim = null;
    renderDimSelect();
    renderSpawnNote();
    renderWorldInfo();
    renderWarnings();
    update(true);
    $('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* Dimensiones con algo que enseñar primero. */
  function renderDimSelect() {
    const dims = Array.from(world.dimensions.values())
      .sort((a, b) => (b.generated.size + b.forced.length) - (a.generated.size + a.forced.length));
    const sel = $('dimSelect');
    sel.innerHTML = '';
    for (const d of dims) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = I18n.t('dim.option', { label: d.label, n: num(d.generated.size) });
      sel.appendChild(opt);
    }
    if (!currentDim || !world.dimensions.has(currentDim.id)) currentDim = dims[0];
    sel.value = currentDim.id;
  }

  function renderSpawnNote() {
    const detected = world.spawnChunkRadius;
    $('spawnNote').innerHTML = detected != null
      ? I18n.t('note.spawnDetected', { r: detected })
      : I18n.t('note.spawnClassic', { r: SPAWN_RADIUS_CLASSIC });
  }

  function renderWorldInfo() {
    const rows = [];
    if (world.name) rows.push(['info.name', world.name]);
    if (world.versionName) rows.push(['info.version', world.versionName]);
    if (world.dataVersion) rows.push(['info.dataVersion', world.dataVersion]);
    if (world.spawn) rows.push(['info.spawn', world.spawn.x + ', ' + world.spawn.z]);
    if (world.lastPlayed) rows.push(['info.lastPlayed', new Date(world.lastPlayed).toLocaleDateString(I18n.locale())]);
    rows.push(['info.dimensions', world.dimensions.size]);
    $('worldInfo').innerHTML = rows.map(
      ([k, v]) => '<dt>' + escapeHtml(I18n.t(k)) + '</dt><dd>' + escapeHtml(String(v)) + '</dd>').join('');
  }

  function renderWarnings() {
    const list = world.warnings;
    $('warnCard').hidden = list.length === 0;
    $('warnList').innerHTML = list.map(
      (w) => '<li>' + escapeHtml(I18n.t('warn.read', { file: w.file, msg: w.msg })) + '</li>').join('');
  }

  function options() {
    return {
      spawnRadius: parseInt($('spawnRadius').value, 10),
      simulationDistance: parseInt($('simDist').value, 10),
      useSpawn: $('srcSpawn').checked,
      usePlayers: $('srcPlayers').checked,
      useForceload: $('srcForce').checked
    };
  }

  function update(fit) {
    if (!world || !currentDim) return;
    const opts = options();
    $('spawnRadiusOut').textContent = I18n.t('ctl.chunksGrid',
      { n: opts.spawnRadius, side: opts.spawnRadius * 2 + 1 });
    $('simDistOut').textContent = I18n.t('ctl.chunksGrid',
      { n: opts.simulationDistance, side: opts.simulationDistance * 2 + 1 });

    const loaded = ChunkModel.compute(world, currentDim, opts);
    map.layers = {
      generated: $('layerGenerated').checked,
      activity: $('layerActivity').checked,
      loaded: $('layerLoaded').checked,
      markers: $('layerMarkers').checked,
      grid: $('layerGrid').checked
    };
    map.setData(world, currentDim, loaded);
    if (fit) map.fit();
    renderStats(loaded);
    renderPlayerSelect();
  }

  function renderStats(loaded) {
    const s = ChunkModel.stats(loaded);
    const gen = currentDim.generated.size;
    const rows = [
      ['stats.loaded', num(s.total)],
      ['stats.entity', num(s.entity)],
      ['stats.ticking', num(s.ticking)],
      ['stats.border', num(s.border)],
      ['stats.generated', num(gen)],
      ['stats.regionFiles', currentDim.regionFiles],
      ['stats.forceload', currentDim.forced.length],
      ['stats.playersHere', currentDim.players.length]
    ];
    if (gen) rows.push(['stats.ratio', ((s.total / gen) * 100).toFixed(1) + ' %']);
    $('statsInfo').innerHTML = rows.map(
      ([k, v]) => '<dt>' + escapeHtml(I18n.t(k)) + '</dt><dd>' + escapeHtml(String(v)) + '</dd>').join('');
  }

  function renderPlayerSelect() {
    const sel = $('gotoPlayer');
    sel.innerHTML = '<option value="">' + escapeHtml(I18n.t('btn.gotoPlayer')) + '</option>';
    currentDim.players.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = WorldReader.playerLabel(p);
      sel.appendChild(o);
    });
    sel.disabled = currentDim.players.length === 0;
  }

  /* ---------- Controles ---------- */

  ['srcSpawn', 'srcPlayers', 'srcForce', 'spawnRadius', 'simDist',
   'layerGenerated', 'layerActivity', 'layerLoaded', 'layerMarkers', 'layerGrid']
    .forEach((id) => $(id).addEventListener('input', () => update(false)));

  $('dimSelect').addEventListener('change', (e) => {
    currentDim = world.dimensions.get(e.target.value);
    update(true);
  });

  $('fit').addEventListener('click', () => map.fit());

  $('gotoSpawn').addEventListener('click', () => {
    if (!world.spawn) return;
    map.centerOn(Math.floor(world.spawn.x / 16), Math.floor(world.spawn.z / 16), Math.max(map.scale, 6));
  });

  $('gotoPlayer').addEventListener('change', (e) => {
    const p = currentDim.players[parseInt(e.target.value, 10)];
    if (p) map.centerOn(p.chunkX, p.chunkZ, Math.max(map.scale, 6));
    e.target.value = '';
  });

  $('png').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = ((world.name || 'world') + '-' + currentDim.label + '-chunks.png').replace(/[^\w.-]+/g, '_');
    a.href = $('map').toDataURL('image/png');
    a.click();
  });

  $('reset').addEventListener('click', () => {
    world = null; currentDim = null;
    $('app').hidden = true;
    $('dirInput').value = ''; $('fileInput').value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Arranque ---------- */

  I18n.apply();
  Theme.paint();
  paintLangButtons();
  paintThemeButton();
  $('loadingText').textContent = I18n.t('loading.reading');
})();
