/* Pegamento de la interfaz: carga de archivos, controles y actualización del mapa. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SPAWN_RADIUS_CLASSIC = 9;   // 19x19 chunks con ticking, más borde

  let world = null;
  let currentDim = null;
  let map = null;

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
      setLoading(true, 'Recorriendo la carpeta…');
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
    setLoading(true, 'Leyendo el mundo…');
    try {
      world = await WorldReader.load(files, (done, total, label) => {
        setProgress(done / total, 'Leyendo ' + label + ' (' + done + '/' + total + ')');
      });
    } catch (err) {
      setLoading(false);
      $('dropHint').innerHTML = '<span style="color:#f87171">' + escapeHtml(err.message) + '</span>';
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
    const detected = world.spawnChunkRadius;
    $('spawnRadius').value = detected != null ? detected : SPAWN_RADIUS_CLASSIC;
    $('spawnNote').innerHTML = detected != null
      ? 'Leído del mundo: gamerule <code>spawnChunkRadius = ' + detected + '</code>.'
      : 'Tu <code>level.dat</code> no trae la gamerule <code>spawnChunkRadius</code> (se añadió en 1.20.5), así que uso el valor clásico ' + SPAWN_RADIUS_CLASSIC + ' → 19×19 chunks con ticking.';

    // Selector de dimensión, con las que tengan algo que enseñar primero.
    const dims = Array.from(world.dimensions.values())
      .sort((a, b) => (b.generated.size + b.forced.length) - (a.generated.size + a.forced.length));
    const sel = $('dimSelect');
    sel.innerHTML = '';
    for (const d of dims) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label + ' · ' + d.generated.size.toLocaleString('es-ES') + ' chunks generados';
      sel.appendChild(opt);
    }
    currentDim = dims[0];
    sel.value = currentDim.id;

    renderWorldInfo();
    renderWarnings();
    update(true);
    $('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderWorldInfo() {
    const rows = [];
    if (world.name) rows.push(['Nombre', world.name]);
    if (world.versionName) rows.push(['Versión', world.versionName]);
    if (world.dataVersion) rows.push(['DataVersion', world.dataVersion]);
    if (world.spawn) rows.push(['Spawn', world.spawn.x + ', ' + world.spawn.z]);
    if (world.lastPlayed) rows.push(['Última partida', new Date(world.lastPlayed).toLocaleDateString('es-ES')]);
    rows.push(['Dimensiones', world.dimensions.size]);
    $('worldInfo').innerHTML = rows.map(
      ([k, v]) => '<dt>' + escapeHtml(k) + '</dt><dd>' + escapeHtml(String(v)) + '</dd>').join('');
  }

  function renderWarnings() {
    const list = world.warnings;
    $('warnCard').hidden = list.length === 0;
    $('warnList').innerHTML = list.map((w) => '<li>' + escapeHtml(w) + '</li>').join('');
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
    $('spawnRadiusOut').textContent = opts.spawnRadius + ' → ' + (opts.spawnRadius * 2 + 1) + '×' + (opts.spawnRadius * 2 + 1) + ' chunks';
    $('simDistOut').textContent = opts.simulationDistance + ' → ' + (opts.simulationDistance * 2 + 1) + '×' + (opts.simulationDistance * 2 + 1) + ' chunks';

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
      ['Cargados', s.total.toLocaleString('es-ES')],
      ['· entity ticking', s.entity.toLocaleString('es-ES')],
      ['· block ticking', s.ticking.toLocaleString('es-ES')],
      ['· solo borde', s.border.toLocaleString('es-ES')],
      ['Generados', gen.toLocaleString('es-ES')],
      ['Region files', currentDim.regionFiles],
      ['Forceload', currentDim.forced.length],
      ['Jugadores aquí', currentDim.players.length]
    ];
    if (gen) rows.push(['Cargados / generados', ((s.total / gen) * 100).toFixed(1) + ' %']);
    $('statsInfo').innerHTML = rows.map(
      ([k, v]) => '<dt>' + escapeHtml(k) + '</dt><dd>' + escapeHtml(String(v)) + '</dd>').join('');
  }

  function renderPlayerSelect() {
    const sel = $('gotoPlayer');
    sel.innerHTML = '<option value="">Ir a jugador…</option>';
    currentDim.players.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = p.name;
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
    a.download = ((world.name || 'mundo') + '-' + currentDim.label + '-chunks.png').replace(/[^\w.-]+/g, '_');
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
})();
