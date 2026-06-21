// Sponge schematic parser - supports v1, v2, and v3.
// v1: Width/Height/Length + Blocks (byte array of legacy IDs) at root.
// v2: Width/Height/Length + Palette (compound) + BlockData (byte array, VarInt) at root.
// v3: { Schematic: { Width, Height, Length, Blocks: { Palette, Data } } }
import { NbtFile } from '../../lib/deepslate.esm.js';
import { BlockGrid } from '../blockgrid.js';

// Practical ceiling on the schematic volume. Storage can hold much more, but
// deepslate's StructureRenderer chunkifier stalls past ~15M cells regardless of
// fill density. Keep the limit aligned with what the renderer can smoothly handle.
const MAX_VOLUME = 15_000_000;

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

function detectVersion(root) {
  // v3 wraps the body in a "Schematic" compound. v2/v1 keep everything at root.
  if (root.has('Schematic')) {
    const inner = root.getCompound('Schematic');
    return { version: 3, body: inner };
  }
  // v2 has a Palette compound + BlockData byte array at root.
  if (root.has('Palette') && root.has('BlockData')) {
    return { version: 2, body: root };
  }
  // v1 has Blocks (byte array of numeric IDs) at root, no Palette compound.
  if (root.has('Blocks') && !root.has('Palette')) {
    return { version: 1, body: root };
  }
  // Fall back to whatever the root looks like and let the dimension check fail informatively.
  return { version: 2, body: root };
}

export async function parse(bytes) {
  const file = NbtFile.read(bytes);
  const root = file.root;

  const { version, body } = detectVersion(root);

  if (!body.has('Width') || !body.has('Height') || !body.has('Length')) {
    throw new Error(`Schem file is missing Width/Height/Length. Detected version ${version}, but the body lacks dimension fields. The file may be a different schematic variant the viewer does not support yet.`);
  }

  const width = body.getNumber('Width');
  const height = body.getNumber('Height');
  const length = body.getNumber('Length');

  if (width <= 0 || height <= 0 || length <= 0) {
    throw new Error(`Schem file reported a non-positive dimension (${width} x ${height} x ${length}). Detected Sponge schematic v${version}.`);
  }

  const volume = width * height * length;
  if (volume > MAX_VOLUME) {
    throw new Error(`This schematic is ${width} x ${height} x ${length} = ${volume.toLocaleString()} cells, past the browser viewer's smooth-rendering ceiling of ${MAX_VOLUME.toLocaleString()} cells. The volume is what hurts, not how many blocks are filled. Try cropping it before loading here.`);
  }

  // v1 path: numeric block IDs in a flat byte array, no palette.
  if (version === 1) {
    const blocksArr = body.getByteArray('Blocks');
    const ids = [];
    blocksArr.forEach((b) => ids.push(b.getAsNumber() & 0xff));
    const grid = new BlockGrid(width, height, length);
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < length; z++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * length + z) * width + x;
          const id = ids[idx] ?? 0;
          if (id === 0) continue;
          grid.set(x, y, z, `minecraft:unknown_${id}_0`);
        }
      }
    }
    return grid;
  }

  // v2/v3 path: state-string palette + VarInt-packed byte array.
  // In v3 Palette + Data live in a nested "Blocks" compound; in v2 they live at the body root.
  const blocksContainer = version === 3 ? body.getCompound('Blocks') : body;

  if (!blocksContainer.has('Palette')) {
    throw new Error(`Schem v${version} body is missing the Palette compound.`);
  }
  const dataKey = version === 3 ? 'Data' : 'BlockData';
  if (!blocksContainer.has(dataKey)) {
    throw new Error(`Schem v${version} body is missing the ${dataKey} byte array.`);
  }

  const paletteCompound = blocksContainer.getCompound('Palette');
  const palette = new Array(paletteCompound.size).fill('minecraft:air');

  paletteCompound.forEach((stateStr, tag) => {
    const idx = tag.getAsNumber();
    palette[idx] = stateStr;
  });

  const blockDataArray = blocksContainer.getByteArray(dataKey);
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
