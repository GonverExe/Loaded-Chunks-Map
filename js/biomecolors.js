/*
 * Colores por bioma, en la línea de los mapas de biomas clásicos (Amidst y
 * MCA Selector): color plano y saturado por bioma, sin sombreado.
 * Cubre overworld, Nether y End.
 */
(function (global) {
  'use strict';

  const BIOMES = {
    // --- Overworld: llanuras y bosques ---
    plains: [141, 179, 96],
    sunflower_plains: [181, 219, 136],
    meadow: [96, 161, 123],
    forest: [5, 102, 33],
    flower_forest: [45, 142, 73],
    birch_forest: [48, 116, 68],
    old_growth_birch_forest: [88, 156, 108],
    dark_forest: [64, 81, 26],
    pale_garden: [185, 196, 196],
    cherry_grove: [255, 180, 203],
    taiga: [11, 102, 89],
    old_growth_pine_taiga: [89, 102, 81],
    old_growth_spruce_taiga: [129, 142, 121],
    jungle: [83, 123, 9],
    sparse_jungle: [98, 139, 23],
    bamboo_jungle: [118, 142, 20],
    savanna: [189, 178, 95],
    savanna_plateau: [167, 157, 100],
    windswept_savanna: [229, 218, 135],
    swamp: [7, 249, 178],
    mangrove_swamp: [103, 53, 43],
    mushroom_fields: [255, 0, 255],

    // --- Overworld: seco y montaña ---
    desert: [250, 148, 24],
    badlands: [217, 69, 21],
    wooded_badlands: [176, 151, 101],
    eroded_badlands: [255, 109, 61],
    windswept_hills: [96, 96, 96],
    windswept_gravelly_hills: [120, 152, 120],
    windswept_forest: [88, 108, 82],
    jagged_peaks: [220, 220, 200],
    frozen_peaks: [160, 160, 170],
    stony_peaks: [127, 136, 145],
    snowy_slopes: [196, 196, 196],
    grove: [71, 172, 172],
    stony_shore: [162, 162, 132],

    // --- Overworld: frío ---
    snowy_plains: [255, 255, 255],
    ice_spikes: [180, 220, 220],
    snowy_taiga: [49, 85, 74],
    snowy_beach: [250, 240, 192],

    // --- Overworld: agua y costa ---
    beach: [250, 222, 85],
    river: [0, 0, 255],
    frozen_river: [160, 160, 255],
    ocean: [0, 0, 112],
    deep_ocean: [0, 0, 48],
    warm_ocean: [0, 0, 172],
    lukewarm_ocean: [0, 0, 144],
    deep_lukewarm_ocean: [0, 0, 64],
    cold_ocean: [32, 32, 112],
    deep_cold_ocean: [32, 32, 56],
    frozen_ocean: [112, 112, 214],
    deep_frozen_ocean: [64, 64, 144],

    // --- Cuevas ---
    dripstone_caves: [123, 98, 84],
    lush_caves: [123, 163, 49],
    deep_dark: [15, 26, 26],

    // --- Nether ---
    nether_wastes: [191, 59, 59],
    soul_sand_valley: [94, 56, 48],
    crimson_forest: [221, 8, 8],
    warped_forest: [73, 144, 123],
    basalt_deltas: [109, 109, 102],

    // --- End ---
    the_end: [128, 128, 255],
    end_highlands: [128, 128, 255],
    end_midlands: [162, 162, 255],
    small_end_islands: [75, 75, 171],
    end_barrens: [102, 102, 204],

    the_void: [0, 0, 0]
  };

  const UNKNOWN = [128, 128, 128];
  const cache = new Map();

  /* Color de "minecraft:plains". Los biomas de mods caen en un gris neutro. */
  function colorOf(name) {
    let c = cache.get(name);
    if (c) return c;
    const short = name.indexOf(':') === -1 ? name : name.slice(name.indexOf(':') + 1);
    c = BIOMES[short] || UNKNOWN;
    cache.set(name, c);
    return c;
  }

  function isKnown(name) {
    const short = name.indexOf(':') === -1 ? name : name.slice(name.indexOf(':') + 1);
    return !!BIOMES[short];
  }

  function label(name) {
    const short = name.indexOf(':') === -1 ? name : name.slice(name.indexOf(':') + 1);
    return short.replace(/_/g, ' ');
  }

  global.BiomeColors = { colorOf, isKnown, label, BIOMES };
})(typeof self !== 'undefined' ? self : this);
