import { mirrorOf } from './skinmap.js';

export function footprint(hit, size, model) {
  const face = hit.face;
  let x0 = hit.x;
  let y0 = hit.y;
  let x1 = hit.x;
  let y1 = hit.y;
  if (size === 2) {
    x1 = hit.x + 1;
    y1 = hit.y + 1;
  } else if (size === 3) {
    x0 = hit.x - 1;
    y0 = hit.y - 1;
    x1 = hit.x + 1;
    y1 = hit.y + 1;
  }
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!face || (x >= face.x && x < face.x + face.w && y >= face.y && y < face.y + face.h)) {
        out.push({ x, y });
      }
    }
  }
  return out;
}

export function lockAllows(state, rgba) {
  if (state.lock === 'pixels') return rgba[3] > 0;
  if (state.lock === 'color' && state.lockColor) {
    for (let i = 0; i < state.lockColor.length; i++) {
      if (rgba[i] !== state.lockColor[i]) return false;
    }
  }
  return true;
}

export function applyBrush(ctx, hit, fn) {
  const { doc, state } = ctx;
  const targets = footprint(hit, state.brushSize || 1, doc.model);
  if (state.mirror) {
    const count = targets.length;
    for (let i = 0; i < count; i++) {
      const m = mirrorOf(targets[i].x, targets[i].y, doc.model);
      if (m) targets.push(m);
    }
  }
  for (const { x, y } of targets) {
    if (doc.touched(x, y)) continue;
    const current = doc.getPixel(x, y);
    if (!lockAllows(state, current)) continue;
    const next = fn(x, y, current);
    if (next) doc.setPixel(x, y, next);
  }
}
