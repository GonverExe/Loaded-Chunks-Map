/* Render del mapa de chunks sobre canvas, con pan y zoom. */
(function (global) {
  'use strict';

  const COLORS = {
    bg: '#0b0f17',
    generated: '#1c2433',
    generatedRecent: '#2c3a52',
    grid: 'rgba(255,255,255,0.05)',
    regionGrid: 'rgba(255,255,255,0.12)',
    axis: 'rgba(255,255,255,0.22)',
    spawn: '#4ade80',
    player: '#60a5fa',
    forceload: '#c084fc',
    text: '#e6edf7'
  };
  const LEVEL_ALPHA = [0.95, 0.6, 0.28];

  function ChunkMap(canvas, tooltip) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tooltip = tooltip;
    this.scale = 3;                // píxeles por chunk
    this.camX = 0; this.camZ = 0;  // centro de la vista, en chunks
    this.dim = null;
    this.loaded = new Map();
    this.world = null;
    this.layers = { generated: true, activity: false, loaded: true, markers: true, grid: true };
    this.hover = null;
    this._raf = null;
    this._bindEvents();
    this.resize();
  }

  ChunkMap.prototype._bindEvents = function () {
    const c = this.canvas;
    let dragging = false, lastX = 0, lastY = 0, moved = false;

    c.addEventListener('mousedown', (e) => {
      dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
      c.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => { dragging = false; c.style.cursor = 'grab'; });
    window.addEventListener('mousemove', (e) => {
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        this.camX -= dx / this.scale;
        this.camZ -= dy / this.scale;
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
    this.hover = { x: cx, z: cz };

    const k = cx + ',' + cz;
    const chunk = this.loaded.get(k);
    const gen = this.dim && this.dim.generated.get(k);
    const lines = [];
    lines.push('<b>Chunk ' + cx + ', ' + cz + '</b>');
    lines.push('<span class="dim">Bloques ' + (cx * 16) + ', ' + (cz * 16) + ' → ' + (cx * 16 + 15) + ', ' + (cz * 16 + 15) + '</span>');
    lines.push('<span class="dim">Región r.' + Math.floor(cx / 32) + '.' + Math.floor(cz / 32) + '.mca</span>');
    if (chunk) {
      lines.push('<span class="tag lvl' + chunk.level + '">' + ChunkModel.LEVEL_NAMES[chunk.level] + '</span>');
      const seen = new Set();
      for (const s of chunk.sources) {
        if (seen.has(s.detail)) continue;
        seen.add(s.detail);
        lines.push('· ' + s.detail);
      }
    } else {
      lines.push('<span class="dim">No cargado</span>');
    }
    if (gen) {
      lines.push(gen.mtime ? '<span class="dim">Generado · guardado ' + new Date(gen.mtime * 1000).toLocaleString('es-ES') + '</span>'
                           : '<span class="dim">Generado</span>');
    } else {
      lines.push('<span class="dim">Sin generar</span>');
    }
    this.tooltip.innerHTML = lines.join('<br>');
    this.tooltip.hidden = false;
    const tw = this.tooltip.offsetWidth, th = this.tooltip.offsetHeight;
    let tx = e.clientX - rect.left + 16, ty = e.clientY - rect.top + 16;
    if (tx + tw > this.w) tx = this.w - tw - 8;
    if (ty + th > this.h) ty = e.clientY - rect.top - th - 12;
    this.tooltip.style.left = tx + 'px';
    this.tooltip.style.top = ty + 'px';
    this.draw();
  };

  ChunkMap.prototype.draw = function () {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this._draw(); });
  };

  ChunkMap.prototype._draw = function () {
    const ctx = this.ctx, s = this.scale;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    if (!this.dim) { this._drawEmpty(); return; }

    const min = this.screenToChunk(0, 0), max = this.screenToChunk(this.w, this.h);
    const inView = (x, z) => x >= min.x - 1 && x <= max.x + 1 && z >= min.z - 1 && z <= max.z + 1;
    const px = Math.max(1, s);

    // Chunks ya generados en disco (contexto del mapa).
    if (this.layers.generated) {
      const now = Date.now() / 1000;
      const recentCut = 60 * 60 * 24 * 7;   // 7 días
      for (const c of this.dim.generated.values()) {
        if (!inView(c.x, c.z)) continue;
        const p = this.chunkToScreen(c.x, c.z);
        if (this.layers.activity && c.mtime) {
          const age = Math.max(0, now - c.mtime);
          const t = Math.max(0, 1 - age / recentCut);
          ctx.fillStyle = t > 0 ? 'rgba(245,158,11,' + (0.10 + t * 0.55).toFixed(3) + ')' : COLORS.generated;
        } else {
          ctx.fillStyle = COLORS.generated;
        }
        ctx.fillRect(p.x, p.y, px, px);
      }
    }

    // Chunks cargados.
    if (this.layers.loaded) {
      for (const c of this.loaded.values()) {
        if (!inView(c.x, c.z)) continue;
        const p = this.chunkToScreen(c.x, c.z);
        ctx.globalAlpha = LEVEL_ALPHA[c.level];
        ctx.fillStyle = COLORS[ChunkModel.dominantSource(c)] || COLORS.spawn;
        ctx.fillRect(p.x, p.y, px, px);
      }
      ctx.globalAlpha = 1;
    }

    // Rejillas.
    if (this.layers.grid) {
      if (s >= 8) this._grid(1, COLORS.grid, min, max);
      if (s * 32 >= 24) this._grid(32, COLORS.regionGrid, min, max);
      this._axes();
    }

    if (this.layers.markers) this._markers();
    if (this.hover) {
      const p = this.chunkToScreen(this.hover.x, this.hover.z);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x + 0.5, p.y + 0.5, px, px);
    }
    this._scaleBar();
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
    ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(p.x) + 0.5, 0); ctx.lineTo(Math.round(p.x) + 0.5, this.h);
    ctx.moveTo(0, Math.round(p.y) + 0.5); ctx.lineTo(this.w, Math.round(p.y) + 0.5);
    ctx.stroke();
  };

  ChunkMap.prototype._markers = function () {
    const ctx = this.ctx;
    if (this.world && this.world.spawn && this.dim.id === 'minecraft:overworld') {
      const cx = Math.floor(this.world.spawn.x / 16), cz = Math.floor(this.world.spawn.z / 16);
      const p = this.chunkToScreen(cx + 0.5, cz + 0.5);
      this._pin(p.x, p.y, COLORS.spawn, 'Spawn');
    }
    for (const pl of this.dim.players) {
      const p = this.chunkToScreen(pl.chunkX + 0.5, pl.chunkZ + 0.5);
      this._pin(p.x, p.y, COLORS.player, pl.name);
    }
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  };

  ChunkMap.prototype._pin = function (x, y, color, label) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#0b0f17'; ctx.stroke();
    if (this.scale >= 1.2) {
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = COLORS.text;
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
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + wpx, y);
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
    ctx.moveTo(x + wpx, y - 4); ctx.lineTo(x + wpx, y + 4);
    ctx.stroke();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(chunks + ' chunks · ' + (chunks * 16) + ' bloques', x, y - 8);
  };

  ChunkMap.prototype._drawEmpty = function () {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Carga la carpeta de tu mundo para ver el mapa', this.w / 2, this.h / 2);
    ctx.textAlign = 'left';
  };

  global.ChunkMap = ChunkMap;
})(window);
