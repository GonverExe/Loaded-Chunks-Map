# Loaded Chunks Map

Página estática que lee la carpeta de un mundo de **Minecraft: Java Edition** desde el navegador y
dibuja un mapa de chunks: cuáles están generados y cuáles quedarían **cargados** por spawn chunks,
`/forceload` y la presencia de jugadores.

No hay backend, ni build, ni dependencias: los archivos nunca salen del ordenador.

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
js/nbt.js         parser NBT (gzip/zlib vía DecompressionStream)
js/world.js       lectura de la carpeta del mundo y de las cabeceras .mca
js/chunks.js      cálculo de tickets → chunks cargados
js/map.js         render en canvas, pan/zoom, tooltip
js/main.js        interfaz
```
