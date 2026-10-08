import { SIZE } from './skinmap.js';
import { rgbToOklab, oklabToRgb } from './color.js';

const MAX_DISTANCE = 0.5;

function regionMask(region) {
  const mask = new Uint8Array(SIZE * SIZE);
  if (!region) return mask.fill(1);
  for (const r of region) {
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(SIZE, r.x + r.w);
    const y1 = Math.min(SIZE, r.y + r.h);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) mask[y * SIZE + x] = 1;
    }
  }
  return mask;
}

export function recolor(pixels, { source, target, tolerance = 0, region = null }) {
  const out = new Uint8ClampedArray(pixels);
  const mask = regionMask(region);
  const limit = (Math.max(0, Math.min(100, tolerance)) / 100) * MAX_DISTANCE;
  const sourceLab = rgbToOklab(source);
  const offset = rgbToOklab(target).map((v, i) => v - sourceLab[i]);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const o = i * 4;
    if (!mask[i] || pixels[o + 3] === 0) continue;
    const rgb = [pixels[o], pixels[o + 1], pixels[o + 2]];
    if (rgb[0] === source[0] && rgb[1] === source[1] && rgb[2] === source[2]) {
      out[o] = target[0];
      out[o + 1] = target[1];
      out[o + 2] = target[2];
      continue;
    }
    const lab = rgbToOklab(rgb);
    const d = Math.hypot(lab[0] - sourceLab[0], lab[1] - sourceLab[1], lab[2] - sourceLab[2]);
    if (d > limit) continue;
    const next = oklabToRgb([lab[0] + offset[0], lab[1] + offset[1], lab[2] + offset[2]]);
    out[o] = next[0];
    out[o + 1] = next[1];
    out[o + 2] = next[2];
  }
  return out;
}

export function paletteFromSkin(pixels, limit = 64) {
  const counts = new Map();
  for (let o = 0; o < pixels.length; o += 4) {
    if (pixels[o + 3] !== 255) continue;
    const key = (pixels[o] << 16) | (pixels[o + 1] << 8) | pixels[o + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => [(key >> 16) & 255, (key >> 8) & 255, key & 255]);
}
