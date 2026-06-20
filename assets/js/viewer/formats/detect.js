import { NbtFile } from '../../lib/deepslate.esm.js';

// Detect by extension first, then verify against NBT top-level keys.
// NBT files may be gzipped (magic 0x1F 0x8B) or raw (starts with 0x0A).
export async function detectFormat(filename, bytes) {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'litematic') return 'litematic';
  if (ext === 'schem') return 'schem';
  if (ext === 'schematic') return 'schematic';

  try {
    const file = NbtFile.read(bytes);
    const root = file.root;

    if (root.has('Regions')) return 'litematic';
    if (root.has('BlockData') && root.has('Palette')) return 'schem';
    if (root.has('Blocks') && root.has('Data')) return 'schematic';
  } catch {
    // Fall through to nbt
  }

  return 'nbt';
}
