// Litematica .litematic parser
// NBT: Regions (compound of regions), each with Position, Size, BlockStatePalette, BlockStates (bit-packed long array)
//
// Region Size can be negative on any axis. A negative Size on an axis means the
// region's primary corner (Position) sits on the MAX side of that axis, and the
// encoded block data walks from there toward smaller world coordinates.
import { NbtFile, NbtType } from '../../lib/deepslate.esm.js';
import { BlockGrid } from '../blockgrid.js';

// Practical ceiling on the combined region bounding box volume.
//
// Storage itself comfortably handles up to ~150M cells (2 bytes per cell in the
// palette-backed Uint16Array). The real bottleneck is deepslate's StructureRenderer,
// which iterates the dense size to build per-chunk meshes. Past ~15M cells the chunk
// pass freezes the browser for tens of seconds and feels broken, even when the
// schematic has only a few hundred thousand actual placed blocks.
//
// 15M cells covers every realistic shared schematic (gothic castles, ships, towns).
// Files past it get a clear error pointing at the volume, not the file size.
const MAX_VOLUME = 15_000_000;

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

  const volume = gridW * gridH * gridD;
  if (volume > MAX_VOLUME) {
    throw new Error(`This litematic's bounding box is ${gridW} x ${gridH} x ${gridD} = ${volume.toLocaleString()} cells, past the browser viewer's smooth-rendering ceiling of ${MAX_VOLUME.toLocaleString()} cells. The volume is what hurts, not how many blocks are filled. Try cropping the build to a tighter region with Litematica before loading it here.`);
  }

  const grid = new BlockGrid(gridW, gridH, gridD);

  for (const r of regions) {
    const { offsetX, offsetY, offsetZ, sizeX, sizeY, sizeZ, rawSizeX, rawSizeY, rawSizeZ, palette, longs } = r;
    if (sizeX === 0 || sizeY === 0 || sizeZ === 0) continue;

    // Direction sign per axis. A negative rawSize means the primary corner
    // (offset) is on the MAX side, and local indices walk toward smaller world coords.
    const dirX = rawSizeX < 0 ? -1 : 1;
    const dirY = rawSizeY < 0 ? -1 : 1;
    const dirZ = rawSizeZ < 0 ? -1 : 1;

    // Resolve the palette ONCE per region. blockStateCompoundToString iterates
    // properties + sorts + joins, which is far too expensive to run per block
    // (18M-block region would call it 18M times for ~241 unique states).
    const paletteStrings = new Array(palette.length);
    let airIdx = -1;
    for (let i = 0; i < palette.length; i++) {
      const s = blockStateCompoundToString(palette[i]);
      paletteStrings[i] = s;
      if (s === 'minecraft:air' && airIdx === -1) airIdx = i;
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

          const stateStr = paletteStrings[paletteIdx];
          if (stateStr === 'minecraft:air') continue;

          const gx = offsetX + x * dirX - minX;
          const gy = offsetY + y * dirY - minY;
          const gz = offsetZ + z * dirZ - minZ;
          grid.set(gx, gy, gz, stateStr);
        }
      }
    }
  }

  return grid;
}
