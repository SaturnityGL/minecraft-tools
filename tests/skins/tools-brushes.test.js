import test from 'node:test';
import assert from 'node:assert/strict';
import { BRUSH_TOOLS, blendPixel, shadeColor } from '../../assets/js/skins/tools-brushes.js';
import { createDoc } from '../../assets/js/skins/doc.js';
import { faceAt, faceRect } from '../../assets/js/skins/skinmap.js';
import { rgbToOklab, oklabToOklch } from '../../assets/js/skins/color.js';

const rgbToOklch = rgb => oklabToOklch(rgbToOklab(rgb));

function makeCtx(overrides = {}) {
  const doc = createDoc();
  const state = {
    color: [158, 35, 200, 255], brushSize: 1, mirror: false, lock: 'off', lockColor: null,
    autotone: { strength: 35, mode: 'light' },
    blend: { strength: 50 },
    shade: { dir: 'darken', hueShift: false },
    ...overrides
  };
  return { doc, state };
}

function hitAt(x, y, model = 'classic') {
  return { x, y, face: faceAt(x, y, model) };
}

function stroke(ctx, tool, points) {
  ctx.doc.beginStroke();
  tool.begin(ctx, hitAt(points[0][0], points[0][1], ctx.doc.model));
  for (const p of points.slice(1)) tool.move(ctx, hitAt(p[0], p[1], ctx.doc.model));
  tool.end(ctx);
  ctx.doc.endStroke();
}

function fill(doc, pixels) {
  doc.beginStroke();
  for (const [x, y, rgba] of pixels) doc.setPixel(x, y, rgba);
  doc.endStroke();
}

test('registry ids and shape', () => {
  assert.deepEqual(Object.keys(BRUSH_TOOLS).sort(), ['blend', 'retone', 'shade']);
  for (const [id, tool] of Object.entries(BRUSH_TOOLS)) {
    assert.equal(tool.id, id);
    for (const fn of ['begin', 'move', 'end']) assert.equal(typeof tool[fn], 'function');
  }
});

test('blendPixel at strength 0 or with no neighbors keeps the pixel', () => {
  assert.deepEqual(blendPixel([10, 20, 30, 255], [[200, 0, 0, 255]], 0), [10, 20, 30, 255]);
  assert.deepEqual(blendPixel([10, 20, 30, 255], [], 100), [10, 20, 30, 255]);
  assert.deepEqual(blendPixel([10, 20, 30, 255], [[200, 0, 0, 0]], 100), [10, 20, 30, 255]);
});

test('blendPixel at 100 takes the neighbor mean and keeps alpha', () => {
  const out = blendPixel([0, 0, 0, 128], [[200, 100, 50, 255], [200, 100, 50, 255]], 100);
  assert.deepEqual(out.slice(0, 3), [200, 100, 50]);
  assert.equal(out[3], 128);
});

test('blendPixel at 50 lies between pixel and neighbors in OKLab lightness', () => {
  const out = blendPixel([0, 0, 0, 255], [[255, 255, 255, 255]], 50);
  const L = rgbToOklab(out)[0];
  assert.ok(L > 0.2 && L < 0.8);
});

test('shadeColor darken lowers L and lighten raises it', () => {
  const base = [120, 90, 60];
  assert.ok(rgbToOklab(shadeColor(base, 'darken', false))[0] < rgbToOklab(base)[0]);
  assert.ok(rgbToOklab(shadeColor(base, 'lighten', false))[0] > rgbToOklab(base)[0]);
});

test('shadeColor hue shift moves hue toward 265 when darkening and 85 when lightening', () => {
  const base = [200, 80, 80];
  const h0 = rgbToOklch(base)[2];
  const hd = rgbToOklch(shadeColor(base, 'darken', true))[2];
  const hl = rgbToOklch(shadeColor(base, 'lighten', true))[2];
  const gap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  assert.ok(gap(hd, 265) < gap(h0, 265));
  assert.ok(gap(hl, 85) < gap(h0, 85));
});

