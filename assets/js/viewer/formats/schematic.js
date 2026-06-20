// Legacy MCEdit schematic parser
// NBT: Width/Height/Length (short), Blocks (byte array, YZX order), Data (byte array, nibble metadata)
import { NbtFile } from '../../lib/deepslate.esm.js';
import { BlockGrid } from '../blockgrid.js';

// Static mapping of common legacy block IDs + metadata to modern block states.
// Covers the blocks most commonly seen in legacy schematics. Unknown IDs fall through
// to a sentinel "minecraft:unknown_<id>_<meta>" so they are visible but harmless.
const LEGACY_ID_MAP = {
  '0': 'minecraft:air',
  '1': 'minecraft:stone',
  '1:1': 'minecraft:granite',
  '1:2': 'minecraft:polished_granite',
  '1:3': 'minecraft:diorite',
  '1:4': 'minecraft:polished_diorite',
  '1:5': 'minecraft:andesite',
  '1:6': 'minecraft:polished_andesite',
  '2': 'minecraft:grass_block[snowy=false]',
  '3': 'minecraft:dirt',
  '3:1': 'minecraft:coarse_dirt',
  '3:2': 'minecraft:podzol[snowy=false]',
  '4': 'minecraft:cobblestone',
  '5': 'minecraft:oak_planks',
  '5:1': 'minecraft:spruce_planks',
  '5:2': 'minecraft:birch_planks',
  '5:3': 'minecraft:jungle_planks',
  '5:4': 'minecraft:acacia_planks',
  '5:5': 'minecraft:dark_oak_planks',
  '7': 'minecraft:bedrock',
  '8': 'minecraft:water[level=0]',
  '9': 'minecraft:water[level=0]',
  '10': 'minecraft:lava[level=0]',
  '11': 'minecraft:lava[level=0]',
  '12': 'minecraft:sand',
  '12:1': 'minecraft:red_sand',
  '13': 'minecraft:gravel',
  '14': 'minecraft:gold_ore',
  '15': 'minecraft:iron_ore',
  '16': 'minecraft:coal_ore',
  '17': 'minecraft:oak_log[axis=y]',
  '17:1': 'minecraft:spruce_log[axis=y]',
  '17:2': 'minecraft:birch_log[axis=y]',
  '17:3': 'minecraft:jungle_log[axis=y]',
  '18': 'minecraft:oak_leaves[distance=1,persistent=false]',
  '18:1': 'minecraft:spruce_leaves[distance=1,persistent=false]',
  '18:2': 'minecraft:birch_leaves[distance=1,persistent=false]',
  '18:3': 'minecraft:jungle_leaves[distance=1,persistent=false]',
  '19': 'minecraft:sponge',
  '20': 'minecraft:glass',
  '21': 'minecraft:lapis_ore',
  '22': 'minecraft:lapis_block',
  '24': 'minecraft:sandstone',
  '24:1': 'minecraft:chiseled_sandstone',
  '24:2': 'minecraft:cut_sandstone',
  '25': 'minecraft:note_block',
  '31': 'minecraft:grass',
  '31:2': 'minecraft:fern',
  '32': 'minecraft:dead_bush',
  '35': 'minecraft:white_wool',
  '35:1': 'minecraft:orange_wool',
  '35:2': 'minecraft:magenta_wool',
  '35:3': 'minecraft:light_blue_wool',
  '35:4': 'minecraft:yellow_wool',
  '35:5': 'minecraft:lime_wool',
  '35:6': 'minecraft:pink_wool',
  '35:7': 'minecraft:gray_wool',
  '35:8': 'minecraft:light_gray_wool',
  '35:9': 'minecraft:cyan_wool',
  '35:10': 'minecraft:purple_wool',
  '35:11': 'minecraft:blue_wool',
  '35:12': 'minecraft:brown_wool',
  '35:13': 'minecraft:green_wool',
  '35:14': 'minecraft:red_wool',
  '35:15': 'minecraft:black_wool',
  '37': 'minecraft:dandelion',
  '38': 'minecraft:poppy',
  '41': 'minecraft:gold_block',
  '42': 'minecraft:iron_block',
  '43': 'minecraft:stone_slab',
  '44': 'minecraft:stone_slab[type=bottom]',
  '45': 'minecraft:bricks',
  '46': 'minecraft:tnt[unstable=false]',
  '47': 'minecraft:bookshelf',
  '48': 'minecraft:mossy_cobblestone',
  '49': 'minecraft:obsidian',
  '50': 'minecraft:torch',
  '52': 'minecraft:spawner',
  '53': 'minecraft:oak_stairs[facing=east,half=bottom,shape=straight]',
  '54': 'minecraft:chest[facing=north,type=single]',
  '56': 'minecraft:diamond_ore',
  '57': 'minecraft:diamond_block',
  '58': 'minecraft:crafting_table',
  '60': 'minecraft:farmland[moisture=0]',
  '61': 'minecraft:furnace[facing=north,lit=false]',
  '67': 'minecraft:cobblestone_stairs[facing=east,half=bottom,shape=straight]',
  '73': 'minecraft:redstone_ore',
  '78': 'minecraft:snow[layers=1]',
  '79': 'minecraft:ice',
  '80': 'minecraft:snow_block',
  '81': 'minecraft:cactus[age=0]',
  '82': 'minecraft:clay',
  '86': 'minecraft:carved_pumpkin[facing=north]',
  '87': 'minecraft:netherrack',
  '88': 'minecraft:soul_sand',
  '89': 'minecraft:glowstone',
  '91': 'minecraft:jack_o_lantern[facing=north]',
  '95': 'minecraft:white_stained_glass',
  '98': 'minecraft:stone_bricks',
  '98:1': 'minecraft:mossy_stone_bricks',
  '98:2': 'minecraft:cracked_stone_bricks',
  '98:3': 'minecraft:chiseled_stone_bricks',
  '101': 'minecraft:iron_bars',
  '102': 'minecraft:glass_pane',
  '103': 'minecraft:melon',
  '106': 'minecraft:vine',
  '108': 'minecraft:brick_stairs[facing=east,half=bottom,shape=straight]',
  '109': 'minecraft:stone_brick_stairs[facing=east,half=bottom,shape=straight]',
  '110': 'minecraft:mycelium[snowy=false]',
  '112': 'minecraft:nether_bricks',
  '114': 'minecraft:nether_brick_stairs[facing=east,half=bottom,shape=straight]',
  '121': 'minecraft:end_stone',
  '122': 'minecraft:dragon_egg',
  '123': 'minecraft:redstone_lamp[lit=false]',
  '124': 'minecraft:redstone_lamp[lit=true]',
  '129': 'minecraft:emerald_ore',
  '133': 'minecraft:emerald_block',
  '134': 'minecraft:spruce_stairs[facing=east,half=bottom,shape=straight]',
  '135': 'minecraft:birch_stairs[facing=east,half=bottom,shape=straight]',
  '136': 'minecraft:jungle_stairs[facing=east,half=bottom,shape=straight]',
  '155': 'minecraft:quartz_block',
  '156': 'minecraft:quartz_stairs[facing=east,half=bottom,shape=straight]',
  '159': 'minecraft:white_terracotta',
  '168': 'minecraft:prismarine',
  '170': 'minecraft:hay_block[axis=y]',
  '172': 'minecraft:terracotta',
  '173': 'minecraft:coal_block',
  '174': 'minecraft:packed_ice',
  '179': 'minecraft:red_sandstone',
  '181': 'minecraft:red_sandstone_slab',
};

