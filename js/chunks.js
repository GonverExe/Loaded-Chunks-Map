/* Reconstrucción de qué chunks quedarían cargados a partir de los tickets del mundo. */
(function (global) {
  'use strict';

  // Nivel de carga: cuanto más bajo, más "vivo" está el chunk.
  const LEVEL = { ENTITY: 0, TICKING: 1, BORDER: 2 };

  function levelName(level) { return I18n.t('level.' + level); }

  function key(x, z) { return x + ',' + z; }

  /* Coloca un ticket cuadrado: radio r con entity ticking, +1 con tick, +2 solo cargado. */
  function stamp(map, cx, cz, radius, source, detail) {
    const outer = radius + 2;
    for (let dx = -outer; dx <= outer; dx++) {
      for (let dz = -outer; dz <= outer; dz++) {
        const cheb = Math.max(Math.abs(dx), Math.abs(dz));
        const level = cheb <= radius ? LEVEL.ENTITY : (cheb === radius + 1 ? LEVEL.TICKING : LEVEL.BORDER);
        const x = cx + dx, z = cz + dz, k = key(x, z);
        let c = map.get(k);
        if (!c) { c = { x, z, level, sources: [] }; map.set(k, c); }
        else if (level < c.level) c.level = level;
        c.sources.push({ source, detail, level });
      }
    }
  }

  /*
   * options: { spawnRadius, simulationDistance, useSpawn, usePlayers, useForceload }
   * Devuelve Map "x,z" -> { x, z, level, sources }, con los textos ya resueltos
   * en el idioma activo (se recalcula al cambiarlo).
   */
  function compute(world, dim, options) {
    const map = new Map();
    if (!dim) return map;

    /*
     * El valor de spawnChunkRadius es el radio del ticket, no el del área con
     * entity ticking: con radio R el juego deja (2R-1)² chunks con entity
     * ticking, (2R+1)² con block ticking y (2R+3)² cargados. Por eso se pasa
     * R-1 a stamp(), que añade esos dos anillos. R = 0 no carga nada.
     */
    if (options.useSpawn && options.spawnRadius > 0 && world.spawn && dim.id === 'minecraft:overworld') {
      const cx = Math.floor(world.spawn.x / 16);
      const cz = Math.floor(world.spawn.z / 16);
      stamp(map, cx, cz, options.spawnRadius - 1, 'spawn',
            I18n.t('detail.spawn', { x: world.spawn.x, z: world.spawn.z }));
    }

    if (options.usePlayers) {
      for (const p of dim.players) {
        stamp(map, p.chunkX, p.chunkZ, options.simulationDistance, 'player',
              I18n.t('detail.player', {
                name: WorldReader.playerLabel(p),
                x: Math.round(p.x),
                z: Math.round(p.z)
              }));
      }
    }

    if (options.useForceload) {
      for (const f of dim.forced) {
        stamp(map, f.x, f.z, 0, 'forceload', I18n.t('detail.force', { x: f.x, z: f.z }));
      }
    }

    return map;
  }

  function stats(loaded) {
    const s = { total: loaded.size, entity: 0, ticking: 0, border: 0, bySource: {} };
    for (const c of loaded.values()) {
      if (c.level === LEVEL.ENTITY) s.entity++;
      else if (c.level === LEVEL.TICKING) s.ticking++;
      else s.border++;
      const seen = new Set();
      for (const src of c.sources) {
        if (seen.has(src.source)) continue;
        seen.add(src.source);
        s.bySource[src.source] = (s.bySource[src.source] || 0) + 1;
      }
    }
    return s;
  }

  /* Color dominante de un chunk: manda la fuente con el nivel más alto de actividad. */
  function dominantSource(chunk) {
    let best = null;
    for (const src of chunk.sources) {
      if (!best || src.level < best.level) best = src;
    }
    return best ? best.source : 'spawn';
  }

  global.ChunkModel = { compute, stats, dominantSource, levelName, LEVEL };
})(window);
