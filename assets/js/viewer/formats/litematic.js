// Litematica .litematic parser
// NBT: Regions (compound of regions), each with Position, Size, BlockStatePalette, BlockStates (bit-packed long array)
import { NbtFile, NbtType } from '../../lib/deepslate.esm.js';
import { BlockGrid } from '../blockgrid.js';

function blockStateCompoundToString(bs) {
  const name = bs.getString('Name');
  if (!bs.has('Properties')) return name;
  const props = bs.getCompound('Properties');
  const keys = [];
  props.forEach((k) => keys.push(k));
  keys.sort();
  if (keys.length === 0) return name;
  const propStr = keys.map((k) => `${k}=${props.getString(k)}`).join(',');
  return `${name}[${propStr}]`;
}

// Decode a packed long array. NbtLong stores as [hi32, lo32] pair.
// The bitstream treats each long as lo32 in bits 0-31, hi32 in bits 32-63.
function decodeLitematicBlockStates(longs, paletteLen, totalBlocks) {
  const bitWidth = Math.max(2, Math.ceil(Math.log2(paletteLen)));
  const mask = (1 << bitWidth) - 1;
  const result = new Uint32Array(totalBlocks);

  const words = new Int32Array(longs.length * 2);
  for (let i = 0; i < longs.length; i++) {
    const pair = longs[i].getAsPair();
    words[i * 2] = pair[1];     // lo32
    words[i * 2 + 1] = pair[0]; // hi32
  }

  for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx++) {
    const startBit = blockIdx * bitWidth;
    const startWord = (startBit / 32) | 0;
    const startBitOffset = startBit % 32;
    const endBit = startBit + bitWidth - 1;
    const endWord = (endBit / 32) | 0;

    let value;
    if (startWord === endWord) {
      value = (words[startWord] >>> startBitOffset) & mask;
    } else {
      const bitsFromFirst = 32 - startBitOffset;
      const lo = (words[startWord] >>> startBitOffset) & ((1 << bitsFromFirst) - 1);
      const hi = words[endWord] & ((1 << (bitWidth - bitsFromFirst)) - 1);
      value = lo | (hi << bitsFromFirst);
    }
    result[blockIdx] = value;
  }

  return result;
}

export async function parse(bytes) {
  const file = NbtFile.read(bytes);
  const root = file.root;

  if (!root.has('Regions')) throw new Error('Not a litematic: missing Regions key');

  const regionsCompound = root.getCompound('Regions');
  const regionNames = [];
  regionsCompound.forEach((k) => regionNames.push(k));

  const regions = [];

  for (const regionName of regionNames) {
    const region = regionsCompound.getCompound(regionName);

    const pos = region.getCompound('Position');
    const size = region.getCompound('Size');

    const offsetX = pos.getNumber('x');
    const offsetY = pos.getNumber('y');
    const offsetZ = pos.getNumber('z');
    const rawSizeX = size.getNumber('x');
    const rawSizeY = size.getNumber('y');
    const rawSizeZ = size.getNumber('z');

    const paletteList = region.getList('BlockStatePalette', NbtType.Compound);
    const palette = [];
    for (let i = 0; i < paletteList.length; i++) {
      palette.push(paletteList.getCompound(i));
    }

    const longArray = region.getLongArray('BlockStates');
    const longs = [];
    longArray.forEach((item) => longs.push(item));

    regions.push({
      offsetX, offsetY, offsetZ,
      rawSizeX, rawSizeY, rawSizeZ,
      sizeX: Math.abs(rawSizeX),
      sizeY: Math.abs(rawSizeY),
      sizeZ: Math.abs(rawSizeZ),
      palette,
      longs,
    });
  }

  let minX = 0, minY = 0, minZ = 0;
  let maxX = 0, maxY = 0, maxZ = 0;
  let first = true;

  for (const r of regions) {
    const startX = Math.min(r.offsetX, r.offsetX + r.rawSizeX);
    const startY = Math.min(r.offsetY, r.offsetY + r.rawSizeY);
    const startZ = Math.min(r.offsetZ, r.offsetZ + r.rawSizeZ);
    const endX = Math.max(r.offsetX, r.offsetX + r.rawSizeX);
    const endY = Math.max(r.offsetY, r.offsetY + r.rawSizeY);
    const endZ = Math.max(r.offsetZ, r.offsetZ + r.rawSizeZ);
    if (first) {
      minX = startX; minY = startY; minZ = startZ;
      maxX = endX; maxY = endY; maxZ = endZ;
      first = false;
    } else {
      minX = Math.min(minX, startX); minY = Math.min(minY, startY); minZ = Math.min(minZ, startZ);
      maxX = Math.max(maxX, endX); maxY = Math.max(maxY, endY); maxZ = Math.max(maxZ, endZ);
    }
  }

  const gridW = Math.max(1, maxX - minX);
  const gridH = Math.max(1, maxY - minY);
  const gridD = Math.max(1, maxZ - minZ);
  const grid = new BlockGrid(gridW, gridH, gridD);

  for (const r of regions) {
    const { offsetX, offsetY, offsetZ, sizeX, sizeY, sizeZ, palette, longs } = r;
    if (sizeX === 0 || sizeY === 0 || sizeZ === 0) continue;

    let airIdx = -1;
    for (let i = 0; i < palette.length; i++) {
      if (palette[i].getString('Name') === 'minecraft:air') { airIdx = i; break; }
    }

    const totalBlocks = sizeX * sizeY * sizeZ;
    const decoded = decodeLitematicBlockStates(longs, palette.length, totalBlocks);

    const yShift = sizeX * sizeZ;
    const zShift = sizeX;

    for (let y = 0; y < sizeY; y++) {
      for (let z = 0; z < sizeZ; z++) {
        for (let x = 0; x < sizeX; x++) {
          const idx = y * yShift + z * zShift + x;
          const paletteIdx = decoded[idx];
          if (paletteIdx === airIdx) continue;
          if (paletteIdx >= palette.length) continue;

          const stateStr = blockStateCompoundToString(palette[paletteIdx]);
          if (stateStr === 'minecraft:air') continue;

          const gx = offsetX + x - minX;
          const gy = offsetY + y - minY;
          const gz = offsetZ + z - minZ;
          grid.set(gx, gy, gz, stateStr);
        }
      }
    }
  }

  return grid;
}