function legacyToModern(id, meta) {
  const specific = LEGACY_ID_MAP[`${id}:${meta}`];
  if (specific) return specific;
  const generic = LEGACY_ID_MAP[`${id}`];
  if (generic) return generic;
  return `minecraft:unknown_${id}_${meta}`;
}

export async function parse(bytes) {
  const file = NbtFile.read(bytes);
  const root = file.root;

  const width = root.getNumber('Width');
  const height = root.getNumber('Height');
  const length = root.getNumber('Length');

  if (width === 0 || height === 0 || length === 0) {
    throw new Error('Schematic file has zero dimensions');
  }

  const blocksArray = root.getByteArray('Blocks');
  const dataArray = root.has('Data') ? root.getByteArray('Data') : null;

  const grid = new BlockGrid(width, height, length);

  const blockIds = [];
  blocksArray.forEach((b) => blockIds.push(b.getAsNumber() & 0xff));
  const metaVals = [];
  if (dataArray) {
    dataArray.forEach((b) => metaVals.push(b.getAsNumber() & 0x0f));
  }

  // YZX order: index = (y * Length + z) * Width + x
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * length + z) * width + x;
        const blockId = blockIds[idx] ?? 0;
        const meta = metaVals[idx] ?? 0;
        if (blockId === 0) continue;
        const stateStr = legacyToModern(blockId, meta);
        if (stateStr === 'minecraft:air') continue;
        grid.set(x, y, z, stateStr);
      }
    }
  }

  return grid;
}
