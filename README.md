# Loaded Chunks Map

**English** · [Español ↓](#mapa-de-chunks-cargados)

Static page that reads a **Minecraft: Java Edition** world folder in the browser and draws a chunk map:
which chunks are generated, and which ones would stay **loaded** because of spawn chunks, `/forceload`
and the players in the save.

No backend, no build step, no dependencies: the files never leave your computer.

## Settings

The floating bar in the top right corner keeps two preferences in `localStorage`:

- **Theme**: light or dark. It follows the system setting (`prefers-color-scheme`) and changes with it
  until you pick one by hand. The map canvas takes its palette from the CSS variables, so the map
  switches along with the rest of the page.
- **Language**: Spanish or English, applied live (tooltip, summary and warnings included). It defaults
  to the browser language.

Every string lives in `js/i18n.js`; adding a language is a matter of copying one block and translating it.

## Usage

Open `index.html` (or serve the folder with any static server / GitHub Pages) and drop the world folder
— the one inside `saves/`, not the whole `saves/`.

```
python3 -m http.server 8080   # then open http://localhost:8080
```

Needs a browser with `DecompressionStream` (Chrome/Edge 80+, Firefox 113+, Safari 16.4+) and, for
dropping folders, a recent Chromium-based browser or Firefox.

## What is read, and where from

| Data | Source in the save |
|---|---|
| Name, version, spawn, gamerules | `level.dat` (NBT + gzip) |
| Player in a singleplayer world | `level.dat` → `Data.Player.Pos` |
| Players on a server | `playerdata/<uuid>.dat` → `Pos`, `Dimension` |
| Chunks pinned with `/forceload` | `<dim>/data/chunks.dat` → `data.Forced` (LongArray of packed `ChunkPos`) |
| Generated chunks and their last save | header of `<dim>/region/r.X.Z.mca` (4 KiB of locations + 4 KiB of timestamps) |

Only the first 8 KiB of each `.mca` are read, so a multi-GB world is processed in seconds.

Dimensions detected: overworld (`region/`), `DIM-1`, `DIM1` and custom dimensions under
`dimensions/<namespace>/<name>/`.

## What this **cannot** know

A save **does not store** which chunks were loaded in memory: that is running-server state. What the
page shows is a reconstruction of the *tickets* that would exist when the world starts:

- **Spawn chunks**: radius taken from the `spawnChunkRadius` gamerule when the world has it (1.20.5+);
  otherwise the classic behaviour is used (radius 9 → 19×19 ticking chunks plus a border). Editable.
- **Players**: simulation distance does not live in the world but in `server.properties` or the client
  options, so it is a UI control (10 by default).
- **Chunk loaders** made with ender pearls, portals or mods: they depend on the running state and are
  never written to disk, so they do not show up.

The ticket model is the usual one: radius *r* with *entity ticking*, one more ring with *block ticking*
and one more ring loaded only (border).

## Layout

```
index.html        landing + UI
css/styles.css
js/i18n.js        Spanish and English strings + live switching
js/theme.js       light / dark mode with a remembered preference
js/nbt.js         NBT parser (gzip/zlib through DecompressionStream)
js/world.js       reads the world folder and the .mca headers
js/chunks.js      tickets → loaded chunks
js/map.js         canvas render, pan/zoom, tooltip
js/main.js        UI glue
```

---

# Mapa de chunks cargados

[← English](#loaded-chunks-map) · **Español**

Página estática que lee la carpeta de un mundo de **Minecraft: Java Edition** desde el navegador y
dibuja un mapa de chunks: cuáles están generados y cuáles quedarían **cargados** por spawn chunks,
`/forceload` y la presencia de jugadores.

No hay backend, ni build, ni dependencias: los archivos nunca salen del ordenador.

## Ajustes

La barra flotante de la esquina superior derecha guarda dos preferencias en `localStorage`:

- **Tema**: claro u oscuro. Por defecto sigue al del sistema (`prefers-color-scheme`) y cambia con él
  mientras no elijas uno a mano. El canvas del mapa lee su paleta de las variables CSS, así que el mapa
  cambia con el resto de la página.
- **Idioma**: español o inglés, aplicado en caliente (también al tooltip, las estadísticas y los avisos).
  Por defecto usa el del navegador.

Los textos viven todos en `js/i18n.js`; para añadir un idioma basta con copiar un bloque y traducirlo.

## Uso

Abre `index.html` (o sirve la carpeta con cualquier servidor estático / GitHub Pages) y arrastra la
carpeta del mundo — la que está dentro de `saves/`, no `saves/` entera.

```
python3 -m http.server 8080   # y abre http://localhost:8080
```

Requiere un navegador con `DecompressionStream` (Chrome/Edge 80+, Firefox 113+, Safari 16.4+) y, para
arrastrar carpetas, un navegador basado en Chromium o Firefox reciente.

## Qué se lee, y de dónde

| Dato | Origen en el save |
|---|---|
| Nombre, versión, spawn, gamerules | `level.dat` (NBT + gzip) |
| Jugador en partida de un jugador | `level.dat` → `Data.Player.Pos` |
| Jugadores en servidor | `playerdata/<uuid>.dat` → `Pos`, `Dimension` |
| Chunks fijados con `/forceload` | `<dim>/data/chunks.dat` → `data.Forced` (LongArray de `ChunkPos` empaquetados) |
| Chunks generados y su último guardado | cabecera de `<dim>/region/r.X.Z.mca` (4 KiB de posiciones + 4 KiB de timestamps) |

De los `.mca` solo se leen los primeros 8 KiB de cada archivo, así que un mundo de varios GB se
procesa en segundos.

Dimensiones detectadas: overworld (`region/`), `DIM-1`, `DIM1` y dimensiones personalizadas en
`dimensions/<espacio>/<nombre>/`.

## Lo que esto **no** puede saber

Un save **no guarda** qué chunks estaban cargados en memoria: eso es estado del servidor en ejecución.
Lo que muestra la página es una reconstrucción de los *tickets* que existirían al arrancar el mundo:

- **Spawn chunks**: radio tomado de la gamerule `spawnChunkRadius` cuando el mundo la trae (1.20.5+);
  si no, se usa el comportamiento clásico (radio 9 → 19×19 chunks con ticking más borde). Editable.
- **Jugadores**: la distancia de simulación no vive en el mundo sino en `server.properties` o en las
  opciones del cliente, así que es un control de la interfaz (por defecto 10).
- **Chunk loaders** con perlas de ender, portales o mods: dependen del estado en ejecución y no quedan
  escritos en disco, así que no aparecen.

El modelo de tickets es el habitual: radio *r* con *entity ticking*, un anillo más con *block ticking*
y otro anillo más solo cargado (borde).

## Estructura

```
index.html        landing + interfaz
css/styles.css
js/i18n.js        textos en español e inglés + cambio en caliente
js/theme.js       modo claro / oscuro con preferencia recordada
js/nbt.js         parser NBT (gzip/zlib vía DecompressionStream)
js/world.js       lectura de la carpeta del mundo y de las cabeceras .mca
js/chunks.js      cálculo de tickets → chunks cargados
js/map.js         render en canvas, pan/zoom, tooltip
js/main.js        interfaz
```
