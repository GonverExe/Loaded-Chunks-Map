/*
 * Color de superficie por bloque, en la línea de los "map colors" del juego,
 * que es lo que da al mapa el aspecto conocido de los mapas de Minecraft.
 * Se usa desde el worker de terreno (importScripts) y desde la leyenda.
 */
(function (global) {
    'use strict';

    // Paleta base (los map colors de Minecraft, redondeados).
    const C = {
        grass: [127, 178, 56],
        sand: [247, 233, 163],
        wool: [199, 199, 199],
        fire: [255, 0, 0],
        ice: [160, 160, 255],
        metal: [167, 167, 167],
        plant: [0, 124, 0],
        snow: [255, 255, 255],
        clay: [164, 168, 184],
        dirt: [151, 109, 77],
        stone: [112, 112, 112],
        water: [64, 64, 255],
        wood: [143, 119, 72],
        quartz: [255, 252, 245],
        orange: [216, 127, 51],
        magenta: [178, 76, 216],
        lightBlue: [102, 153, 216],
        yellow: [229, 229, 51],
        lime: [127, 204, 25],
        pink: [242, 127, 165],
        gray: [76, 76, 76],
        lightGray: [153, 153, 153],
        cyan: [76, 127, 153],
        purple: [127, 63, 178],
        blue: [51, 76, 178],
        brown: [102, 76, 51],
        green: [102, 127, 51],
        red: [153, 51, 51],
        black: [25, 25, 25],
        gold: [250, 238, 77],
        diamond: [92, 219, 213],
        lapis: [74, 128, 255],
        emerald: [0, 217, 58],
        podzol: [129, 86, 49],
        nether: [112, 2, 0],
        terracotta: [142, 60, 46],
        crimsonNylium: [189, 48, 49],
        crimsonStem: [148, 63, 97],
        warpedNylium: [22, 126, 134],
        warpedStem: [58, 142, 140],
        deepslate: [100, 100, 100],
        rawIron: [216, 175, 147],
        glowLichen: [127, 167, 150],
        sculk: [8, 10, 15],
        endStone: [221, 223, 165],
        purpur: [170, 122, 170],
        bedrock: [84, 84, 84],
    };

    // Bloques concretos. Lo que no esté aquí pasa por las reglas de abajo.
    const BLOCKS = {
        air: null,
        cave_air: null,
        void_air: null,
        grass_block: C.grass,
        moss_block: [92, 133, 47],
        moss_carpet: [92, 133, 47],
        dirt: C.dirt,
        coarse_dirt: C.dirt,
        rooted_dirt: [149, 108, 76],
        farmland: [95, 66, 42],
        dirt_path: [148, 122, 74],
        mud: [58, 53, 62],
        muddy_mangrove_roots: [58, 53, 62],
        podzol: C.podzol,
        mycelium: [112, 96, 112],
        stone: C.stone,
        cobblestone: C.stone,
        mossy_cobblestone: [104, 122, 90],
        andesite: [136, 136, 136],
        diorite: [225, 225, 225],
        granite: [149, 103, 85],
        calcite: [223, 224, 217],
        tuff: [108, 109, 102],
        dripstone_block: [134, 107, 92],
        gravel: [136, 126, 126],
        clay: C.clay,
        sand: C.sand,
        red_sand: [190, 102, 33],
        sandstone: C.sand,
        red_sandstone: [190, 102, 33],
        water: C.water,
        bubble_column: C.water,
        ice: C.ice,
        packed_ice: [141, 180, 255],
        blue_ice: [116, 167, 253],
        frosted_ice: C.ice,
        lava: C.fire,
        magma_block: [153, 51, 51],
        snow: C.snow,
        snow_block: C.snow,
        powder_snow: [248, 253, 253],
        bedrock: C.bedrock,
        obsidian: [21, 18, 30],
        crying_obsidian: [43, 20, 74],
        deepslate: C.deepslate,
        cobbled_deepslate: [92, 92, 96],
        tinted_glass: [45, 45, 45],
        netherrack: C.nether,
        nether_bricks: [44, 21, 26],
        soul_sand: [81, 62, 50],
        soul_soil: [81, 62, 50],
        basalt: [84, 84, 92],
        blackstone: [42, 35, 40],
        crimson_nylium: C.crimsonNylium,
        warped_nylium: C.warpedNylium,
        end_stone: C.endStone,
        purpur_block: C.purpur,
        end_portal_frame: [15, 118, 91],
        sculk: C.sculk,
        sculk_catalyst: [12, 17, 22],
        sculk_vein: C.sculk,
        sculk_shrieker: [12, 17, 22],
        glowstone: [227, 174, 108],
        sea_lantern: [172, 199, 190],
        shroomlight: [240, 146, 70],
        hay_block: [229, 187, 25],
        melon: [111, 168, 51],
        pumpkin: [216, 127, 51],
        carved_pumpkin: [216, 127, 51],
        jack_o_lantern: [216, 127, 51],
        bricks: [150, 97, 83],
        mud_bricks: [124, 100, 78],
        iron_block: C.metal,
        gold_block: C.gold,
        diamond_block: C.diamond,
        emerald_block: C.emerald,
        lapis_block: C.lapis,
        redstone_block: [255, 0, 0],
        coal_block: [25, 25, 25],
        netherite_block: [67, 61, 62],
        raw_iron_block: C.rawIron,
        raw_copper_block: [190, 105, 76],
        copper_block: [190, 105, 76],
        oxidized_copper: [79, 152, 122],
        weathered_copper: [98, 158, 128],
        exposed_copper: [161, 124, 100],
        bamboo: [155, 187, 91],
        bamboo_block: [155, 187, 91],
        cactus: [90, 143, 47],
        sugar_cane: [148, 191, 105],
        lily_pad: [32, 128, 48],
        vine: [72, 108, 40],
        cobweb: [220, 220, 220],
        glass: [255, 255, 255],
        glass_pane: [255, 255, 255],
        tnt: [219, 62, 34],
        sponge: [195, 192, 76],
        wet_sponge: [173, 178, 65],
        bookshelf: C.wood,
        crafting_table: C.wood,
        chest: [162, 130, 78],
        barrel: [140, 111, 61],
        furnace: C.stone,
        spawner: [30, 40, 50],
        beacon: [124, 217, 209],
        amethyst_block: [133, 103, 197],
        budding_amethyst: [133, 103, 197],
        prismarine: [99, 156, 151],
        dark_prismarine: [51, 91, 75],
        prismarine_bricks: [99, 156, 151],
        slime_block: [111, 194, 89],
        honey_block: [251, 179, 43],
        nether_wart_block: [114, 8, 8],
        warped_wart_block: [22, 119, 121],
        mangrove_roots: [93, 71, 44],
        ochre_froglight: [222, 219, 187],
        verdant_froglight: [216, 227, 214],
        pearlescent_froglight: [237, 216, 227],
        short_grass: C.plant,
        grass: C.plant,
        tall_grass: C.plant,
        fern: C.plant,
        large_fern: C.plant,
        dead_bush: [128, 88, 52],
        seagrass: [51, 122, 51],
        tall_seagrass: [51, 122, 51],
        kelp: [40, 110, 40],
        kelp_plant: [40, 110, 40],
        sea_pickle: [110, 130, 55],
    };

    // Reglas por nombre, en orden: la primera que encaje manda.
    const RULES = [
        [/(^|_)water/, C.water],
        [/(^|_)lava/, C.fire],
        [/_leaves$/, [58, 130, 42]],
        [/(^|_)log$|_log$|_wood$|_stem$|_hyphae$/, C.wood],
        [
            /_planks$|_slab$|_stairs$|_fence|_door$|_trapdoor$|_sign$|_button$|_pressure_plate$/,
            C.wood,
        ],
        [/_wool$|_carpet$/, C.wool],
        [/_concrete/, C.wool],
        [/_terracotta$|_glazed_terracotta$/, C.terracotta],
        [/_stained_glass/, C.wool],
        [/deepslate/, C.deepslate],
        [/_ore$/, C.stone],
        [/_sandstone/, C.sand],
        [/_shulker_box$/, C.purple],
        [/_bed$/, C.red],
        [/_banner$/, C.wool],
        [/_coral|_coral_block|_coral_fan/, C.pink],
        [/_mushroom|mushroom_block|mushroom_stem/, [206, 178, 137]],
        [
            /flower|tulip|orchid|allium|bluet|daisy|poppy|dandelion|lilac|peony|rose_bush|sunflower|pitcher|torchflower/,
            [155, 175, 80],
        ],
        [/sapling|_bush|azalea/, C.plant],
        [/wheat|carrots|potatoes|beetroots|crops|melon_stem|pumpkin_stem/, [146, 173, 62]],
        [/nether_brick|_nether/, C.nether],
        [/blackstone|basalt/, [42, 35, 40]],
        [/copper/, [190, 105, 76]],
        [/amethyst/, [133, 103, 197]],
        [/candle|torch|lantern|campfire/, [255, 180, 90]],
        [/rail|chain|iron_bars|anvil|hopper|cauldron/, C.metal],
        [/snow/, C.snow],
        [/ice/, C.ice],
        [/sculk/, C.sculk],
        [/stone|cobble|brick|smooth|polished|chiseled|pillar|wall$/, C.stone],
    ];

    const cache = new Map();

    /* Devuelve [r,g,b] para "minecraft:grass_block", o null si es aire. */
    function colorOf(name) {
        if (cache.has(name)) return cache.get(name);
        const short = name.indexOf(':') === -1 ? name : name.slice(name.indexOf(':') + 1);
        let c;
        if (Object.prototype.hasOwnProperty.call(BLOCKS, short)) {
            c = BLOCKS[short];
        } else {
            c = null;
            for (const [re, color] of RULES) {
                if (re.test(short)) {
                    c = color;
                    break;
                }
            }
            if (!c) c = C.stone; // desconocido: color neutro, mejor que un hueco
        }
        cache.set(name, c);
        return c;
    }

    /* Bloques que no deben contar como superficie (aire y decoración fina). */
    const TRANSPARENT = new Set([
        'minecraft:air',
        'minecraft:cave_air',
        'minecraft:void_air',
        'minecraft:barrier',
        'minecraft:light',
        'minecraft:structure_void',
    ]);

    function isAir(name) {
        return TRANSPARENT.has(name);
    }

    /* Agua: se trata aparte para poder pintar la profundidad. */
    const WATER_BLOCKS = new Set([
        'minecraft:water',
        'minecraft:flowing_water',
        'minecraft:bubble_column',
    ]);

    function isWater(name) {
        return WATER_BLOCKS.has(name);
    }

    global.BlockColors = { colorOf, isAir, isWater, WATER: C.water };
})(typeof self !== 'undefined' ? self : this);
