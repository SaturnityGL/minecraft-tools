import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, autotoneColor } from '../../assets/js/skins/tools.js';
import { createDoc } from '../../assets/js/skins/doc.js';
import { faceAt, faceRect, mirrorOf } from '../../assets/js/skins/skinmap.js';

function makeCtx(overrides = {}) {
  const doc = createDoc();
  const state = {
    color: [158, 35, 200, 255], brushSize: 1, mirror: false, lock: 'off', lockColor: null,
    autotone: { strength: 35, mode: 'light' }, ...overrides
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

test('registry', () => {
  assert.deepEqual(Object.keys(TOOLS).sort(), ['autotone', 'bucket', 'eraser', 'eyedropper', 'pencil']);
  for (const [id, tool] of Object.entries(TOOLS)) {
    assert.equal(tool.id, id);
    assert.equal(typeof tool.label, 'string');
    for (const fn of ['begin', 'move', 'end']) assert.equal(typeof tool[fn], 'function');
  }
});

test('pencil writes state.color', () => {
  const ctx = makeCtx();
  stroke(ctx, TOOLS.pencil, [[10, 10], [11, 10]]);
  assert.deepEqual(ctx.doc.getPixel(10, 10), [158, 35, 200, 255]);
  assert.deepEqual(ctx.doc.getPixel(11, 10), [158, 35, 200, 255]);
});

test('tools leave stroke ownership to the caller', () => {
  const ctx = makeCtx();
  ctx.doc.beginStroke();
  TOOLS.pencil.begin(ctx, hitAt(10, 10));
  TOOLS.pencil.end(ctx);
  assert.equal(ctx.doc.inStroke, true);
  ctx.doc.endStroke();
});

test('eraser writes transparent', () => {
  const ctx = makeCtx();
  stroke(ctx, TOOLS.pencil, [[10, 10]]);
  stroke(ctx, TOOLS.eraser, [[10, 10]]);
  assert.deepEqual(ctx.doc.getPixel(10, 10), [0, 0, 0, 0]);
});

test('autotone writes opaque color near the active color', () => {
  const ctx = makeCtx({ autotone: { strength: 0, mode: 'light' } });
  stroke(ctx, TOOLS.autotone, [[10, 10]]);
  assert.deepEqual(ctx.doc.getPixel(10, 10), [158, 35, 200, 255]);
  const ctx2 = makeCtx({ autotone: { strength: 100, mode: 'hue' } });
  stroke(ctx2, TOOLS.autotone, [[10, 10], [11, 10], [12, 10]]);
  for (const x of [10, 11, 12]) assert.equal(ctx2.doc.getPixel(x, 10)[3], 255);
});

test('eyedropper picks opaque pixels only', () => {
  const ctx = makeCtx();
  ctx.doc.beginStroke();
  ctx.doc.setPixel(10, 10, [1, 2, 3, 200]);
  ctx.doc.endStroke();
  const before = ctx.state.color.slice();
  ctx.doc.beginStroke();
  TOOLS.eyedropper.begin(ctx, hitAt(11, 10));
  ctx.doc.endStroke();
  assert.deepEqual(ctx.state.color, before);
  ctx.doc.beginStroke();
  TOOLS.eyedropper.begin(ctx, hitAt(10, 10));
  ctx.doc.endStroke();
  assert.deepEqual(ctx.state.color, [1, 2, 3, 200]);
  assert.equal(ctx.doc.canUndo, true);
  ctx.doc.undo();
  assert.equal(ctx.doc.canUndo, false);
});

test('bucket fills only the contiguous same-color area inside the face', () => {
  const ctx = makeCtx({ color: [255, 0, 0, 255] });
  const r = faceRect('head', 'body', 'front', 'classic');
  ctx.doc.beginStroke();
  for (let x = r.x; x < r.x + r.w; x++) ctx.doc.setPixel(x, r.y + 3, [0, 0, 255, 255]);
  ctx.doc.endStroke();
  stroke(ctx, TOOLS.bucket, [[r.x, r.y]]);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const p = ctx.doc.getPixel(x, y);
      if (y < r.y + 3) assert.deepEqual(p, [255, 0, 0, 255], `${x},${y}`);
      else if (y === r.y + 3) assert.deepEqual(p, [0, 0, 255, 255], `${x},${y}`);
      else assert.deepEqual(p, [0, 0, 0, 0], `${x},${y}`);
    }
  }
  const top = faceRect('head', 'body', 'top', 'classic');
  assert.deepEqual(ctx.doc.getPixel(top.x, top.y), [0, 0, 0, 0]);
});