test('blend reads neighbors from the stroke-begin snapshot', () => {
  const ctx = makeCtx({ blend: { strength: 100 } });
  const r = faceRect('head', 'body', 'front', 'classic');
  const [a, b, c] = [[r.x, r.y], [r.x + 1, r.y], [r.x + 2, r.y]];
  fill(ctx.doc, [
    [a[0], a[1], [255, 0, 0, 255]],
    [b[0], b[1], [0, 0, 255, 255]],
    [c[0], c[1], [0, 255, 0, 255]]
  ]);
  stroke(ctx, BRUSH_TOOLS.blend, [b, c]);
  const afterB = ctx.doc.getPixel(b[0], b[1]);
  const afterC = ctx.doc.getPixel(c[0], c[1]);
  assert.notDeepEqual(afterB, [0, 0, 255, 255]);
  assert.notDeepEqual(afterC, [0, 255, 0, 255]);
  const expectedC = blendPixel([0, 255, 0, 255], [[0, 0, 255, 255]], 100);
  assert.deepEqual(afterC.slice(0, 3), expectedC.slice(0, 3));
});

test('blend skips transparent pixels and stays inside the face', () => {
  const ctx = makeCtx({ blend: { strength: 100 } });
  const r = faceRect('head', 'body', 'front', 'classic');
  fill(ctx.doc, [[r.x + 1, r.y, [200, 0, 0, 255]]]);
  stroke(ctx, BRUSH_TOOLS.blend, [[r.x, r.y]]);
  assert.deepEqual(ctx.doc.getPixel(r.x, r.y), [0, 0, 0, 0]);
  const edge = faceRect('head', 'body', 'right', 'classic');
  fill(ctx.doc, [[edge.x + edge.w - 1, edge.y, [10, 10, 10, 255]], [r.x, r.y + 3, [250, 250, 250, 255]]]);
  stroke(ctx, BRUSH_TOOLS.blend, [[edge.x + edge.w - 1, edge.y]]);
  assert.deepEqual(ctx.doc.getPixel(edge.x + edge.w - 1, edge.y), [10, 10, 10, 255]);
});

test('shade preserves alpha, skips alpha 0, writes once per stroke', () => {
  const ctx = makeCtx({ shade: { dir: 'darken', hueShift: false } });
  const r = faceRect('head', 'body', 'front', 'classic');
  fill(ctx.doc, [[r.x, r.y, [120, 90, 60, 100]]]);
  stroke(ctx, BRUSH_TOOLS.shade, [[r.x, r.y], [r.x, r.y], [r.x + 1, r.y]]);
  const once = ctx.doc.getPixel(r.x, r.y);
  assert.equal(once[3], 100);
  assert.deepEqual(once.slice(0, 3), shadeColor([120, 90, 60], 'darken', false));
  assert.deepEqual(ctx.doc.getPixel(r.x + 1, r.y), [0, 0, 0, 0]);
});

test('retone changes lightness within the autotone range and preserves alpha', () => {
  const ctx = makeCtx({ autotone: { strength: 100, mode: 'light' } });
  const r = faceRect('head', 'body', 'front', 'classic');
  fill(ctx.doc, [[r.x, r.y, [120, 90, 60, 200]], [r.x + 1, r.y, [0, 0, 0, 0]]]);
  stroke(ctx, BRUSH_TOOLS.retone, [[r.x, r.y], [r.x + 1, r.y]]);
  const out = ctx.doc.getPixel(r.x, r.y);
  assert.equal(out[3], 200);
  assert.ok(Math.abs(rgbToOklab(out)[0] - rgbToOklab([120, 90, 60])[0]) <= 0.13);
  assert.deepEqual(ctx.doc.getPixel(r.x + 1, r.y), [0, 0, 0, 0]);
});

test('brushes respect lock and brush size', () => {
  const ctx = makeCtx({ brushSize: 2, lock: 'pixels' });
  const r = faceRect('head', 'body', 'front', 'classic');
  fill(ctx.doc, [[r.x, r.y, [120, 90, 60, 255]], [r.x + 1, r.y, [120, 90, 60, 255]]]);
  stroke(ctx, BRUSH_TOOLS.shade, [[r.x, r.y]]);
  assert.notDeepEqual(ctx.doc.getPixel(r.x, r.y), [120, 90, 60, 255]);
  assert.notDeepEqual(ctx.doc.getPixel(r.x + 1, r.y), [120, 90, 60, 255]);
  assert.deepEqual(ctx.doc.getPixel(r.x, r.y + 1), [0, 0, 0, 0]);
});
