import { SIZE, FACES, LAYERS, faceRect, partRegion, mirrorOf } from './skinmap.js';

const LENGTH = SIZE * SIZE * 4;
const ARMS = ['rightArm', 'leftArm'];
const OUTER_COLUMN = {
  rightArm: { front: 'first', back: 'last', top: 'first', bottom: 'first' },
  leftArm: { front: 'last', back: 'first', top: 'last', bottom: 'last' }
};

export function detectModel(pixels) {
  const back = faceRect('rightArm', 'body', 'back', 'classic');
  for (let y = back.y; y < back.y + back.h; y++) {
    for (let x = back.x + back.w - 2; x < back.x + back.w; x++) {
      if (pixels[(y * SIZE + x) * 4 + 3] !== 0) return 'classic';
    }
  }
  return 'slim';
}

export function upgradeLegacy(pixels32) {
  const out = new Uint8ClampedArray(LENGTH);
  out.set(pixels32.subarray ? pixels32.subarray(0, LENGTH / 2) : pixels32.slice(0, LENGTH / 2));
  for (const part of ['rightArm', 'rightLeg']) {
    for (const f of partRegion(part, 'body', 'classic')) {
      for (let y = f.y; y < f.y + f.h; y++) {
        for (let x = f.x; x < f.x + f.w; x++) {
          const m = mirrorOf(x, y, 'classic');
          const s = (y * SIZE + x) * 4;
          const d = (m.y * SIZE + m.x) * 4;
          out[d] = out[s];
          out[d + 1] = out[s + 1];
          out[d + 2] = out[s + 2];
          out[d + 3] = out[s + 3];
        }
      }
    }
  }
  return out;
}

function sourceColumn(side, fromW, toW, j) {
  if (!side) return j;
  if (toW < fromW) return side === 'first' ? j + 1 : j;
  return side === 'first' ? Math.max(j - 1, 0) : Math.min(j, fromW - 1);
}

export function armSourceColumn(part, face, fromW, toW, j) {
  if (fromW === toW) return j;
  return sourceColumn(OUTER_COLUMN[part] ? OUTER_COLUMN[part][face] : undefined, fromW, toW, j);
}

export function convertModel(pixels, from, to) {
  const out = new Uint8ClampedArray(pixels);
  if (from === to) return out;
  for (const part of ARMS) {
    for (const layer of LAYERS) {
      for (const f of partRegion(part, layer, from)) {
        for (let y = f.y; y < f.y + f.h; y++) {
          for (let x = f.x; x < f.x + f.w; x++) out.fill(0, (y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4);
        }
      }
    }
  }
  for (const part of ARMS) {
    for (const layer of LAYERS) {
      for (const face of FACES) {
        const src = faceRect(part, layer, face, from);
        const dst = faceRect(part, layer, face, to);
        const side = OUTER_COLUMN[part][face];
        for (let fy = 0; fy < dst.h; fy++) {
          for (let fx = 0; fx < dst.w; fx++) {
            const sfx = sourceColumn(side, src.w, dst.w, fx);
            const s = ((src.y + fy) * SIZE + src.x + sfx) * 4;
            const d = ((dst.y + fy) * SIZE + dst.x + fx) * 4;
            out[d] = pixels[s];
            out[d + 1] = pixels[s + 1];
            out[d + 2] = pixels[s + 2];
            out[d + 3] = pixels[s + 3];
          }
        }
      }
    }
  }
  return out;
}