test('bucket does not spill into the neighboring face', () => {
  const ctx = makeCtx({ color: [255, 0, 0, 255] });
  const r = faceRect('head', 'body', 'front', 'classic');
  stroke(ctx, TOOLS.bucket, [[r.x + 2, r.y + 2]]);
  let count = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (ctx.doc.getPixel(x, y)[3] === 255) {
      count++;
      assert.ok(x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    }
  }
  assert.equal(count, r.w * r.h);
});

test('bucket respects pixel lock', () => {
  const ctx = makeCtx({ color: [255, 0, 0, 255], lock: 'pixels' });
  const r = faceRect('head', 'body', 'front', 'classic');
  stroke(ctx, TOOLS.bucket, [[r.x, r.y]]);
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    assert.deepEqual(ctx.doc.getPixel(x, y), [0, 0, 0, 0]);
  }
});

test('bucket respects color lock', () => {
  const ctx = makeCtx({ color: [255, 0, 0, 255], lock: 'color', lockColor: [9, 9, 9, 255] });
  const r = faceRect('head', 'body', 'front', 'classic');
  stroke(ctx, TOOLS.bucket, [[r.x, r.y]]);
  assert.deepEqual(ctx.doc.getPixel(r.x, r.y), [0, 0, 0, 0]);
});

test('bucket with mirror also fills the mirrored face', () => {
  const ctx = makeCtx({ color: [255, 0, 0, 255], mirror: true });
  const r = faceRect('rightArm', 'body', 'front', 'classic');
  const m = mirrorOf(r.x, r.y, 'classic');
  const mr = faceRect('leftArm', 'body', 'front', 'classic');
  stroke(ctx, TOOLS.bucket, [[r.x, r.y]]);
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    assert.deepEqual(ctx.doc.getPixel(x, y), [255, 0, 0, 255]);
  }
  for (let y = mr.y; y < mr.y + mr.h; y++) for (let x = mr.x; x < mr.x + mr.w; x++) {
    assert.deepEqual(ctx.doc.getPixel(x, y), [255, 0, 0, 255]);
  }
  assert.deepEqual(ctx.doc.getPixel(m.x, m.y), [255, 0, 0, 255]);
});

test('bucket with mirror inside the same face fills the face', () => {
  const ctx = makeCtx({ color: [255, 0, 0, 255], mirror: true });
  const r = faceRect('head', 'body', 'front', 'classic');
  stroke(ctx, TOOLS.bucket, [[r.x, r.y]]);
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    assert.deepEqual(ctx.doc.getPixel(x, y), [255, 0, 0, 255]);
  }
});

test('bucket is one undo step', () => {
  const ctx = makeCtx({ color: [255, 0, 0, 255] });
  const r = faceRect('head', 'body', 'front', 'classic');
  stroke(ctx, TOOLS.bucket, [[r.x, r.y]]);
  ctx.doc.undo();
  assert.deepEqual(ctx.doc.getPixel(r.x, r.y), [0, 0, 0, 0]);
  assert.equal(ctx.doc.canUndo, false);
});

test('autotoneColor strength 0 returns the input', () => {
  assert.deepEqual(autotoneColor([158, 35, 200], 0, 'light', () => 0.9), [158, 35, 200]);
  assert.deepEqual(autotoneColor([158, 35, 200], 0, 'hue', () => 0.1), [158, 35, 200]);
});

