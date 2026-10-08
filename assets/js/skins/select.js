import { SIZE } from './skinmap.js';

export const clipboard = { piece: null };

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

function readRect(doc, rect) {
  const pixels = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      if (!inBounds(rect.x + x, rect.y + y)) continue;
      pixels.set(doc.getPixel(rect.x + x, rect.y + y), (y * rect.w + x) * 4);
    }
  }
  return pixels;
}

function clearRect(doc, rect) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (inBounds(x, y)) doc.setPixel(x, y, [0, 0, 0, 0]);
    }
  }
}

function oneStroke(doc, work) {
  if (doc.inStroke) doc.endStroke();
  doc.beginStroke();
  work();
  return doc.endStroke();
}

export function createSelection() {
  let rect = null;
  let floating = null;
  let lifted = null;

  const api = {
    get rect() { return rect ? { ...rect } : null; },
    get floating() { return floating; },
    get lifted() { return lifted ? { ...lifted } : null; },
    set(next) {
      const x = Math.min(next.x, next.x + next.w);
      const y = Math.min(next.y, next.y + next.h);
      rect = { x, y, w: Math.abs(next.w), h: Math.abs(next.h) };
    },
    clear() {
      rect = null;
    },
    copy(doc) {
      if (!rect || rect.w < 1 || rect.h < 1) return false;
      clipboard.piece = { w: rect.w, h: rect.h, pixels: readRect(doc, rect) };
      return true;
    },
    cut(doc) {
      if (!api.copy(doc)) return false;
      const target = { ...rect };
      return oneStroke(doc, () => clearRect(doc, target));
    },
    erase(doc) {
      if (!rect) return false;
      const target = { ...rect };
      return oneStroke(doc, () => clearRect(doc, target));
    },
    paste() {
      const piece = clipboard.piece;
      if (!piece) return null;
      lifted = null;
      floating = {
        x: rect ? rect.x : 0,
        y: rect ? rect.y : 0,
        w: piece.w,
        h: piece.h,
        pixels: new Uint8ClampedArray(piece.pixels)
      };
      return floating;
    },
    lift(doc) {
      if (!rect || rect.w < 1 || rect.h < 1) return null;
      lifted = { ...rect };
      floating = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, pixels: readRect(doc, rect) };
      return floating;
    },
    move(dx, dy) {
      if (!floating) return;
      floating.x += dx;
      floating.y += dy;
    },
    flipH() {
      if (!floating) return;
      const { w, h, pixels } = floating;
      const out = new Uint8ClampedArray(pixels.length);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          out.set(pixels.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (y * w + (w - 1 - x)) * 4);
        }
      }
      floating.pixels = out;
    },
    flipV() {
      if (!floating) return;
      const { w, h, pixels } = floating;
      const out = new Uint8ClampedArray(pixels.length);
      for (let y = 0; y < h; y++) {
        out.set(pixels.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
      }
      floating.pixels = out;
    },
    commit(doc) {
      if (!floating) return false;
      const piece = floating;
      const origin = lifted;
      floating = null;
      lifted = null;
      return oneStroke(doc, () => {
        if (origin) clearRect(doc, origin);
        for (let y = 0; y < piece.h; y++) {
          for (let x = 0; x < piece.w; x++) {
            const o = (y * piece.w + x) * 4;
            if (piece.pixels[o + 3] === 0) continue;
            const tx = piece.x + x;
            const ty = piece.y + y;
            if (!inBounds(tx, ty)) continue;
            doc.setPixel(tx, ty, [piece.pixels[o], piece.pixels[o + 1], piece.pixels[o + 2], piece.pixels[o + 3]]);
          }
        }
      });
    },
    cancel() {
      floating = null;
      lifted = null;
    }
  };
  return api;
}
