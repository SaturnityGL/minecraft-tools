import test from 'node:test';
import assert from 'node:assert/strict';
import { footprint, applyBrush } from '../../assets/js/skins/paint.js';
import { createDoc } from '../../assets/js/skins/doc.js';
import { faceAt, faceRect, mirrorOf } from '../../assets/js/skins/skinmap.js';

function makeCtx(overrides = {}) {
  const doc = createDoc();
  const state = { mirror: false, lock: 'off', lockColor: null, ...overrides };
  return { doc, state };
}

function hitAt(x, y, model = 'classic') {
  return { x, y, face: faceAt(x, y, model) };
}

function inRect(p, r) {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

test('footprint sizes in the middle of a face', () => {
  const hit = hitAt(11, 11);
  assert.deepEqual(footprint(hit, 1, 'classic'), [{ x: 11, y: 11 }]);
  const two = footprint(hit, 2, 'classic');
  assert.equal(two.length, 4);
  assert.ok(two.some(p => p.x === 11 && p.y === 11));
  assert.ok(two.some(p => p.x === 12 && p.y === 12));
  const three = footprint(hit, 3, 'classic');
  assert.equal(three.length, 9);
  assert.ok(three.some(p => p.x === 10 && p.y === 10));
  assert.ok(three.some(p => p.x === 12 && p.y === 12));
});

test('size 3 footprint at every face corner stays inside the face rect', () => {
  for (const model of ['classic', 'slim']) {
    for (const [part, layer, face] of [['head', 'body', 'front'], ['rightArm', 'outer', 'back'], ['leftLeg', 'body', 'top']]) {
      const r = faceRect(part, layer, face, model);
      const corners = [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]];
      for (const [cx, cy] of corners) {
        for (const size of [1, 2, 3]) {
          const fp = footprint(hitAt(cx, cy, model), size, model);
          assert.ok(fp.length >= 1);
          for (const p of fp) assert.ok(inRect(p, r), `${model} ${part} ${size} ${p.x},${p.y}`);
        }
      }
    }
  }
});

test('size 2 at the bottom right corner clips to one pixel', () => {
  const r = faceRect('head', 'body', 'front', 'classic');
  const fp = footprint(hitAt(r.x + r.w - 1, r.y + r.h - 1), 2, 'classic');
  assert.deepEqual(fp, [{ x: r.x + r.w - 1, y: r.y + r.h - 1 }]);
});

test('applyBrush writes the footprint', () => {
  const ctx = makeCtx();
  ctx.doc.beginStroke();
  applyBrush({ ...ctx, state: { ...ctx.state, brushSize: 1 } }, hitAt(10, 10), () => [1, 2, 3, 255]);
  ctx.doc.endStroke();
  assert.deepEqual(ctx.doc.getPixel(10, 10), [1, 2, 3, 255]);
});

test('mirror writes the mirrorOf pixel', () => {
  const ctx = makeCtx({ mirror: true });
  const m = mirrorOf(10, 10, 'classic');
  ctx.doc.beginStroke();
  applyBrush(ctx, hitAt(10, 10), () => [9, 8, 7, 255]);
  ctx.doc.endStroke();
  assert.deepEqual(ctx.doc.getPixel(10, 10), [9, 8, 7, 255]);
  assert.deepEqual(ctx.doc.getPixel(m.x, m.y), [9, 8, 7, 255]);
});

test('mirror off writes only the hit pixel', () => {
  const ctx = makeCtx();
  const m = mirrorOf(10, 10, 'classic');
  ctx.doc.beginStroke();
  applyBrush(ctx, hitAt(10, 10), () => [9, 8, 7, 255]);
  ctx.doc.endStroke();
  assert.deepEqual(ctx.doc.getPixel(m.x, m.y), [0, 0, 0, 0]);
});

test('lock pixels skips alpha 0', () => {
  const ctx = makeCtx({ lock: 'pixels' });
  ctx.doc.beginStroke();
  ctx.doc.setPixel(10, 10, [50, 50, 50, 255]);
  ctx.doc.endStroke();
  ctx.doc.beginStroke();
  applyBrush(ctx, hitAt(10, 10), () => [1, 1, 1, 255]);
  applyBrush(ctx, hitAt(11, 10), () => [1, 1, 1, 255]);
  ctx.doc.endStroke();
  assert.deepEqual(ctx.doc.getPixel(10, 10), [1, 1, 1, 255]);
  assert.deepEqual(ctx.doc.getPixel(11, 10), [0, 0, 0, 0]);
});

test('lock color skips non-matching', () => {
  const ctx = makeCtx({ lock: 'color', lockColor: [50, 50, 50, 255] });
  ctx.doc.beginStroke();
  ctx.doc.setPixel(10, 10, [50, 50, 50, 255]);
  ctx.doc.setPixel(11, 10, [60, 60, 60, 255]);
  ctx.doc.endStroke();
  ctx.doc.beginStroke();
  applyBrush(ctx, hitAt(10, 10), () => [1, 1, 1, 255]);
  applyBrush(ctx, hitAt(11, 10), () => [1, 1, 1, 255]);
  ctx.doc.endStroke();
  assert.deepEqual(ctx.doc.getPixel(10, 10), [1, 1, 1, 255]);
  assert.deepEqual(ctx.doc.getPixel(11, 10), [60, 60, 60, 255]);
});

test('a pixel is written once per stroke even when hit twice', () => {
  const ctx = makeCtx();
  let calls = 0;
  ctx.doc.beginStroke();
  const fn = () => { calls++; return [calls, 0, 0, 255]; };
  applyBrush(ctx, hitAt(10, 10), fn);
  applyBrush(ctx, hitAt(10, 10), fn);
  ctx.doc.endStroke();
  assert.equal(calls, 1);
  assert.deepEqual(ctx.doc.getPixel(10, 10), [1, 0, 0, 255]);
});

test('brush fn receives x, y and the current pixel', () => {
  const ctx = makeCtx();
  ctx.doc.beginStroke();
  ctx.doc.setPixel(10, 10, [5, 6, 7, 255]);
  ctx.doc.endStroke();
  let seen = null;
  ctx.doc.beginStroke();
  applyBrush(ctx, hitAt(10, 10), (x, y, cur) => { seen = [x, y, cur]; return cur; });
  ctx.doc.endStroke();
  assert.deepEqual(seen, [10, 10, [5, 6, 7, 255]]);
});

test('size 3 brush through applyBrush does not write outside the face', () => {
  const ctx = makeCtx();
  ctx.state.brushSize = 3;
  const r = faceRect('head', 'body', 'front', 'classic');
  ctx.doc.beginStroke();
  applyBrush(ctx, hitAt(r.x, r.y), () => [255, 0, 0, 255]);
  ctx.doc.endStroke();
  let written = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (ctx.doc.getPixel(x, y)[3] === 255) {
      written++;
      assert.ok(inRect({ x, y }, r), `${x},${y}`);
    }
  }
  assert.ok(written >= 1);
});
