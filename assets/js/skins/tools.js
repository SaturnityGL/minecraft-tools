import { SIZE, faceAt, faces, mirrorOf, partRegion } from './skinmap.js';
import { applyBrush, lockAllows } from './paint.js';
import { rgbToOklab, oklabToOklch, oklchToOklab, oklabToRgb } from './color.js';

export function autotoneColor(rgb, strength, mode, rand) {
  if (!(strength > 0)) return [rgb[0], rgb[1], rgb[2]];
  const k = strength / 100;
  const [L, C, h] = oklabToOklch(rgbToOklab(rgb));
  const nextL = Math.max(0, Math.min(1, L + (rand() * 2 - 1) * 0.12 * k));
  if (mode !== 'hue') return oklabToRgb(oklchToOklab([nextL, C, h]));
  const nextH = h + (rand() * 2 - 1) * 12 * k;
  const nextC = C * (1 + (rand() * 2 - 1) * 0.25 * k);
  return oklabToRgb(oklchToOklab([nextL, nextC, nextH]));
}

function sameColor(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function floodFace(doc, start, face) {
  const target = doc.getPixel(start.x, start.y);
  const seen = new Uint8Array(SIZE * SIZE);
  const stack = [[start.x, start.y]];
  const out = [];
  seen[start.y * SIZE + start.x] = 1;
  while (stack.length) {
    const [x, y] = stack.pop();
    out.push({ x, y });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < face.x || nx >= face.x + face.w || ny < face.y || ny >= face.y + face.h) continue;
      if (seen[ny * SIZE + nx]) continue;
      seen[ny * SIZE + nx] = 1;
      if (sameColor(doc.getPixel(nx, ny), target)) stack.push([nx, ny]);
    }
  }
  return out;
}

function matchingIn(doc, start, rects) {
  const target = doc.getPixel(start.x, start.y);
  const out = [];
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (sameColor(doc.getPixel(x, y), target)) out.push({ x, y });
      }
    }
  }
  return out;
}

function collectFill(doc, start, scope) {
  if (scope === 'part') return matchingIn(doc, start, partRegion(start.face.part, start.face.layer, doc.model));
  if (scope === 'skin') return matchingIn(doc, start, faces(doc.model).filter(f => f.layer === start.face.layer));
  return floodFace(doc, start, start.face);
}

function paintWith(fn) {
  return (ctx, hit) => applyBrush(ctx, hit, fn(ctx));
}

const pencilFn = ctx => () => ctx.state.color;
const eraserFn = () => () => [0, 0, 0, 0];
const autotoneFn = ctx => () => {
  const { color, autotone } = ctx.state;
  const rgb = autotoneColor([color[0], color[1], color[2]], autotone.strength, autotone.mode, Math.random);
  return [rgb[0], rgb[1], rgb[2], 255];
};

function brushTool(id, label, fn) {
  const stamp = paintWith(fn);
  return { id, label, begin: stamp, move: stamp, end() {} };
}

function pick(ctx, hit) {
  const px = ctx.doc.getPixel(hit.x, hit.y);
  if (px[3] > 0) ctx.state.color = px;
}

function bucketBegin(ctx, hit) {
  const { doc, state } = ctx;
  const starts = [{ x: hit.x, y: hit.y, face: hit.face || faceAt(hit.x, hit.y, doc.model) }];
  if (state.mirror) {
    const m = mirrorOf(hit.x, hit.y, doc.model);
    if (m) starts.push({ x: m.x, y: m.y, face: faceAt(m.x, m.y, doc.model) });
  }
  const seen = new Set();
  const targets = [];
  for (const s of starts) {
    if (!s.face) continue;
    for (const p of collectFill(doc, s, state.bucketScope)) {
      const key = p.y * SIZE + p.x;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(p);
    }
  }
  for (const { x, y } of targets) {
    if (doc.touched(x, y)) continue;
    if (!lockAllows(state, doc.getPixel(x, y))) continue;
    doc.setPixel(x, y, state.color);
  }
}

export const TOOLS = {
  pencil: brushTool('pencil', 'Pencil', pencilFn),
  eraser: brushTool('eraser', 'Eraser', eraserFn),
  autotone: brushTool('autotone', 'Auto-tone', autotoneFn),
  eyedropper: { id: 'eyedropper', label: 'Eyedropper', begin: pick, move: pick, end() {} },
  bucket: { id: 'bucket', label: 'Bucket', begin: bucketBegin, move() {}, end() {} }
};
