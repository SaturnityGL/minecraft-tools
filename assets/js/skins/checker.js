import { SIZE, PARTS, faces, faceAt, partRegion } from './skinmap.js';

function alphaAt(pixels, x, y) {
  return pixels[(y * SIZE + x) * 4 + 3];
}

function bodyRects(model) {
  return faces(model).filter(f => f.layer === 'body');
}

function nearestOpaque(pixels, x, y, rects) {
  let best = null;
  let bestDist = Infinity;
  for (const r of rects) {
    for (let ry = r.y; ry < r.y + r.h; ry++) {
      for (let rx = r.x; rx < r.x + r.w; rx++) {
        if (alphaAt(pixels, rx, ry) !== 255) continue;
        const d = (rx - x) * (rx - x) + (ry - y) * (ry - y);
        if (d < bestDist) {
          bestDist = d;
          best = { x: rx, y: ry };
        }
      }
    }
  }
  return best;
}

export function check(pixels, model) {
  const transparentBody = [];
  const strayPixels = [];
  for (const f of bodyRects(model)) {
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) {
        if (alphaAt(pixels, x, y) < 255) transparentBody.push({ x, y });
      }
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (faceAt(x, y, model) === null && alphaAt(pixels, x, y) > 0) strayPixels.push({ x, y });
    }
  }
  return { transparentBody, strayPixels };
}

export function fixTransparent(pixels, model) {
  const out = new Uint8ClampedArray(pixels);
  const remaining = [];
  for (const part of PARTS) {
    const faceRects = partRegion(part, 'body', model);
    for (const rect of faceRects) {
      const sameFace = [rect];
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          if (alphaAt(pixels, x, y) === 255) continue;
          const src = nearestOpaque(pixels, x, y, sameFace) || nearestOpaque(pixels, x, y, faceRects);
          if (!src) {
            remaining.push({ x, y });
            continue;
          }
          const s = (src.y * SIZE + src.x) * 4;
          const d = (y * SIZE + x) * 4;
          out[d] = pixels[s];
          out[d + 1] = pixels[s + 1];
          out[d + 2] = pixels[s + 2];
          out[d + 3] = 255;
        }
      }
    }
  }
  return { pixels: out, remaining };
}

export function clearStray(pixels, model) {
  const out = new Uint8ClampedArray(pixels);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (faceAt(x, y, model) === null) out.fill(0, (y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4);
    }
  }
  return out;
}