test('autotoneColor strength 100 stays in gamut and differs', () => {
  for (const mode of ['light', 'hue']) {
    for (const r of [0, 0.25, 0.75, 1]) {
      for (const input of [[158, 35, 200], [250, 250, 250], [5, 5, 5], [255, 0, 0]]) {
        const out = autotoneColor(input, 100, mode, () => r);
        assert.equal(out.length, 3);
        for (const c of out) assert.ok(Number.isInteger(c) && c >= 0 && c <= 255);
      }
    }
    const up = autotoneColor([158, 35, 200], 100, mode, () => 1);
    const down = autotoneColor([158, 35, 200], 100, mode, () => 0);
    assert.notDeepEqual(up, [158, 35, 200]);
    assert.notDeepEqual(down, [158, 35, 200]);
    assert.notDeepEqual(up, down);
  }
});

test('autotoneColor light mode moves lightness in the right direction', () => {
  const up = autotoneColor([128, 128, 128], 100, 'light', () => 1);
  const down = autotoneColor([128, 128, 128], 100, 'light', () => 0);
  assert.ok(up[0] > 128);
  assert.ok(down[0] < 128);
});

function paintAt(doc, points, rgba) {
  doc.beginStroke();
  for (const [x, y] of points) doc.setPixel(x, y, rgba);
  doc.endStroke();
}

test('bucket scope part fills every matching pixel in the hit part and layer, connected or not', () => {
  const ctx = makeCtx({ bucketScope: 'part', color: [1, 2, 3, 255] });
  const front = faceRect('head', 'body', 'front', 'classic');
  const back = faceRect('head', 'body', 'back', 'classic');
  const other = faceRect('torso', 'body', 'front', 'classic');
  const outer = faceRect('head', 'outer', 'front', 'classic');
  paintAt(ctx.doc, [[front.x + 3, front.y + 3]], [9, 9, 9, 255]);
  stroke(ctx, TOOLS.bucket, [[front.x, front.y]]);
  assert.deepEqual(ctx.doc.getPixel(front.x, front.y), [1, 2, 3, 255]);
  assert.deepEqual(ctx.doc.getPixel(back.x, back.y), [1, 2, 3, 255]);
  assert.deepEqual(ctx.doc.getPixel(front.x + 3, front.y + 3), [9, 9, 9, 255]);
  assert.deepEqual(ctx.doc.getPixel(other.x, other.y), [0, 0, 0, 0]);
  assert.deepEqual(ctx.doc.getPixel(outer.x, outer.y), [0, 0, 0, 0]);
});

test('bucket scope skin fills matching pixels across every face of the hit layer only', () => {
  const ctx = makeCtx({ bucketScope: 'skin', color: [1, 2, 3, 255] });
  const front = faceRect('head', 'body', 'front', 'classic');
  const torso = faceRect('torso', 'body', 'front', 'classic');
  const outer = faceRect('torso', 'outer', 'front', 'classic');
  stroke(ctx, TOOLS.bucket, [[front.x, front.y]]);
  assert.deepEqual(ctx.doc.getPixel(torso.x, torso.y), [1, 2, 3, 255]);
  assert.deepEqual(ctx.doc.getPixel(outer.x, outer.y), [0, 0, 0, 0]);
  assert.deepEqual(ctx.doc.getPixel(0, 0), [0, 0, 0, 0]);
});

test('bucket scope part does not touch pixels of a different color and respects lock', () => {
  const ctx = makeCtx({ bucketScope: 'part', color: [1, 2, 3, 255], lock: 'pixels' });
  const front = faceRect('head', 'body', 'front', 'classic');
  paintAt(ctx.doc, [[front.x, front.y]], [9, 9, 9, 255]);
  stroke(ctx, TOOLS.bucket, [[front.x, front.y]]);
  assert.deepEqual(ctx.doc.getPixel(front.x, front.y), [1, 2, 3, 255]);
  assert.deepEqual(ctx.doc.getPixel(front.x + 1, front.y), [0, 0, 0, 0]);
});

test('bucket scope undefined behaves as face', () => {
  const ctx = makeCtx({ color: [1, 2, 3, 255] });
  const front = faceRect('head', 'body', 'front', 'classic');
  const back = faceRect('head', 'body', 'back', 'classic');
  stroke(ctx, TOOLS.bucket, [[front.x, front.y]]);
  assert.deepEqual(ctx.doc.getPixel(back.x, back.y), [0, 0, 0, 0]);
});
