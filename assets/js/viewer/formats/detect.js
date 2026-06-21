import { NbtFile } from '../../lib/deepslate.esm.js';

// Detect format by NBT content first, with the file extension as a tiebreaker.
// People rename schematics all the time (mcbuild.org and similar mirrors often
// hand out Litematica saves under a `.schematic` filename), so the extension
// alone is not trustworthy.
export async function detectFormat(filename, bytes) {
  const ext = filename.split('.').pop()?.toLowerCase();

  // Try to parse the NBT and inspect top-level keys. This is cheap relative to
  // the full block decode that follows.
  try {
    const file = NbtFile.read(bytes);
    const root = file.root;

    // Litematica .litematic: Regions compound + Metadata with TotalBlocks.
    if (root.has('Regions')) return 'litematic';

    // Sponge v3 schematic: { Schematic: { Width, Height, Length, Blocks: { Palette, Data } } }
    if (root.has('Schematic')) return 'schem';

    // Sponge v2 schematic: Palette + BlockData at root.
    if (root.has('Palette') && root.has('BlockData')) return 'schem';

    // Vanilla MC structure block .nbt: palette + blocks + size, all lowercase.
    if (root.has('palette') && root.has('blocks') && root.has('size')) return 'nbt';

    // Legacy MCEdit .schematic: numeric Blocks byte array + Data nibble array at root.
    // Must come AFTER Sponge v2 because both have a Blocks-ish payload but Sponge v2's
    // is named BlockData, not Blocks.
    if (root.has('Blocks') && root.has('Data') && root.has('Width')) return 'schematic';
  } catch {
    // Fall through to extension hint.
  }

  // Content probe was inconclusive. Use the extension as a fallback hint.
  if (ext === 'litematic') return 'litematic';
  if (ext === 'schem') return 'schem';
  if (ext === 'schematic') return 'schematic';

  return 'nbt';
}
