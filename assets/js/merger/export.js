import {
  NbtFile,
  NbtCompound,
  NbtList,
  NbtString,
  NbtInt,
  NbtLong,
  NbtShort,
  NbtByte,
  NbtByteArray,
  NbtLongArray,
} from '../lib/deepslate.esm.js';

function parseStateString(s) {
  const bracket = s.indexOf('[');
  if (bracket === -1) return { name: s, properties: {} };
  const name = s.slice(0, bracket);
  const propStr = s.slice(bracket + 1, s.length - 1);
  const properties = {};
  for (const pair of propStr.split(',')) {
    const eq = pair.indexOf('=');
    if (eq !== -1) {
      properties[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return { name, properties };
}

function packLitematicBlockStates(indices, paletteSize) {
  const bitWidth = Math.max(2, Math.ceil(Math.log2(paletteSize)));
  const total = indices.length;
  const numWords = Math.ceil((total * bitWidth) / 32);
  const words = new Int32Array(numWords);

  for (let blockIdx = 0; blockIdx < total; blockIdx++) {
    const val = indices[blockIdx];
    const startBit = blockIdx * bitWidth;
    const startWord = (startBit / 32) | 0;
    const startBitOff = startBit % 32;
    words[startWord] |= (val << startBitOff);
    const endBit = startBit + bitWidth - 1;
    const endWord = (endBit / 32) | 0;
    if (endWord !== startWord) {
      const bitsInFirst = 32 - startBitOff;
      words[endWord] |= (val >>> bitsInFirst);
    }
  }

  const numLongs = Math.ceil(numWords / 2);
  const longs = [];
  for (let i = 0; i < numLongs; i++) {
    const lo = BigInt(words[i * 2] >>> 0);
    const hi = BigInt((words[i * 2 + 1] ?? 0) >>> 0);
    longs.push(new NbtLong((hi << 32n) | lo));
  }
  return longs;
}

export function exportLitematic(grid, schematicName = 'merged') {
  const { width: W, height: H, depth: D, palette } = grid;
  const total = W * H * D;
  const nowMs = BigInt(Date.now());

  const indices = new Uint32Array(total);
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        indices[y * D * W + z * W + x] = grid.data[(y * D + z) * W + x];
      }
    }
  }

  const longs = packLitematicBlockStates(indices, Math.max(2, palette.length));

  const paletteList = new NbtList();
  for (let p = 0; p < palette.length; p++) {
    const { name, properties } = parseStateString(palette[p] || 'minecraft:air');
    const entry = new NbtCompound();
    entry.set('Name', new NbtString(name));
    if (Object.keys(properties).length > 0) {
      const propsCompound = new NbtCompound();
      for (const [k, v] of Object.entries(properties)) {
        propsCompound.set(k, new NbtString(v));
      }
      entry.set('Properties', propsCompound);
    }
    paletteList.add(entry);
  }

  const regionPos = new NbtCompound();
  regionPos.set('x', new NbtInt(0));
  regionPos.set('y', new NbtInt(0));
  regionPos.set('z', new NbtInt(0));

  const regionSize = new NbtCompound();
  regionSize.set('x', new NbtInt(W));
  regionSize.set('y', new NbtInt(H));
  regionSize.set('z', new NbtInt(D));

  const region = new NbtCompound();
  region.set('Position', regionPos);
  region.set('Size', regionSize);
  region.set('BlockStatePalette', paletteList);
  region.set('BlockStates', new NbtLongArray(longs));
  region.set('TileEntities', new NbtList());
  region.set('Entities', new NbtList());
  region.set('PendingBlockTicks', new NbtList());
  region.set('PendingFluidTicks', new NbtList());

  const regions = new NbtCompound();
  regions.set('Main', region);

  const enclosingSize = new NbtCompound();
  enclosingSize.set('x', new NbtInt(W));
  enclosingSize.set('y', new NbtInt(H));
  enclosingSize.set('z', new NbtInt(D));

  const metadata = new NbtCompound();
  metadata.set('Name', new NbtString(schematicName));
  metadata.set('Author', new NbtString('BlockForge Merger'));
  metadata.set('Description', new NbtString(''));
  metadata.set('RegionCount', new NbtInt(1));
  metadata.set('EnclosingSize', enclosingSize);
  metadata.set('TotalVolume', new NbtInt(total));
  metadata.set('TotalBlocks', new NbtLong(BigInt(grid.countBlocks())));
  metadata.set('TimeCreated', new NbtLong(nowMs));
  metadata.set('TimeModified', new NbtLong(nowMs));

  const file = NbtFile.create({ name: '', compression: 'gzip' });
  file.root.set('MinecraftDataVersion', new NbtInt(3700));
  file.root.set('Version', new NbtInt(6));
  file.root.set('SubVersion', new NbtInt(1));
  file.root.set('Metadata', metadata);
  file.root.set('Regions', regions);

  return file.write();
}

export function exportSchemV2(grid) {
  const { width: W, height: H, depth: D, palette } = grid;

  const paletteCompound = new NbtCompound();
  for (let p = 0; p < palette.length; p++) {
    paletteCompound.set(palette[p] || 'minecraft:air', new NbtInt(p));
  }

  const rawBytes = [];
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        let val = grid.data[(y * D + z) * W + x];
        do {
          let b = val & 0x7f;
          val >>>= 7;
          if (val !== 0) b |= 0x80;
          rawBytes.push(b);
        } while (val !== 0);
      }
    }
  }

  const byteArray = new NbtByteArray(rawBytes.map((b) => new NbtByte(b)));

  const file = NbtFile.create({ name: '', compression: 'gzip' });
  file.root.set('Version', new NbtInt(2));
  file.root.set('DataVersion', new NbtInt(3700));
  file.root.set('Width', new NbtShort(W));
  file.root.set('Height', new NbtShort(H));
  file.root.set('Length', new NbtShort(D));
  file.root.set('Palette', paletteCompound);
  file.root.set('PaletteMax', new NbtInt(palette.length));
  file.root.set('BlockData', byteArray);
  file.root.set('BlockEntities', new NbtList());

  return file.write();
}

export function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
