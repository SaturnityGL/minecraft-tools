// Vanilla MC structure block NBT parser
// Format: palette (list of block state compounds), blocks (list of {pos, state}), size ([x,y,z])
import { NbtFile, NbtType } from '../../lib/deepslate.esm.js';
import { BlockGrid } from '../blockgrid.js';

export async function parse(bytes) {
  let file;
  try {
    file = NbtFile.read(bytes);
  } catch (err) {
    console.warn('[nbt parser] Failed to parse as NBT:', err);
    return new BlockGrid(1, 1, 1);
  }

  const root = file.root;

  if (!root.has('palette') || !root.has('blocks') || !root.has('size')) {
    console.warn('[nbt parser] NBT file does not match structure block schema (missing size/palette/blocks)');
    return new BlockGrid(1, 1, 1);
  }

  const sizeList = root.getList('size', NbtType.Int);
  const width = sizeList.getNumber(0);
  const height = sizeList.getNumber(1);
  const depth = sizeList.getNumber(2);

  const paletteList = root.getList('palette', NbtType.Compound);
  const palette = [];
  for (let i = 0; i < paletteList.length; i++) {
    const entry = paletteList.getCompound(i);
    const name = entry.getString('Name');
    if (!entry.has('Properties')) {
      palette.push(name);
      continue;
    }
    const props = entry.getCompound('Properties');
    const keys = [];
    props.forEach((k) => keys.push(k));
    keys.sort();
    if (keys.length === 0) {
      palette.push(name);
      continue;
    }
    const propStr = keys.map((k) => `${k}=${props.getString(k)}`).join(',');
    palette.push(`${name}[${propStr}]`);
  }

  const grid = new BlockGrid(width, height, depth);

  const blockList = root.getList('blocks', NbtType.Compound);
  for (let i = 0; i < blockList.length; i++) {
    const entry = blockList.getCompound(i);
    const posList = entry.getList('pos', NbtType.Int);
    const x = posList.getNumber(0);
    const y = posList.getNumber(1);
    const z = posList.getNumber(2);
    const stateIdx = entry.getNumber('state');

    if (stateIdx < 0 || stateIdx >= palette.length) continue;
    const stateStr = palette[stateIdx];
    if (stateStr === 'minecraft:air') continue;
    grid.set(x, y, z, stateStr);
  }

  return grid;
}
