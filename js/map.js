/* Render del mapa de chunks sobre canvas, con pan y zoom. */
(function (global) {
  'use strict';

  const LEVEL_ALPHA = [0.95, 0.6, 0.28];
  const MONO = '11px ui-monospace, SFMono-Regular, Menlo, monospace';

  /* Los colores viven en el CSS para que sigan al tema activo. */
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
    return {
      bg: v('--map-bg', '#0b0f17'),
      generated: v('--map-gen', '#1c2433'),
      grid: v('--map-grid', 'rgba(255,255,255,0.05)'),
      regionGrid: v('--map-region-grid', 'rgba(255,255,255,0.12)'),
      axis: v('--map-axis', 'rgba(255,255,255,0.22)'),
      text: v('--map-text', '#e6edf7'),
      scale: v('--map-scale', 'rgba(255,255,255,0.65)'),
      scaleLine: v('--map-scale-line', 'rgba(255,255,255,0.5)'),
      hover: v('--map-hover', '#ffffff'),
      empty: v('--map-empty', 'rgba(255,255,255,0.25)'),
      loadMark: v('--map-load-mark', 'rgba(125,211,252,0.85)'),
      recentRGB: v('--map-recent-rgb', '245, 158, 11'),
      spawn: v('--spawn', '#4ade80'),
      player: v('--player', '#60a5fa'),
      forceload: v('--force', '#c084fc')
    };
  }

  function ChunkMap(canvas, tooltip) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tooltip = tooltip;
    this.scale = 3;                // píxeles por chunk
    this.camX = 0; this.camZ = 0;  // centro de la vista, en chunks
    this.dim = null;
    this.loaded = new Map();
    this.world = null;
    this.colors = readColors();
    this.layers = { terrain: true, generated: false, activity: false, loaded: true, markers: true, grid: true };
    this.hover = null;
    this._raf = null;
    this._animating = false;        // hay teselas en camino: repintar para animar
    this._animTimer = null;
    this._bindEvents();
    this.resize();
  }

  ChunkMap.prototype._bindEvents = function () {
    const c = this.canvas;
    let dragging = false, lastX = 0, lastY = 0;

    c.addEventListener('mousedown', (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      c.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => { dragging = false; c.style.cursor = 'grab'; });
    window.addEventListener('mousemove', (e) => {
      if (dragging) {
        this.camX -= (e.clientX - lastX) / this.scale;
        this.camZ -= (e.clientY - lastY) / this.scale;
        lastX = e.clientX; lastY = e.clientY;
        this.draw();
      }
    });
    c.addEventListener('mousemove', (e) => this._updateHover(e));
    c.addEventListener('mouseleave', () => { this.hover = null; this.tooltip.hidden = true; this.draw(); });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const before = this.screenToChunk(mx, my);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.scale = Math.max(0.15, Math.min(48, this.scale * factor));
      const after = this.screenToChunk(mx, my);
      this.camX += before.x - after.x;
      this.camZ += before.z - after.z;
      this.draw();
    }, { passive: false });

    // Táctil: arrastre con un dedo, zoom con pellizco.
    let touchDist = null, touchLast = null;
    c.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) touchLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      else if (e.touches.length === 2) touchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }, { passive: true });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && touchLast) {
        this.camX -= (e.touches[0].clientX - touchLast.x) / this.scale;
        this.camZ -= (e.touches[0].clientY - touchLast.y) / this.scale;
        touchLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2 && touchDist) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
        this.scale = Math.max(0.15, Math.min(48, this.scale * (d / touchDist)));
        touchDist = d;
      }
      this.draw();
    }, { passive: false });

    window.addEventListener('resize', () => { this.resize(); });
  };

  /* Recarga la paleta tras un cambio de tema. */
  ChunkMap.prototype.refreshTheme = function () {
    this.colors = readColors();
    this.draw();
  };

  ChunkMap.prototype.resize = function () {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width; this.h = rect.height;
    this.draw();
  };

  ChunkMap.prototype.screenToChunk = function (px, py) {
    return {
      x: (px - this.w / 2) / this.scale + this.camX,
      z: (py - this.h / 2) / this.scale + this.camZ
    };
  };
  ChunkMap.prototype.chunkToScreen = function (cx, cz) {
    return {
      x: (cx - this.camX) * this.scale + this.w / 2,
      y: (cz - this.camZ) * this.scale + this.h / 2
    };
  };

  ChunkMap.prototype.setData = function (world, dim, loaded) {
    this.world = world; this.dim = dim; this.loaded = loaded || new Map();
    if (global.Terrain) Terrain.setDimension(dim);
    this.draw();
  };

  ChunkMap.prototype.fit = function () {
    const boxes = [];
    if (this.dim) {
      for (const c of this.dim.generated.values()) boxes.push(c);
      for (const c of this.loaded.values()) boxes.push(c);
    }
    if (!boxes.length) { this.camX = 0; this.camZ = 0; this.scale = 3; this.draw(); return; }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const c of boxes) {
      if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
      if (c.z < minZ) minZ = c.z; if (c.z > maxZ) maxZ = c.z;
    }
    this.camX = (minX + maxX + 1) / 2;
    this.camZ = (minZ + maxZ + 1) / 2;
    const sx = this.w / (maxX - minX + 4), sz = this.h / (maxZ - minZ + 4);
    this.scale = Math.max(0.15, Math.min(48, Math.min(sx, sz)));
    this.draw();
  };

  ChunkMap.prototype.centerOn = function (cx, cz, scale) {
    this.camX = cx + 0.5; this.camZ = cz + 0.5;
    if (scale) this.scale = scale;
    this.draw();
  };

  ChunkMap.prototype._updateHover = function (e) {
    const rect = this.canvas.getBoundingClientRect();
    const p = this.screenToChunk(e.clientX - rect.left, e.clientY - rect.top);
    const cx = Math.floor(p.x), cz = Math.floor(p.z);
    this.hover = { x: cx, z: cz, clientX: e.clientX, clientY: e.clientY };
    this._renderTooltip();
    this.draw();
  };

  ChunkMap.prototype._renderTooltip = function () {
    if (!this.hover) return;
    const cx = this.hover.x, cz = this.hover.z;
    const k = cx + ',' + cz;
    const chunk = this.loaded.get(k);
    const gen = this.dim && this.dim.generated.get(k);
    const lines = ['<b>' + I18n.t('tip.chunk', { x: cx, z: cz }) + '</b>'];
    lines.push('<span class="dim">' + I18n.t('tip.blocks', {
      x1: cx * 16, z1: cz * 16, x2: cx * 16 + 15, z2: cz * 16 + 15
    }) + '</span>');
    lines.push('<span class="dim">' + I18n.t('tip.region', {
      rx: Math.floor(cx / 32), rz: Math.floor(cz / 32)
    }) + '</span>');

    if (chunk) {
      lines.push('<span class="tag lvl' + chunk.level + '">' + ChunkModel.levelName(chunk.level) + '</span>');
      const seen = new Set();
      for (const s of chunk.sources) {
        if (seen.has(s.detail)) continue;
        seen.add(s.detail);
        lines.push('· ' + s.detail);
      }
    } else {
      lines.push('<span class="dim">' + I18n.t('tip.notLoaded') + '</span>');
    }

    if (gen) {
      lines.push('<span class="dim">' + (gen.mtime
        ? I18n.t('tip.generatedAt', { date: new Date(gen.mtime * 1000).toLocaleString(I18n.locale()) })
        : I18n.t('tip.generated')) + '</span>');
    } else {
      lines.push('<span class="dim">' + I18n.t('tip.ungenerated') + '</span>');
    }

    this.tooltip.innerHTML = lines.join('<br>');
    this.tooltip.hidden = false;

    const rect = this.canvas.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth, th = this.tooltip.offsetHeight;
    let tx = this.hover.clientX - rect.left + 16, ty = this.hover.clientY - rect.top + 16;
    if (tx + tw > this.w) tx = this.w - tw - 8;
    if (ty + th > this.h) ty = this.hover.clientY - rect.top - th - 12;
    this.tooltip.style.left = tx + 'px';
    this.tooltip.style.top = ty + 'px';
  };

  /* Rehace los textos ya visibles tras un cambio de idioma. */
  ChunkMap.prototype.refreshText = function () {
    if (this.hover && !this.tooltip.hidden) this._renderTooltip();
    this.draw();
  };

  ChunkMap.prototype.draw = function () {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this._draw(); });
  };

  ChunkMap.prototype._draw = function () {
    const ctx = this.ctx, s = this.scale, C = this.colors;
    this._animating = false;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!this.dim) { this._drawEmpty(); return; }

    const min = this.screenToChunk(0, 0), max = this.screenToChunk(this.w, this.h);
    const inView = (x, z) => x >= min.x - 1 && x <= max.x + 1 && z >= min.z - 1 && z <= max.z + 1;
    const px = Math.max(1, s);

    // Chunks ya generados en disco (contexto del mapa).
    // Se dibujan primero: el terreno, cuando llega, los tapa. El relleno plano
    // (layers.generated) está retirado de la interfaz; el resaltado por fecha
    // se pinta solo, sin él, y solo sobre lo guardado hace poco.
    if (this.layers.generated || this.layers.activity) {
      const now = Date.now() / 1000;
      const recentCut = 60 * 60 * 24 * 7;   // 7 días
      for (const c of this.dim.generated.values()) {
        if (!inView(c.x, c.z)) continue;
        let t = 0;
        if (this.layers.activity && c.mtime) t = Math.max(0, 1 - Math.max(0, now - c.mtime) / recentCut);
        if (t <= 0 && !this.layers.generated) continue;
        const p = this.chunkToScreen(c.x, c.z);
        ctx.fillStyle = t > 0
          ? 'rgba(' + C.recentRGB + ',' + (0.10 + t * 0.55).toFixed(3) + ')'
          : C.generated;
        ctx.fillRect(p.x, p.y, px, px);
      }
    }

    // Terreno renderizado desde los region files.
    let terrainDrawn = false;
    if (this.layers.terrain && global.Terrain) terrainDrawn = this._drawTerrain(min, max);

    // Chunks cargados. Sobre el terreno se pintan translúcidos para no taparlo,
    // y se remata el borde del área para que siga leyéndose de un vistazo.
    if (this.layers.loaded) {
      const k = terrainDrawn ? 0.3 : 1;
      for (const c of this.loaded.values()) {
        if (!inView(c.x, c.z)) continue;
        const p = this.chunkToScreen(c.x, c.z);
        ctx.globalAlpha = LEVEL_ALPHA[c.level] * k;
        ctx.fillStyle = C[ChunkModel.dominantSource(c)] || C.spawn;
        ctx.fillRect(p.x, p.y, px, px);
      }
      ctx.globalAlpha = 1;
      if (terrainDrawn && s >= 0.8) this._outlineLoaded(inView);
    }

    // Rejillas.
    if (this.layers.grid) {
      if (s >= 8) this._grid(1, C.grid, min, max);
      if (s * 32 >= 24) this._grid(32, C.regionGrid, min, max);
      this._axes();
    }

    if (this.layers.markers) this._markers();
    if (this.hover) {
      const p = this.chunkToScreen(this.hover.x, this.hover.z);
      ctx.strokeStyle = C.hover;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x + 0.5, p.y + 0.5, px, px);
    }
    this._scaleBar();
    // Repintado de la animación a ~16 fps: suficiente para el barrido y mucho
    // más barato que redibujar el mapa entero en cada frame.
    if (this._animating && !this._animTimer) {
      this._animTimer = setTimeout(() => { this._animTimer = null; this.draw(); }, 60);
    }
  };

  /* Contorno del área cargada: solo las aristas que dan a un chunk no cargado. */
  ChunkMap.prototype._outlineLoaded = function (inView) {
    const ctx = this.ctx, s = this.scale;
    const bySource = new Map();
    for (const c of this.loaded.values()) {
      if (!inView(c.x, c.z)) continue;
      const src = ChunkModel.dominantSource(c);
      let list = bySource.get(src);
      if (!list) { list = []; bySource.set(src, list); }
      list.push(c);
    }
    ctx.lineWidth = 1.5;
    for (const [src, list] of bySource) {
      ctx.strokeStyle = this.colors[src] || this.colors.spawn;
      ctx.beginPath();
      for (const c of list) {
        const p = this.chunkToScreen(c.x, c.z);
        if (!this.loaded.has(c.x + ',' + (c.z - 1))) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + s, p.y); }
        if (!this.loaded.has(c.x + ',' + (c.z + 1))) { ctx.moveTo(p.x, p.y + s); ctx.lineTo(p.x + s, p.y + s); }
        if (!this.loaded.has((c.x - 1) + ',' + c.z)) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + s); }
        if (!this.loaded.has((c.x + 1) + ',' + c.z)) { ctx.moveTo(p.x + s, p.y); ctx.lineTo(p.x + s, p.y + s); }
      }
      ctx.stroke();
    }
  };

  /*
   * Dibuja las teselas de terreno que ya estén listas y pide las que faltan,
   * empezando por las del centro de la vista. Las que están en camino quedan
   * marcadas con el aviso de carga. Devuelve si pintó terreno de verdad.
   */
  ChunkMap.prototype._drawTerrain = function (min, max) {
    const ctx = this.ctx;
    const rx0 = Math.floor(min.x / 32), rx1 = Math.floor(max.x / 32);
    const rz0 = Math.floor(min.z / 32), rz1 = Math.floor(max.z / 32);
    const side = 32 * this.scale;
    const cx = (min.x + max.x) / 64, cz = (min.z + max.z) / 64;   // centro, en regiones

    const missing = [];
    let drawn = false;
    ctx.imageSmoothingEnabled = this.scale < 1;
    for (let rz = rz0; rz <= rz1; rz++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        if (!this.dim.regions || !this.dim.regions.has(rx + ',' + rz)) continue;
        const bmp = Terrain.get(rx, rz);
        if (bmp) {
          const p = this.chunkToScreen(rx * 32, rz * 32);
          ctx.drawImage(bmp, p.x, p.y, side, side);
          drawn = true;
        } else {
          missing.push({ rx, rz, d: (rx - cx) * (rx - cx) + (rz - cz) * (rz - cz) });
        }
      }
    }
    ctx.imageSmoothingEnabled = true;

    // Se pide antes de pintar el aviso: así la cola ya sabe qué está en camino.
    if (missing.length) {
      missing.sort((a, b) => a.d - b.d);
      Terrain.request(missing);
      const phase = performance.now() / 1000;
      let waiting = 0;
      for (const r of missing) {
        if (!Terrain.isLoading(r.rx, r.rz)) continue;
        if (this._drawLoadingTile(r.rx, r.rz, side, phase)) waiting++;
      }
      // Mientras quede algo en camino, el mapa se repinta solo para animar.
      if (waiting) this._animating = true;
    }
    return drawn;
  };

  /*
   * Aviso de "esta región se está leyendo": solo un aro girando en el centro,
   * sin velo ni relleno, para no alterar el fondo del mapa mientras llega.
   */
  ChunkMap.prototype._drawLoadingTile = function (rx, rz, side, phase) {
    if (side < 10) return false;      // región diminuta en pantalla: no cabe el aro
    const ctx = this.ctx;
    const p = this.chunkToScreen(rx * 32, rz * 32);
    const r = Math.max(3, Math.min(13, side / 5));
    const a = phase * 3.2;
    ctx.save();
    ctx.strokeStyle = this.colors.loadMark;
    ctx.lineWidth = Math.max(1.5, r / 5);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(p.x + side / 2, p.y + side / 2, r, a, a + Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();
    return true;
  };

  ChunkMap.prototype._grid = function (step, color, min, max) {
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.floor(min.x / step) * step, x1 = Math.ceil(max.x / step) * step;
    for (let x = x0; x <= x1; x += step) {
      const p = this.chunkToScreen(x, 0);
      ctx.moveTo(Math.round(p.x) + 0.5, 0); ctx.lineTo(Math.round(p.x) + 0.5, this.h);
    }
    const z0 = Math.floor(min.z / step) * step, z1 = Math.ceil(max.z / step) * step;
    for (let z = z0; z <= z1; z += step) {
      const p = this.chunkToScreen(0, z);
      ctx.moveTo(0, Math.round(p.y) + 0.5); ctx.lineTo(this.w, Math.round(p.y) + 0.5);
    }
    ctx.stroke();
  };

  ChunkMap.prototype._axes = function () {
    const ctx = this.ctx, p = this.chunkToScreen(0, 0);
    ctx.strokeStyle = this.colors.axis; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(p.x) + 0.5, 0); ctx.lineTo(Math.round(p.x) + 0.5, this.h);
    ctx.moveTo(0, Math.round(p.y) + 0.5); ctx.lineTo(this.w, Math.round(p.y) + 0.5);
    ctx.stroke();
  };

  ChunkMap.prototype._markers = function () {
    if (this.world && this.world.spawn && this.dim.id === 'minecraft:overworld') {
      const cx = Math.floor(this.world.spawn.x / 16), cz = Math.floor(this.world.spawn.z / 16);
      const p = this.chunkToScreen(cx + 0.5, cz + 0.5);
      this._pin(p.x, p.y, this.colors.spawn, I18n.t('legend.spawn'));
    }
    for (const pl of this.dim.players) {
      const p = this.chunkToScreen(pl.chunkX + 0.5, pl.chunkZ + 0.5);
      this._pin(p.x, p.y, this.colors.player, WorldReader.playerLabel(pl));
    }
  };

  ChunkMap.prototype._pin = function (x, y, color, label) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = this.colors.bg; ctx.stroke();
    if (this.scale >= 1.2) {
      // Halo del color del fondo: el texto cae sobre chunks de colores fuertes.
      ctx.font = MONO;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.colors.bg;
      ctx.strokeText(label, x + 9, y + 4);
      ctx.fillStyle = this.colors.text;
      ctx.fillText(label, x + 9, y + 4);
    }
  };

  ChunkMap.prototype._scaleBar = function () {
    const ctx = this.ctx;
    const targets = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
    let chunks = targets[targets.length - 1];
    for (const t of targets) { if (t * this.scale >= 60) { chunks = t; break; } }
    const wpx = chunks * this.scale;
    const x = 14, y = this.h - 18;
    ctx.strokeStyle = this.colors.scaleLine; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + wpx, y);
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
    ctx.moveTo(x + wpx, y - 4); ctx.lineTo(x + wpx, y + 4);
    ctx.stroke();
    ctx.font = MONO;
    ctx.fillStyle = this.colors.scale;
    ctx.fillText(I18n.t('map.scale', { chunks: chunks, blocks: chunks * 16 }), x, y - 8);
  };

  ChunkMap.prototype._drawEmpty = function () {
    const ctx = this.ctx;
    ctx.fillStyle = this.colors.empty;
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(I18n.t('map.empty'), this.w / 2, this.h / 2);
    ctx.textAlign = 'left';
  };

  global.ChunkMap = ChunkMap;
})(window);
