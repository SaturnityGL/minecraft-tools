// Build a redstone ROM cartridge BlockGrid from raw bytes.
//
// Cartridge layout (Y=0 substrate, Y=1 data on top):
//   - Each word = one row along +X, length = wordBits cells.
//   - Words stack along +Z, separated by `zSpacing` empty cells.
//   - Y=0: substrate block for every cell of every word.
//   - Y=1: ON block where the bit is 1, air where the bit is 0.
//   - Bit order along +X: LSB first by default; MSB first if msbFirst=true.
//
// Width  (X) = wordBits
// Height (Y) = 2
// Depth  (Z) = wordCount * (1 + zSpacing) - zSpacing  (no trailing gap)
//
// Words are read out of the bytes LSB-aligned: byte order is file order, bit 0 of a
// byte is the lowest-order bit of the word. For wordBits != 8 we pack across byte
// boundaries (still LSB-first) so a 4-bit ROM = two words per source byte.

import { BlockGrid } from '../viewer/blockgrid.js';

export const DEFAULT_OPTIONS = Object.freeze({
  wordBits: 8,
  msbFirst: false,
  zSpacing: 0,
  substrateBlock: 'minecraft:stone',
  onBlock: 'minecraft:redstone_block',
});

export const MAX_ADDRESSES = 4096;
export const MAX_INPUT_BYTES = 16 * 1024 * 1024;

export function bytesToWords(bytes, wordBits) {
  if (wordBits < 1 || wordBits > 32) {
    throw new Error('Word size must be between 1 and 32 bits.');
  }
  const totalBits = bytes.length * 8;
  const wordCount = Math.ceil(totalBits / wordBits);
  const words = new Uint32Array(wordCount);

  for (let w = 0; w < wordCount; w++) {
    let value = 0;
    for (let b = 0; b < wordBits; b++) {
      const bitIndex = w * wordBits + b;
      const byteIndex = bitIndex >>> 3;
      if (byteIndex >= bytes.length) break;
      const bitInByte = bitIndex & 7;
      const bit = (bytes[byteIndex] >>> bitInByte) & 1;
      if (bit) value |= (1 << b);
    }
    words[w] = value;
  }

  return words;
}

export function buildRom(bytes, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!(bytes instanceof Uint8Array)) {
    throw new Error('buildRom: input must be a Uint8Array.');
  }
  if (bytes.length === 0) {
    throw new Error('Input is empty. Drop a file with at least 1 byte.');
  }
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new Error(`Input too large: ${bytes.length.toLocaleString()} bytes (max ${MAX_INPUT_BYTES.toLocaleString()}).`);
  }

  const { wordBits, msbFirst, zSpacing, substrateBlock, onBlock } = opts;
  if (![1, 2, 4, 8, 16, 24, 32].includes(wordBits)) {
    throw new Error('Word size must be 1, 2, 4, 8, 16, 24, or 32 bits.');
  }
  if (zSpacing < 0 || zSpacing > 8) {
    throw new Error('Row spacing must be between 0 and 8.');
  }

  const words = bytesToWords(bytes, wordBits);
  if (words.length > MAX_ADDRESSES) {
    throw new Error(
      `Cartridge would have ${words.length.toLocaleString()} addresses (max ${MAX_ADDRESSES.toLocaleString()}). ` +
      `Increase word size, or shrink the input.`,
    );
  }

  const W = wordBits;
  const H = 2;
  const step = 1 + zSpacing;
  const D = Math.max(1, words.length * step - zSpacing);

  const grid = new BlockGrid(W, H, D);

  for (let w = 0; w < words.length; w++) {
    const z = w * step;
    const value = words[w];
    for (let b = 0; b < wordBits; b++) {
      const x = msbFirst ? (wordBits - 1 - b) : b;
      grid.set(x, 0, z, substrateBlock);
      const bitSet = ((value >>> b) & 1) === 1;
      if (bitSet) grid.set(x, 1, z, onBlock);
    }
  }

  return {
    grid,
    stats: {
      inputBytes: bytes.length,
      wordCount: words.length,
      wordBits,
      totalBits: words.length * wordBits,
      filledBits: countSetBits(words, wordBits),
      width: W,
      height: H,
      depth: D,
      volume: W * H * D,
    },
  };
}

function countSetBits(words, wordBits) {
  let total = 0;
  const mask = wordBits === 32 ? 0xFFFFFFFF : ((1 << wordBits) - 1);
  for (let i = 0; i < words.length; i++) {
    let v = words[i] & mask;
    while (v) {
      v &= (v - 1);
      total++;
    }
  }
  return total;
}
