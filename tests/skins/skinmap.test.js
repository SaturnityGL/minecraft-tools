import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, PARTS, LAYERS, FACES,
  partBox, partOrigin, faceRect, faces, faceAt, mirrorOf, partRegion, mirrorPart
} from '../../assets/js/skins/skinmap.js';

const MODELS = ['classic', 'slim'];

test('constants', () => {
  assert.equal(SIZE, 64);
  assert.equal(PARTS.length, 6);
  assert.deepEqual(LAYERS, ['body', 'outer']);
  assert.equal(FACES.length, 6);
});

test('head front rect', () => {
  const r = faceRect('head', 'body', 'front', 'classic');
  assert.deepEqual({ x: r.x, y: r.y, w: r.w, h: r.h }, { x: 8, y: 8, w: 8, h: 8 });
});

test('leftArm outer front classic', () => {
  const r = faceRect('leftArm', 'outer', 'front', 'classic');
  assert.deepEqual({ x: r.x, y: r.y, w: r.w, h: r.h }, { x: 52, y: 52, w: 4, h: 12 });
});

test('rightArm slim back', () => {
  const r = faceRect('rightArm', 'body', 'back', 'slim');
  assert.deepEqual({ x: r.x, y: r.y, w: r.w, h: r.h }, { x: 51, y: 20, w: 3, h: 12 });
});

test('partBox and partOrigin', () => {
  assert.deepEqual(partBox('rightArm', 'classic'), { w: 4, h: 12, d: 4 });
  assert.deepEqual(partBox('leftArm', 'slim'), { w: 3, h: 12, d: 4 });
  assert.deepEqual(partBox('head', 'slim'), { w: 8, h: 8, d: 8 });
  assert.deepEqual(partOrigin('leftArm', 'body'), { u: 32, v: 48 });
  assert.deepEqual(partOrigin('leftLeg', 'outer'), { u: 0, v: 48 });
});

for (const model of MODELS) {
  test(`no face overlap (${model})`, () => {
    const seen = new Uint8Array(SIZE * SIZE);
    for (const f of faces(model)) {
      for (let y = f.y; y < f.y + f.h; y++) {
        for (let x = f.x; x < f.x + f.w; x++) {
          assert.ok(x >= 0 && x < SIZE && y >= 0 && y < SIZE);
          assert.equal(seen[y * SIZE + x], 0, `overlap at ${x},${y}`);
          seen[y * SIZE + x] = 1;
        }
      }
    }
  });

  test(`total face area (${model})`, () => {
    let expected = 0;
    for (const part of PARTS) {
      const { w, h, d } = partBox(part, model);
      expected += 2 * (w * h + w * d + h * d) * 2;
    }
    let actual = 0;
    for (const f of faces(model)) actual += f.w * f.h;
    assert.equal(actual, expected);
    assert.equal(faces(model).length, 72);
  });

  test(`mirrorOf round trip (${model})`, () => {
    let mapped = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const hit = faceAt(x, y, model);
        const m = mirrorOf(x, y, model);
        if (!hit) {
          assert.equal(m, null);
          continue;
        }
        mapped++;
        assert.ok(m);
        const back = mirrorOf(m.x, m.y, model);
        assert.deepEqual(back, { x, y });
        const target = faceAt(m.x, m.y, model);
        assert.equal(target.part, mirrorPart(hit.part));
        assert.equal(target.layer, hit.layer);
      }
    }
    assert.ok(mapped > 0);
  });

  test(`faceAt agrees with faces (${model})`, () => {
    for (const f of faces(model)) {
      const hit = faceAt(f.x + f.w - 1, f.y + f.h - 1, model);
      assert.equal(hit.part, f.part);
      assert.equal(hit.layer, f.layer);
      assert.equal(hit.face, f.face);
      assert.equal(hit.fx, f.w - 1);
      assert.equal(hit.fy, f.h - 1);
      assert.equal(hit.w, f.w);
      assert.equal(hit.h, f.h);
    }
  });
}

test('faceAt unused corner is null', () => {
  assert.equal(faceAt(0, 0, 'classic'), null);
  assert.equal(faceAt(-1, 5, 'classic'), null);
  assert.equal(faceAt(64, 5, 'classic'), null);
});

test('faceAt local coordinates', () => {
  const hit = faceAt(10, 9, 'classic');
  assert.equal(hit.part, 'head');
  assert.equal(hit.layer, 'body');
  assert.equal(hit.face, 'front');
  assert.equal(hit.fx, 2);
  assert.equal(hit.fy, 1);
});

test('mirrorOf known pixels', () => {
  assert.deepEqual(mirrorOf(8, 8, 'classic'), { x: 15, y: 8 });
  assert.deepEqual(mirrorOf(44, 20, 'classic'), { x: 39, y: 52 });
});

test('mirrorOf swaps right and left faces', () => {
  const r = faceRect('rightArm', 'body', 'right', 'classic');
  const m = mirrorOf(r.x, r.y, 'classic');
  const hit = faceAt(m.x, m.y, 'classic');
  assert.equal(hit.part, 'leftArm');
  assert.equal(hit.face, 'left');
  assert.equal(hit.fx, 3);
  assert.equal(hit.fy, 0);
});

test('mirrorPart', () => {
  assert.equal(mirrorPart('rightArm'), 'leftArm');
  assert.equal(mirrorPart('leftArm'), 'rightArm');
  assert.equal(mirrorPart('rightLeg'), 'leftLeg');
  assert.equal(mirrorPart('leftLeg'), 'rightLeg');
  assert.equal(mirrorPart('head'), 'head');
  assert.equal(mirrorPart('torso'), 'torso');
});

test('partRegion', () => {
  const region = partRegion('torso', 'outer', 'classic');
  assert.equal(region.length, 6);
  assert.deepEqual(region.map(r => r.face), FACES);
  const front = region.find(r => r.face === 'front');
  assert.deepEqual(front, { face: 'front', x: 20, y: 36, w: 8, h: 12 });
});
