import { SIZE, faceAt } from './skinmap.js';
import { applyBrush } from './paint.js';
import { autotoneColor } from './tools.js';
import { rgbToOklab, oklabToRgb, oklabToOklch, oklchToOklab } from './color.js';

const SHADE_STEP = 0.045;
const HUE_SHIFT_DEGREES = 6;
const COOL_HUE = 265;
const WARM_HUE = 85;
const NEIGHBOR_OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function blendPixel(rgba, neighbors, strength) {
  const usable = neighbors.filter(n => n[3] > 0);
  const t = clamp01(strength / 100);
  if (usable.length === 0 || t === 0) return [rgba[0], rgba[1], rgba[2], rgba[3]];
  const labs = usable.map(n => rgbToOklab(n));
  const mean = [0, 1, 2].map(i => labs.reduce((sum, lab) => sum + lab[i], 0) / labs.length);
  const own = rgbToOklab(rgba);
  const mixed = oklabToRgb([0, 1, 2].map(i => own[i] + (mean[i] - own[i]) * t));
  return [mixed[0], mixed[1], mixed[2], rgba[3]];
}

function hueToward(h, target, maxStep) {
  const diff = ((target - h + 540) % 360) - 180;
  const step = Math.max(-maxStep, Math.min(maxStep, diff));
  return (h + step + 360) % 360;
}

export function shadeColor(rgb, dir, hueShift) {
  const lighten = dir === 'lighten';
  const [L, C, h] = oklabToOklch(rgbToOklab(rgb));
  const nextL = clamp01(L + (lighten ? SHADE_STEP : -SHADE_STEP));
  if (!hueShift) return oklabToRgb(oklchToOklab([nextL, C, h]));
  const nextH = hueToward(h, lighten ? WARM_HUE : COOL_HUE, HUE_SHIFT_DEGREES);
  const nextC = lighten ? C : C * 1.04;
  return oklabToRgb(oklchToOklab([nextL, nextC, nextH]));
}

const snapshots = new WeakMap();

function neighborsOf(snapshot, x, y, model) {
  const face = faceAt(x, y, model);
  if (!face) return [];
  const out = [];
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < face.x || nx >= face.x + face.w || ny < face.y || ny >= face.y + face.h) continue;
    const o = (ny * SIZE + nx) * 4;
    out.push([snapshot[o], snapshot[o + 1], snapshot[o + 2], snapshot[o + 3]]);
  }
  return out;
}

function blendStamp(ctx, hit) {
  const { doc, state } = ctx;
  const snapshot = snapshots.get(doc) || doc.pixels.slice();
  const strength = state.blend ? state.blend.strength : 50;
  applyBrush(ctx, hit, (x, y, current) => {
    if (current[3] === 0) return null;
    return blendPixel(current, neighborsOf(snapshot, x, y, doc.model), strength);
  });
}

function blendBegin(ctx, hit) {
  snapshots.set(ctx.doc, ctx.doc.pixels.slice());
  blendStamp(ctx, hit);
}

function blendEnd(ctx) {
  snapshots.delete(ctx.doc);
}

function shadeStamp(ctx, hit) {
  const { state } = ctx;
  const dir = state.shade ? state.shade.dir : 'darken';
  const hueShift = state.shade ? Boolean(state.shade.hueShift) : false;
  applyBrush(ctx, hit, (x, y, current) => {
    if (current[3] === 0) return null;
    const rgb = shadeColor(current, dir, hueShift);
    return [rgb[0], rgb[1], rgb[2], current[3]];
  });
}

function retoneStamp(ctx, hit) {
  const { autotone } = ctx.state;
  applyBrush(ctx, hit, (x, y, current) => {
    if (current[3] === 0) return null;
    const rgb = autotoneColor(current, autotone.strength, autotone.mode, Math.random);
    return [rgb[0], rgb[1], rgb[2], current[3]];
  });
}

export const BRUSH_TOOLS = {
  blend: { id: 'blend', label: 'Blend', begin: blendBegin, move: blendStamp, end: blendEnd },
  shade: { id: 'shade', label: 'Shade', begin: shadeStamp, move: shadeStamp, end() {} },
  retone: { id: 'retone', label: 'Re-tone', begin: retoneStamp, move: retoneStamp, end() {} }
};
