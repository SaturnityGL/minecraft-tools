// Sponge v2 schematic parser
// NBT: Width, Height, Length (shorts), Palette (compound: name -> index), BlockData (byte array, VarInt-packed, YZX order)
import { NbtFile } from '../../lib/deepslate.esm.js';
import { BlockGrid } from '../blockgrid.js';

function decodeVarIntArray(data) {
  const result = [];
  let i = 0;
  while (i < data.length) {
    let value = 0;
    let shift = 0;
    let b;
    do {
      b = data[i++] & 0xff;
      value |= (b & 0x7f) << shift;
      shift += 7;
      if (shift > 35) throw new Error('VarInt too large');
    } while (b & 0x80);
    result.push(value);
  }
  return result;
}

export async function parse(bytes) {
  const file = NbtFile.read(bytes);
  const root = file.root;

  const width = root.getNumber('Width');
  const height = root.getNumber('Height');
  const length = root.getNumber('Length');

  if (width === 0 || height === 0 || length === 0) {
    throw new Error('Schem file has zero dimensions');
  }

  const paletteCompound = root.getCompound('Palette');
  const palette = new Array(paletteCompound.size).fill('minecraft:air');

  paletteCompound.forEach((stateStr, tag) => {
    const idx = tag.getAsNumber();
    palette[idx] = stateStr;
  });

  const blockDataArray = root.getByteArray('BlockData');
  const rawBytes = [];
  blockDataArray.forEach((b) => rawBytes.push(b.getAsNumber()));
  const indices = decodeVarIntArray(rawBytes);

  const grid = new BlockGrid(width, height, length);

  // YZX order: index = (y * Length + z) * Width + x
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * length + z) * width + x;
        const paletteIdx = indices[idx];
        if (paletteIdx === undefined || paletteIdx >= palette.length) continue;
        const stateStr = palette[paletteIdx];
        if (stateStr === 'minecraft:air') continue;
        grid.set(x, y, z, stateStr);
      }
    }
  }

  return grid;
}
