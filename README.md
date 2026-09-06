# Loaded Chunks Map

**English** · [Español](#mapa-de-chunks-cargados) · [Português](#mapa-de-chunks-carregados) · [中文](#已加载区块地图) · [Русский](#карта-загруженных-чанков)

Static page that reads a **Minecraft: Java Edition** world folder in the browser and draws the map of
your world — the real terrain, rendered from the blocks like MCA Selector does — with an overlay of the
chunks that would stay **loaded** because of spawn chunks, `/forceload` and the players in the save.

No backend, no build step, no dependencies: the files never leave your computer.

## Terrain

With the terrain layer on, the region files of the area you are looking at are decoded in Web Workers:
for every column the surface block is taken (using the `WORLD_SURFACE` heightmap), coloured with the
game map palette and shaded by slope, and water is shaded by depth. Each region becomes a 512x512
tile (16 px per chunk) that is cached and drawn under the loaded-chunk overlay.

The same machinery draws a **biome map**: one flat colour per biome, in the Amidst/MCA Selector style,
sampling the biome cell (4x4x4) at the surface in the overworld and at a fixed height in the Nether and
the End, where there is no usable surface. Both modes are cached separately, so switching is instant
the second time.

About 0.5 s per region on one core, four regions at a time, and only the visible ones are rendered.
The biome map needs the 1.18+ format (`sections[].biomes` with a name palette); older worlds store
biomes as numeric IDs and will come out empty in that mode. Biomes from mods fall back to grey.

Tested against 1.21 (`sections[].block_states`). The reader also has a path for the 1.13-1.17 layout
(`Level.Sections` with `Palette`/`BlockStates`), which has not been checked against a real old world yet.

> Web Workers do not run from `file://`, so **the terrain layer needs the page to be served over HTTP**.
> Everything else works fine opening the file directly.

## Settings

The floating bar in the top right corner keeps two preferences in `localStorage`:

- **Theme**: light or dark. It follows the system setting (`prefers-color-scheme`) and changes with it
  until you pick one by hand. The map canvas takes its palette from the CSS variables, so the map
  switches along with the rest of the page.
- **Language**: Spanish, English, Portuguese, Simplified Chinese or Russian, applied live (tooltip,
  summary and warnings included). It defaults to the browser language.

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
| Terrain | blocks of the chunks in `<dim>/region/r.X.Z.mca`, only for the regions on screen |
| Biomes | `sections[].biomes` of those same chunks (4x4x4 cells) |

Loading a world only reads the first 8 KiB of each `.mca`, so a multi-GB world opens in seconds; the
full chunks are decoded later, and only for the regions you actually look at.

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
js/i18n.js        strings in five languages + live switching
js/theme.js       light / dark mode with a remembered preference
js/blockcolors.js block -> colour palette for the terrain
js/biomecolors.js biome -> colour palette for the biome map
js/terrain.js     worker pool and tile cache
js/terrain-worker.js  decodes a region file and paints its 512x512 tile
js/nbt.js         NBT parser (gzip/zlib through DecompressionStream)
js/world.js       reads the world folder and the .mca headers
js/chunks.js      tickets → loaded chunks
js/map.js         canvas render, pan/zoom, tooltip
js/main.js        UI glue
```

---

# Mapa de chunks cargados

[English](#loaded-chunks-map) · **Español** · [Português](#mapa-de-chunks-carregados) · [中文](#已加载区块地图) · [Русский](#карта-загруженных-чанков)

Página estática que lee la carpeta de un mundo de **Minecraft: Java Edition** desde el navegador y
dibuja el mapa de tu mundo — el terreno real, renderizado a partir de los bloques como hace MCA
Selector — con una capa encima de los chunks que quedarían **cargados** por spawn chunks,
`/forceload` y la presencia de jugadores.

No hay backend, ni build, ni dependencias: los archivos nunca salen del ordenador.

## Terreno

Con la capa de terreno activada, los region files de la zona que estás mirando se decodifican en Web
Workers: de cada columna se toma el bloque de superficie (con el heightmap `WORLD_SURFACE`), se colorea
con la paleta de los mapas del juego y se sombrea según el desnivel; el agua se sombrea por profundidad.
Cada región se convierte en una tesela de 512x512 (16 px por chunk) que se cachea y se dibuja debajo de
los chunks cargados.

Lo mismo sirve para el **mapa de biomas**: un color plano por bioma, al estilo de Amidst y MCA Selector,
muestreando la celda de bioma (4x4x4) en la superficie en el overworld y a una altura fija en el Nether
y el End, donde no hay superficie aprovechable. Cada modo se cachea aparte, así que alternar es
instantáneo la segunda vez.

Unos 0,5 s por región en un núcleo, cuatro regiones a la vez, y solo se renderizan las visibles.
El mapa de biomas necesita el formato 1.18+ (`sections[].biomes` con paleta de nombres); los mundos
anteriores guardan los biomas como IDs numéricos y en ese modo saldrían vacíos. Los biomas de mods
caen en un gris neutro.

Probado con 1.21 (`sections[].block_states`). El lector tiene además una ruta para el formato de
1.13-1.17 (`Level.Sections` con `Palette`/`BlockStates`), que todavía no he podido contrastar con un
mundo antiguo de verdad.

> Los Web Workers no funcionan desde `file://`, así que **la capa de terreno necesita que la página se
> sirva por HTTP**. Todo lo demás funciona abriendo el archivo directamente.

## Ajustes

La barra flotante de la esquina superior derecha guarda dos preferencias en `localStorage`:

- **Tema**: claro u oscuro. Por defecto sigue al del sistema (`prefers-color-scheme`) y cambia con él
  mientras no elijas uno a mano. El canvas del mapa lee su paleta de las variables CSS, así que el mapa
  cambia con el resto de la página.
- **Idioma**: español, inglés, portugués, chino simplificado o ruso, aplicado en caliente (también al
  tooltip, las estadísticas y los avisos). Por defecto usa el del navegador.

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
| Terreno | bloques de los chunks de `<dim>/region/r.X.Z.mca`, solo de las regiones en pantalla |
| Biomas | `sections[].biomes` de esos mismos chunks (celdas de 4x4x4) |

Al cargar el mundo solo se leen los primeros 8 KiB de cada `.mca`, así que un mundo de varios GB se
abre en segundos; los chunks completos se decodifican después, y solo los de las regiones que miras.

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
js/i18n.js        textos en los cinco idiomas + cambio en caliente
js/theme.js       modo claro / oscuro con preferencia recordada
js/blockcolors.js paleta bloque -> color para el terreno
js/biomecolors.js paleta bioma -> color para el mapa de biomas
js/terrain.js     pool de workers y caché de teselas
js/terrain-worker.js  decodifica un region file y pinta su tesela de 512x512
js/nbt.js         parser NBT (gzip/zlib vía DecompressionStream)
js/world.js       lectura de la carpeta del mundo y de las cabeceras .mca
js/chunks.js      cálculo de tickets → chunks cargados
js/map.js         render en canvas, pan/zoom, tooltip
js/main.js        interfaz
```

---

# Mapa de chunks carregados

[English](#loaded-chunks-map) · [Español](#mapa-de-chunks-cargados) · **Português** · [中文](#已加载区块地图) · [Русский](#карта-загруженных-чанков)

Página estática que lê a pasta de um mundo de **Minecraft: Java Edition** no navegador e desenha o mapa
do seu mundo — o terreno real, renderizado a partir dos blocos como o MCA Selector faz — com uma camada
por cima dos chunks que ficariam **carregados** por spawn chunks, `/forceload` e a presença de jogadores.

Sem backend, sem build, sem dependências: os arquivos nunca saem do seu computador.

## Terreno

Com a camada de terreno ligada, os region files da área que você está vendo são decodificados em Web
Workers: de cada coluna se pega o bloco de superfície (com o heightmap `WORLD_SURFACE`), colorido com a
paleta dos mapas do jogo e sombreado pelo desnível; a água é sombreada pela profundidade. Cada região
vira um tile de 512x512 (16 px por chunk) que fica em cache e é desenhado sob os chunks carregados.

O mesmo mecanismo desenha o **mapa de biomas**: uma cor sólida por bioma, no estilo do Amidst e do MCA
Selector, amostrando a célula de bioma (4x4x4) na superfície no overworld e a uma altura fixa no Nether
e no End, onde não há superfície aproveitável. Cada modo tem seu próprio cache, então alternar é
instantâneo na segunda vez.

Cerca de 0,5 s por região em um núcleo, quatro regiões por vez, e só as visíveis são renderizadas.

O mapa de biomas precisa do formato 1.18+ (`sections[].biomes` com paleta de nomes); mundos anteriores
guardam os biomas como IDs numéricos e sairiam vazios nesse modo. Biomas de mods viram cinza.

Testado com a 1.21 (`sections[].block_states`). O leitor também tem um caminho para o formato de
1.13-1.17 (`Level.Sections` com `Palette`/`BlockStates`), que ainda não foi conferido com um mundo
antigo de verdade.

> Web Workers não funcionam a partir de `file://`, então **a camada de terreno precisa que a página seja
> servida por HTTP**. Todo o resto funciona abrindo o arquivo diretamente.

## Ajustes

A barra flutuante do canto superior direito guarda duas preferências em `localStorage`:

- **Tema**: claro ou escuro. Por padrão segue o do sistema (`prefers-color-scheme`) e muda junto com ele
  enquanto você não escolher um na mão. O canvas do mapa lê a paleta das variáveis CSS, então o mapa
  muda junto com o resto da página.
- **Idioma**: espanhol, inglês, português, chinês simplificado ou russo, aplicado na hora (inclusive no
  tooltip, nas estatísticas e nos avisos). Por padrão usa o do navegador.

Todos os textos ficam em `js/i18n.js`; para acrescentar um idioma basta copiar um bloco e traduzi-lo.

## Uso

Abra o `index.html` (ou sirva a pasta com qualquer servidor estático / GitHub Pages) e arraste a pasta
do mundo — a que fica dentro de `saves/`, não a `saves/` inteira.

```
python3 -m http.server 8080   # e abra http://localhost:8080
```

Precisa de um navegador com `DecompressionStream` (Chrome/Edge 80+, Firefox 113+, Safari 16.4+) e, para
arrastar pastas, um navegador baseado em Chromium ou um Firefox recente.

## O que é lido, e de onde

| Dado | Origem no save |
|---|---|
| Nome, versão, spawn, gamerules | `level.dat` (NBT + gzip) |
| Jogador em mundo de um jogador | `level.dat` → `Data.Player.Pos` |
| Jogadores em servidor | `playerdata/<uuid>.dat` → `Pos`, `Dimension` |
| Chunks fixados com `/forceload` | `<dim>/data/chunks.dat` → `data.Forced` (LongArray de `ChunkPos` empacotados) |
| Chunks gerados e o último save | cabeçalho de `<dim>/region/r.X.Z.mca` (4 KiB de posições + 4 KiB de timestamps) |
| Terreno | blocos dos chunks de `<dim>/region/r.X.Z.mca`, só das regiões na tela |
| Biomas | `sections[].biomes` desses mesmos chunks (células de 4x4x4) |

Ao carregar o mundo só são lidos os primeiros 8 KiB de cada `.mca`, então um mundo de vários GB abre em
segundos; os chunks completos são decodificados depois, e só os das regiões que você olha.

Dimensões detectadas: overworld (`region/`), `DIM-1`, `DIM1` e dimensões personalizadas em
`dimensions/<namespace>/<nome>/`.

## O que isto **não** consegue saber

Um save **não guarda** quais chunks estavam carregados na memória: isso é estado do servidor em
execução. O que a página mostra é uma reconstrução dos *tickets* que existiriam ao iniciar o mundo:

- **Spawn chunks**: raio tirado da gamerule `spawnChunkRadius` quando o mundo a tem (1.20.5+); se não,
  usa-se o comportamento clássico (raio 9 → 19×19 chunks com ticking mais uma borda). Editável.
- **Jogadores**: a distância de simulação não fica no mundo, e sim no `server.properties` ou nas opções
  do cliente, então é um controle da interface (10 por padrão).
- **Chunk loaders** com pérolas do end, portais ou mods: dependem do estado em execução e não são
  gravados em disco, então não aparecem.

O modelo de tickets é o de sempre: raio *r* com *entity ticking*, mais um anel com *block ticking* e
mais um anel apenas carregado (borda).

## Estrutura

```
index.html        landing + interface
css/styles.css
js/i18n.js        textos nos cinco idiomas + troca na hora
js/theme.js       modo claro / escuro com preferência lembrada
js/blockcolors.js paleta bloco -> cor para o terreno
js/biomecolors.js paleta bioma -> cor para o mapa de biomas
js/terrain.js     pool de workers e cache de tiles
js/terrain-worker.js  decodifica um region file e pinta seu tile de 512x512
js/nbt.js         parser NBT (gzip/zlib via DecompressionStream)
js/world.js       leitura da pasta do mundo e dos cabeçalhos .mca
js/chunks.js      cálculo de tickets → chunks carregados
js/map.js         render em canvas, pan/zoom, tooltip
js/main.js        interface
```

---

# 已加载区块地图

[English](#loaded-chunks-map) · [Español](#mapa-de-chunks-cargados) · [Português](#mapa-de-chunks-carregados) · **中文** · [Русский](#карта-загруженных-чанков)

一个静态页面，在浏览器里读取 **Minecraft：Java 版**的世界文件夹，并绘制世界地图——像 MCA Selector 那样
从方块数据渲染出真实地形——再在上面叠加一层：由出生点区块、`/forceload` 和玩家位置决定的**保持加载**的
区块。

没有后端，没有构建步骤，没有依赖：文件永远不会离开你的电脑。

## 地形

打开地形图层后，你正在查看区域的 region 文件会在 Web Worker 中解码：取每一列的表面方块（使用
`WORLD_SURFACE` 高度图），用游戏地图的配色上色，并按高低差添加阴影；水则按深度加深。每个区域会变成一张
512x512 的图块（每个区块 16 像素），缓存起来并绘制在已加载区块图层的下方。

同一套机制也能画**生物群系地图**：每个生物群系一种纯色，风格接近 Amidst 和 MCA Selector。在主世界按地表
采样生物群系单元（4x4x4），在下界和末地则按固定高度采样，因为那里没有可用的“地表”。两种模式分别缓存，
所以第二次切换是瞬时的。

单核大约每个区域 0.5 秒，一次处理四个区域，并且只渲染可见的区域。

生物群系地图需要 1.18+ 的格式（带名称调色板的 `sections[].biomes`）；更早的世界把生物群系存成数字 ID，
在该模式下会是空白。模组的生物群系会显示为灰色。

已在 1.21（`sections[].block_states`）上测试。读取器也有一条针对 1.13–1.17 格式（`Level.Sections` 配
`Palette`/`BlockStates`）的分支，但还没有用真正的旧世界验证过。

> Web Worker 无法在 `file://` 下运行，因此**地形图层需要通过 HTTP 打开页面**。其余功能直接双击文件也能用。

## 设置

右上角的浮动栏会把两项偏好保存在 `localStorage` 中：

- **主题**：浅色或深色。默认跟随系统（`prefers-color-scheme`）并随之变化，直到你手动选择为止。地图画布
  从 CSS 变量读取配色，所以地图会和页面其余部分一起切换。
- **语言**：西班牙语、英语、葡萄牙语、简体中文或俄语，即时生效（包括提示框、统计和警告）。默认使用浏览器
  的语言。

所有文本都在 `js/i18n.js` 里；要增加一种语言，复制一个语言块翻译即可。

## 使用方法

打开 `index.html`（或用任意静态服务器 / GitHub Pages 提供该文件夹），然后拖入世界文件夹——是 `saves/`
里面的那个，而不是整个 `saves/`。

```
python3 -m http.server 8080   # 然后打开 http://localhost:8080
```

需要支持 `DecompressionStream` 的浏览器（Chrome/Edge 80+、Firefox 113+、Safari 16.4+）；拖入文件夹还需要
基于 Chromium 的浏览器或较新的 Firefox。

## 读取了什么，从哪里读

| 数据 | 存档中的来源 |
|---|---|
| 名称、版本、出生点、游戏规则 | `level.dat`（NBT + gzip） |
| 单人世界的玩家 | `level.dat` → `Data.Player.Pos` |
| 服务器上的玩家 | `playerdata/<uuid>.dat` → `Pos`、`Dimension` |
| 用 `/forceload` 固定的区块 | `<dim>/data/chunks.dat` → `data.Forced`（打包后的 `ChunkPos` LongArray） |
| 已生成的区块及上次保存时间 | `<dim>/region/r.X.Z.mca` 的文件头（4 KiB 位置表 + 4 KiB 时间戳） |
| 地形 | 这些 `<dim>/region/r.X.Z.mca` 中区块的方块，只读屏幕上的区域 |
| 生物群系 | 同样这些区块的 `sections[].biomes`（4x4x4 单元） |

加载世界时每个 `.mca` 只读前 8 KiB，所以几个 GB 的世界也能在几秒内打开；完整区块是之后才解码的，而且只解码
你实际查看的区域。

可识别的维度：主世界（`region/`）、`DIM-1`、`DIM1`，以及 `dimensions/<命名空间>/<名称>/` 下的自定义维度。

## 这个工具**无法**知道的事

存档**不会保存**当时内存中加载了哪些区块：那是服务器运行时的状态。页面展示的是世界启动时会存在的
*票据（ticket）*的重建结果：

- **出生点区块**：如果世界里有 `spawnChunkRadius` 游戏规则（1.20.5+）就采用它；否则使用经典行为
  （半径 9 → 19×19 个持续 tick 的区块，外加一圈边界）。可以手动调整。
- **玩家**：模拟距离不在世界文件里，而在 `server.properties` 或客户端设置中，所以它是界面上的一个选项
  （默认 10）。
- **区块加载器**：用末影珍珠、传送门或模组做的那种依赖运行时状态，不会写入磁盘，因此不会显示。

票据模型是常见的那一套：半径 *r* 为 *entity ticking*，外面一圈 *block ticking*，再外面一圈仅加载（边界）。

## 项目结构

```
index.html        落地页 + 界面
css/styles.css
js/i18n.js        五种语言的文本 + 即时切换
js/theme.js       浅色 / 深色模式，记住偏好
js/blockcolors.js 方块 -> 颜色，用于地形
js/biomecolors.js 生物群系 -> 颜色，用于生物群系地图
js/terrain.js     worker 池与图块缓存
js/terrain-worker.js  解码 region 文件并绘制 512x512 图块
js/nbt.js         NBT 解析器（通过 DecompressionStream 处理 gzip/zlib）
js/world.js       读取世界文件夹与 .mca 文件头
js/chunks.js      由票据计算加载的区块
js/map.js         canvas 渲染、平移缩放、提示框
js/main.js        界面逻辑
```

---

# Карта загруженных чанков

[English](#loaded-chunks-map) · [Español](#mapa-de-chunks-cargados) · [Português](#mapa-de-chunks-carregados) · [中文](#已加载区块地图) · **Русский**

Статическая страница, которая читает папку мира **Minecraft: Java Edition** прямо в браузере и рисует
карту вашего мира — настоящий рельеф, отрисованный по блокам, как это делает MCA Selector, — а поверх
неё слой чанков, которые остались бы **загруженными** из-за спавн-чанков, `/forceload` и присутствия
игроков.

Ни бэкенда, ни сборки, ни зависимостей: файлы никогда не покидают ваш компьютер.

## Рельеф

Со включённым слоем рельефа файлы регионов той области, которую вы смотрите, декодируются в Web
Workers: из каждой колонки берётся поверхностный блок (по карте высот `WORLD_SURFACE`), раскрашивается
палитрой игровых карт и затеняется по перепаду высот; вода затемняется по глубине. Каждый регион
превращается в тайл 512x512 (16 px на чанк), который кешируется и рисуется под слоем загруженных чанков.

Тот же механизм рисует **карту биомов**: по одному сплошному цвету на биом, в стиле Amidst и MCA
Selector. Ячейка биома (4x4x4) берётся на поверхности в обычном мире и на фиксированной высоте в
Нижнем мире и Крае, где пригодной поверхности нет. Каждый режим кешируется отдельно, поэтому со
второго раза переключение мгновенное.

Примерно 0,5 с на регион на одном ядре, по четыре региона одновременно, и отрисовываются только видимые.

Карте биомов нужен формат 1.18+ (`sections[].biomes` с палитрой имён); в более старых мирах биомы
хранятся числовыми идентификаторами и в этом режиме карта будет пустой. Биомы из модов становятся серыми.

Проверено на 1.21 (`sections[].block_states`). В читателе есть и ветка для формата 1.13–1.17
(`Level.Sections` с `Palette`/`BlockStates`), но её пока не на чем было проверить по-настоящему.

> Web Workers не работают из `file://`, поэтому **слою рельефа нужно, чтобы страница отдавалась по
> HTTP**. Всё остальное работает и при открытии файла напрямую.

## Настройки

Плавающая панель в правом верхнем углу хранит две настройки в `localStorage`:

- **Тема**: светлая или тёмная. По умолчанию следует системной (`prefers-color-scheme`) и меняется
  вместе с ней, пока вы не выберете тему вручную. Холст карты берёт палитру из CSS-переменных, поэтому
  карта переключается вместе со всей страницей.
- **Язык**: испанский, английский, португальский, китайский (упрощённый) или русский, применяется сразу
  (включая всплывающую подсказку, сводку и предупреждения). По умолчанию берётся язык браузера.

Все тексты лежат в `js/i18n.js`; чтобы добавить язык, достаточно скопировать блок и перевести его.

## Использование

Откройте `index.html` (или отдайте папку любым статическим сервером / GitHub Pages) и перетащите папку
мира — ту, что внутри `saves/`, а не всю `saves/`.

```
python3 -m http.server 8080   # и откройте http://localhost:8080
```

Нужен браузер с `DecompressionStream` (Chrome/Edge 80+, Firefox 113+, Safari 16.4+), а для перетаскивания
папок — браузер на Chromium или свежий Firefox.

## Что читается и откуда

| Данные | Источник в сохранении |
|---|---|
| Название, версия, спавн, игровые правила | `level.dat` (NBT + gzip) |
| Игрок в одиночном мире | `level.dat` → `Data.Player.Pos` |
| Игроки на сервере | `playerdata/<uuid>.dat` → `Pos`, `Dimension` |
| Чанки, закреплённые через `/forceload` | `<dim>/data/chunks.dat` → `data.Forced` (LongArray упакованных `ChunkPos`) |
| Сгенерированные чанки и время сохранения | заголовок `<dim>/region/r.X.Z.mca` (4 KiB позиций + 4 KiB меток времени) |
| Рельеф | блоки чанков из `<dim>/region/r.X.Z.mca`, только для регионов на экране |
| Биомы | `sections[].biomes` тех же чанков (ячейки 4x4x4) |

При загрузке мира читаются только первые 8 KiB каждого `.mca`, поэтому мир на несколько ГБ открывается
за секунды; полные чанки декодируются позже и только для тех регионов, которые вы действительно смотрите.

Распознаются измерения: обычный мир (`region/`), `DIM-1`, `DIM1` и пользовательские измерения в
`dimensions/<пространство имён>/<название>/`.

## Чего это **не** может знать

Сохранение **не хранит**, какие чанки были загружены в памяти: это состояние работающего сервера. На
странице показана реконструкция *тикетов*, которые существовали бы при запуске мира:

- **Спавн-чанки**: радиус берётся из правила `spawnChunkRadius`, если оно есть в мире (1.20.5+); иначе
  используется классическое поведение (радиус 9 → 19×19 чанков с тиками плюс граница). Можно изменить.
- **Игроки**: дистанция симуляции хранится не в мире, а в `server.properties` или в настройках клиента,
  поэтому это параметр интерфейса (по умолчанию 10).
- **Чанклоадеры** из эндер-жемчуга, порталов или модов: они зависят от состояния работающего сервера и
  на диск не пишутся, поэтому не отображаются.

Модель тикетов обычная: радиус *r* с *entity ticking*, ещё одно кольцо с *block ticking* и ещё одно —
просто загруженное (граница).

## Структура

```
index.html        лендинг + интерфейс
css/styles.css
js/i18n.js        тексты на пяти языках + переключение на лету
js/theme.js       светлая / тёмная тема с запоминанием выбора
js/blockcolors.js палитра блок -> цвет для рельефа
js/biomecolors.js палитра биом -> цвет для карты биомов
js/terrain.js     пул воркеров и кеш тайлов
js/terrain-worker.js  декодирует файл региона и рисует его тайл 512x512
js/nbt.js         парсер NBT (gzip/zlib через DecompressionStream)
js/world.js       чтение папки мира и заголовков .mca
js/chunks.js      расчёт тикетов → загруженные чанки
js/map.js         отрисовка на canvas, панорама/зум, подсказка
js/main.js        интерфейс
```
