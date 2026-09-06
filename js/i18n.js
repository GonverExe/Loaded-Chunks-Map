/* Traducciones y cambio de idioma en caliente. */
(function (global) {
  'use strict';

  const STRINGS = {
    es: {
      'html.lang': 'es',
      'page.title': 'Loaded Chunks Map — mapa de chunks cargados de tu mundo de Minecraft',
      'page.description': 'Suelta la carpeta de tu mundo de Minecraft Java y mira qué chunks quedan cargados: spawn chunks, /forceload y el área alrededor de cada jugador. Todo en tu navegador, sin subir nada.',

      'settings.theme.toDark': 'Cambiar a modo oscuro',
      'settings.theme.toLight': 'Cambiar a modo claro',
      'settings.language': 'Idioma',

      'hero.badge': '100&nbsp;% en tu navegador · no se sube ningún archivo',
      'hero.title': 'Mira qué <span class="grad">chunks</span> se quedan cargados en tu mundo',
      'hero.lead': 'Suelta la carpeta de tu mundo de <strong>Minecraft: Java Edition</strong> (la que está dentro de <code>saves/</code>) y te dibujo el mapa: <strong>spawn chunks</strong>, chunks fijados con <code>/forceload</code> y el área que mantiene cargada cada jugador guardado, sobre el terreno que ya has generado.',

      'drop.title': '<strong>Arrastra aquí la carpeta del mundo</strong> o',
      'drop.pickDir': 'Elegir carpeta…',
      'drop.pickFiles': 'Elegir archivos sueltos',
      'drop.hint': 'Necesito que pases tu mundo desde dentro de la carpeta <code>saves/el nombre de tu mundo</code>.',

      'where.summary': '¿Dónde está mi carpeta de mundos?',
      'where.win': '<strong>Windows</strong>: <code>%appdata%\\.minecraft\\saves\\</code>',
      'where.mac': '<strong>macOS</strong>: <code>~/Library/Application Support/minecraft/saves/</code>',
      'where.linux': '<strong>Linux</strong>: <code>~/.minecraft/saves/</code>',
      'where.server': '<strong>Servidor</strong>: la carpeta indicada en <code>level-name</code> de <code>server.properties</code> (por defecto <code>world/</code>)',

      'card.world': 'Mundo',
      'card.dimension': 'Dimensión',
      'card.sources': 'Fuentes de carga',
      'card.layers': 'Capas',
      'card.summary': 'Resumen',
      'card.warnings': 'Avisos',

      'src.spawn': 'Spawn chunks',
      'src.players': 'Jugadores guardados',
      'src.force': '<code>/forceload</code>',
      'ctl.spawnRadius': 'Radio de spawn:',
      'ctl.simDist': 'Distancia de simulación:',
      'ctl.chunksGrid': '{n} → {side}×{side} chunks',
      'note.simDist': 'La distancia de simulación no se guarda en el mundo (está en <code>server.properties</code> o en las opciones del cliente). Ajústala a la de tu partida.',
      'note.spawnDetected': 'Leído del mundo: gamerule <code>spawnChunkRadius = {r}</code>.',
      'note.spawnClassic': 'Tu <code>level.dat</code> no trae la gamerule <code>spawnChunkRadius</code> (se añadió en 1.20.5), así que uso el valor clásico {r} → 19×19 chunks con ticking.',

      'layer.generated': 'Chunks generados',
      'layer.activity': 'Resaltar guardados hace &lt;7 días',
      'layer.loaded': 'Chunks cargados',
      'layer.markers': 'Marcadores',
      'layer.grid': 'Rejilla y ejes',

      'btn.reset': 'Cargar otro mundo',
      'btn.fit': 'Encajar vista',
      'btn.gotoSpawn': 'Ir al spawn',
      'btn.gotoPlayer': 'Ir a jugador…',
      'btn.png': 'Exportar PNG',

      'legend.spawn': 'spawn',
      'legend.player': 'jugador',
      'legend.force': 'forceload',
      'legend.generated': 'generado',

      'disclaimer': 'Un save <strong>no guarda</strong> qué chunks estaban cargados en memoria: esto es una reconstrucción de los <em>tickets</em> que existirían al arrancar el mundo con los ajustes de la izquierda. Los chunks mantenidos por perlas de ender, portales o mods no aparecen.',

      'loading.reading': 'Leyendo el mundo…',
      'loading.walking': 'Recorriendo la carpeta…',
      'loading.file': 'Leyendo {file} ({done}/{total})',

      'info.name': 'Nombre',
      'info.version': 'Versión',
      'info.dataVersion': 'DataVersion',
      'info.spawn': 'Spawn',
      'info.lastPlayed': 'Última partida',
      'info.dimensions': 'Dimensiones',

      'stats.loaded': 'Cargados',
      'stats.entity': '· entity ticking',
      'stats.ticking': '· block ticking',
      'stats.border': '· solo borde',
      'stats.generated': 'Generados',
      'stats.regionFiles': 'Region files',
      'stats.forceload': 'Forceload',
      'stats.playersHere': 'Jugadores aquí',
      'stats.ratio': 'Cargados / generados',

      'dim.option': '{label} · {n} chunks generados',

      'level.0': 'entity ticking',
      'level.1': 'block ticking',
      'level.2': 'borde (cargado, sin tick)',

      'detail.spawn': 'spawn del mundo en {x}, {z}',
      'detail.player': '{name} en {x}, {z}',
      'detail.force': 'chunk forzado {x}, {z}',
      'player.singleplayer': 'Jugador (level.dat)',

      'tip.chunk': 'Chunk {x}, {z}',
      'tip.blocks': 'Bloques {x1}, {z1} → {x2}, {z2}',
      'tip.region': 'Región r.{rx}.{rz}.mca',
      'tip.notLoaded': 'No cargado',
      'tip.generatedAt': 'Generado · guardado {date}',
      'tip.generated': 'Generado',
      'tip.ungenerated': 'Sin generar',

      'map.scale': '{chunks} chunks · {blocks} bloques',
      'map.empty': 'Carga la carpeta de tu mundo para ver el mapa',

      'error.noWorld': 'No he encontrado ni level.dat ni carpeta region/. ¿Seguro que es la carpeta de un mundo (la que está dentro de saves/)?',
      'error.noDecompression': 'Este navegador no soporta DecompressionStream (necesario para leer los .dat).',
      'warn.read': 'No he podido leer {file}: {msg}',

      'explain.title': 'Qué se puede saber de verdad desde la carpeta',
      'explain.spawn.h': 'Spawn chunks',
      'explain.spawn.p': 'El spawn del mundo (<code>SpawnX/SpawnZ</code> en <code>level.dat</code>) mantiene un cuadrado de chunks cargados siempre, con el mundo abierto y sin nadie cerca. Si tu versión tiene la gamerule <code>spawnChunkRadius</code>, la leo del propio mundo; si no, uso el comportamiento clásico (19×19 con ticking más un borde).',
      'explain.force.h': '/forceload',
      'explain.force.p': 'Los chunks fijados con <code>/forceload add</code> se guardan en <code>data/chunks.dat</code> de cada dimensión como una lista de posiciones empaquetadas. Estos sí son un dato exacto del disco.',
      'explain.players.h': 'Jugadores',
      'explain.players.p': 'Cada jugador carga los chunks a su alrededor según la distancia de simulación del servidor. Leo su última posición de <code>playerdata/*.dat</code> (o del <code>Player</code> de <code>level.dat</code> en un mundo de un jugador) y dibujo esa zona.',
      'explain.terrain.h': 'Terreno generado',
      'explain.terrain.p': 'De cada <code>region/r.X.Z.mca</code> leo solo la cabecera: qué chunks existen y cuándo se guardaron por última vez. Sirve de fondo del mapa y para ver por dónde has estado últimamente.',
      'explain.fine': 'Los llamados <em>chunk loaders</em> hechos con perlas de ender, portales del Nether o mods dependen del estado en ejecución del servidor y no quedan escritos en el save, así que no se pueden reconstruir desde aquí.',
      'foot': 'Todo el procesado ocurre en tu navegador: los archivos nunca salen de tu ordenador.'
    },

    en: {
      'html.lang': 'en',
      'page.title': 'Loaded Chunks Map — see which chunks stay loaded in your Minecraft world',
      'page.description': 'Drop your Minecraft Java world folder and see which chunks stay loaded: spawn chunks, /forceload and the area around each player. All in your browser, nothing uploaded.',

      'settings.theme.toDark': 'Switch to dark mode',
      'settings.theme.toLight': 'Switch to light mode',
      'settings.language': 'Language',

      'hero.badge': '100&nbsp;% in your browser · nothing gets uploaded',
      'hero.title': 'See which <span class="grad">chunks</span> stay loaded in your world',
      'hero.lead': 'Drop your <strong>Minecraft: Java Edition</strong> world folder (the one inside <code>saves/</code>) and I will draw the map: <strong>spawn chunks</strong>, chunks pinned with <code>/forceload</code> and the area each saved player keeps loaded, on top of the terrain you have already generated.',

      'drop.title': '<strong>Drop the world folder here</strong> or',
      'drop.pickDir': 'Choose folder…',
      'drop.pickFiles': 'Choose individual files',
      'drop.hint': 'Give me the world folder itself, the one inside <code>saves/your world name</code>.',

      'where.summary': 'Where is my saves folder?',
      'where.win': '<strong>Windows</strong>: <code>%appdata%\\.minecraft\\saves\\</code>',
      'where.mac': '<strong>macOS</strong>: <code>~/Library/Application Support/minecraft/saves/</code>',
      'where.linux': '<strong>Linux</strong>: <code>~/.minecraft/saves/</code>',
      'where.server': '<strong>Server</strong>: the folder named by <code>level-name</code> in <code>server.properties</code> (<code>world/</code> by default)',

      'card.world': 'World',
      'card.dimension': 'Dimension',
      'card.sources': 'Loading sources',
      'card.layers': 'Layers',
      'card.summary': 'Summary',
      'card.warnings': 'Warnings',

      'src.spawn': 'Spawn chunks',
      'src.players': 'Saved players',
      'src.force': '<code>/forceload</code>',
      'ctl.spawnRadius': 'Spawn radius:',
      'ctl.simDist': 'Simulation distance:',
      'ctl.chunksGrid': '{n} → {side}×{side} chunks',
      'note.simDist': 'Simulation distance is not stored in the world (it lives in <code>server.properties</code> or in the client options). Set it to the one your game uses.',
      'note.spawnDetected': 'Read from the world: gamerule <code>spawnChunkRadius = {r}</code>.',
      'note.spawnClassic': 'Your <code>level.dat</code> has no <code>spawnChunkRadius</code> gamerule (added in 1.20.5), so I use the classic value {r} → 19×19 ticking chunks.',

      'layer.generated': 'Generated chunks',
      'layer.activity': 'Highlight saved &lt;7 days ago',
      'layer.loaded': 'Loaded chunks',
      'layer.markers': 'Markers',
      'layer.grid': 'Grid and axes',

      'btn.reset': 'Load another world',
      'btn.fit': 'Fit view',
      'btn.gotoSpawn': 'Go to spawn',
      'btn.gotoPlayer': 'Go to player…',
      'btn.png': 'Export PNG',

      'legend.spawn': 'spawn',
      'legend.player': 'player',
      'legend.force': 'forceload',
      'legend.generated': 'generated',

      'disclaimer': 'A save <strong>does not store</strong> which chunks were loaded in memory: this is a reconstruction of the <em>tickets</em> that would exist when the world starts with the settings on the left. Chunks kept alive by ender pearls, portals or mods do not show up.',

      'loading.reading': 'Reading the world…',
      'loading.walking': 'Walking the folder…',
      'loading.file': 'Reading {file} ({done}/{total})',

      'info.name': 'Name',
      'info.version': 'Version',
      'info.dataVersion': 'DataVersion',
      'info.spawn': 'Spawn',
      'info.lastPlayed': 'Last played',
      'info.dimensions': 'Dimensions',

      'stats.loaded': 'Loaded',
      'stats.entity': '· entity ticking',
      'stats.ticking': '· block ticking',
      'stats.border': '· border only',
      'stats.generated': 'Generated',
      'stats.regionFiles': 'Region files',
      'stats.forceload': 'Forceload',
      'stats.playersHere': 'Players here',
      'stats.ratio': 'Loaded / generated',

      'dim.option': '{label} · {n} generated chunks',

      'level.0': 'entity ticking',
      'level.1': 'block ticking',
      'level.2': 'border (loaded, no ticking)',

      'detail.spawn': 'world spawn at {x}, {z}',
      'detail.player': '{name} at {x}, {z}',
      'detail.force': 'forced chunk {x}, {z}',
      'player.singleplayer': 'Player (level.dat)',

      'tip.chunk': 'Chunk {x}, {z}',
      'tip.blocks': 'Blocks {x1}, {z1} → {x2}, {z2}',
      'tip.region': 'Region r.{rx}.{rz}.mca',
      'tip.notLoaded': 'Not loaded',
      'tip.generatedAt': 'Generated · saved {date}',
      'tip.generated': 'Generated',
      'tip.ungenerated': 'Not generated',

      'map.scale': '{chunks} chunks · {blocks} blocks',
      'map.empty': 'Load your world folder to see the map',

      'error.noWorld': 'I found neither level.dat nor a region/ folder. Is this really a world folder (the one inside saves/)?',
      'error.noDecompression': 'This browser does not support DecompressionStream (needed to read the .dat files).',
      'warn.read': 'Could not read {file}: {msg}',

      'explain.title': 'What the folder can actually tell you',
      'explain.spawn.h': 'Spawn chunks',
      'explain.spawn.p': 'The world spawn (<code>SpawnX/SpawnZ</code> in <code>level.dat</code>) keeps a square of chunks loaded at all times while the world is open, even with nobody nearby. If your version has the <code>spawnChunkRadius</code> gamerule I read it from the world itself; otherwise I use the classic behaviour (19×19 ticking plus a border).',
      'explain.force.h': '/forceload',
      'explain.force.p': 'Chunks pinned with <code>/forceload add</code> are stored in the <code>data/chunks.dat</code> of each dimension as a list of packed positions. This one is exact data from disk.',
      'explain.players.h': 'Players',
      'explain.players.p': 'Every player loads the chunks around them according to the server simulation distance. I read their last position from <code>playerdata/*.dat</code> (or from <code>Player</code> in <code>level.dat</code> for a singleplayer world) and draw that area.',
      'explain.terrain.h': 'Generated terrain',
      'explain.terrain.p': 'From each <code>region/r.X.Z.mca</code> I only read the header: which chunks exist and when they were last saved. It works as the map background and shows where you have been lately.',
      'explain.fine': 'So-called <em>chunk loaders</em> built with ender pearls, Nether portals or mods depend on the running server state and are never written to the save, so they cannot be reconstructed here.',
      'foot': 'Everything is processed in your browser: the files never leave your computer.'
    }
  };

  const STORE_KEY = 'lcm.lang';
  let current = 'es';
  const listeners = [];

  function detect() {
    let saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (_) {}
    if (saved && STRINGS[saved]) return saved;
    const nav = (navigator.language || 'es').slice(0, 2).toLowerCase();
    return STRINGS[nav] ? nav : 'en';
  }

  function t(key, params) {
    let s = STRINGS[current][key];
    if (s === undefined) s = STRINGS.es[key];
    if (s === undefined) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
    return s;
  }

  /* Vuelca las traducciones sobre el DOM estático. */
  function apply() {
    document.documentElement.lang = t('html.lang');
    document.title = t('page.title');
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t('page.description'));

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
  }

  function set(lang) {
    if (!STRINGS[lang] || lang === current) return;
    current = lang;
    try { localStorage.setItem(STORE_KEY, lang); } catch (_) {}
    apply();
    listeners.forEach((fn) => fn(lang));
  }

  function locale() { return current === 'es' ? 'es-ES' : 'en-US'; }
  function onChange(fn) { listeners.push(fn); }

  current = detect();

  global.I18n = {
    t, set, apply, onChange, locale,
    langs: Object.keys(STRINGS),
    get lang() { return current; }
  };
})(window);
