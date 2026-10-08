import test from 'node:test';
import assert from 'node:assert/strict';
import { detectModel, upgradeLegacy, convertModel } from '../../assets/js/skins/convert.js';
import { faceRect, partRegion, FACES, LAYERS } from '../../assets/js/skins/skinmap.js';

const ARMS = ['rightArm', 'leftArm'];
const OUTER_FIRST = {
  rightArm: { front: true, back: false, top: true, bottom: true },
  leftArm: { front: false, back: true, top: false, bottom: false }
};

function fillRect(pixels, r, seed) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * 64 + x) * 4;
      pixels[i] = (x * 7 + seed) & 255;
      pixels[i + 1] = (y * 13 + seed) & 255;
      pixels[i + 2] = (x * y + seed) & 255;
      pixels[i + 3] = 255;
    }
  }
}

function classicArms() {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  let seed = 1;
  for (const part of ARMS) {
    for (const layer of LAYERS) {
      for (const f of partRegion(part, layer, 'classic')) fillRect(pixels, f, seed++);
    }
  }
  return pixels;
}

function px(pixels, x, y) {
  const i = (y * 64 + x) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
}

test('all-transparent arm columns detect slim', () => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  assert.equal(detectModel(pixels), 'slim');
});

test('any opaque pixel in the detection area is classic', () => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  pixels[(20 * 64 + 54) * 4 + 3] = 255;
  assert.equal(detectModel(pixels), 'classic');
  const other = new Uint8ClampedArray(64 * 64 * 4);
  other[(31 * 64 + 55) * 4 + 3] = 1;
  assert.equal(detectModel(other), 'classic');
});

test('detection ignores pixels outside columns 54,55 rows 20..31', () => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  pixels[(19 * 64 + 54) * 4 + 3] = 255;
  pixels[(32 * 64 + 55) * 4 + 3] = 255;
  pixels[(25 * 64 + 53) * 4 + 3] = 255;
  assert.equal(detectModel(pixels), 'slim');
});

test('classic arms detect classic, slim conversion detects slim', () => {
  const pixels = classicArms();
  assert.equal(detectModel(pixels), 'classic');
  assert.equal(detectModel(convertModel(pixels, 'classic', 'slim')), 'slim');
});

test('convertModel returns a new array and same-model copy', () => {
  const pixels = classicArms();
  const same = convertModel(pixels, 'classic', 'classic');
  assert.notEqual(same, pixels);
  assert.deepEqual(same, pixels);
  const slim = convertModel(pixels, 'classic', 'slim');
  assert.equal(slim.length, 16384 * 1);
  assert.notEqual(slim, pixels);
});

test('classic to slim to classic keeps every non-outermost column identical', () => {
  const pixels = classicArms();
  const back = convertModel(convertModel(pixels, 'classic', 'slim'), 'slim', 'classic');
  for (const part of ARMS) {
    for (const layer of LAYERS) {
      for (const face of FACES) {
        const r = faceRect(part, layer, face, 'classic');
        const outerFirst = OUTER_FIRST[part][face];
        for (let fy = 0; fy < r.h; fy++) {
          for (let fx = 0; fx < r.w; fx++) {
            const isOuter = outerFirst === undefined ? false : outerFirst ? fx === 0 : fx === r.w - 1;
            if (isOuter) continue;
            assert.deepEqual(
              px(back, r.x + fx, r.y + fy),
              px(pixels, r.x + fx, r.y + fy),
              `${part} ${layer} ${face} ${fx},${fy}`
            );
          }
        }
      }
    }
  }
});

test('slim to classic duplicates the outermost column', () => {
  const pixels = classicArms();
  const slim = convertModel(pixels, 'classic', 'slim');
  const classic = convertModel(slim, 'slim', 'classic');
  const r = faceRect('rightArm', 'body', 'front', 'classic');
  for (let fy = 0; fy < r.h; fy++) {
    assert.deepEqual(px(classic, r.x, r.y + fy), px(classic, r.x + 1, r.y + fy));
  }
  const b = faceRect('rightArm', 'body', 'back', 'classic');
  for (let fy = 0; fy < b.h; fy++) {
    assert.deepEqual(px(classic, b.x + 3, b.y + fy), px(classic, b.x + 2, b.y + fy));
  }
});

test('classic to slim drops the outermost column and shifts the rest', () => {
  const pixels = classicArms();
  const slim = convertModel(pixels, 'classic', 'slim');
  const cf = faceRect('rightArm', 'body', 'front', 'classic');
  const sf = faceRect('rightArm', 'body', 'front', 'slim');
  for (let fy = 0; fy < sf.h; fy++) {
    for (let fx = 0; fx < sf.w; fx++) {
      assert.deepEqual(px(slim, sf.x + fx, sf.y + fy), px(pixels, cf.x + fx + 1, cf.y + fy));
    }
  }
  const cb = faceRect('leftArm', 'outer', 'front', 'classic');
  const sb = faceRect('leftArm', 'outer', 'front', 'slim');
  for (let fy = 0; fy < sb.h; fy++) {
    for (let fx = 0; fx < sb.w; fx++) {
      assert.deepEqual(px(slim, sb.x + fx, sb.y + fy), px(pixels, cb.x + fx, cb.y + fy));
    }
  }
});

test('classic to slim leaves no opaque pixel outside slim faces within arm regions', () => {
  const pixels = classicArms();
  const slim = convertModel(pixels, 'classic', 'slim');
  const inSlim = new Uint8Array(64 * 64);
  for (const part of ARMS) {
    for (const layer of LAYERS) {
      for (const f of partRegion(part, layer, 'slim')) {
        for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) inSlim[y * 64 + x] = 1;
      }
    }
  }
  let checked = 0;
  for (const part of ARMS) {
    for (const layer of LAYERS) {
      for (const f of partRegion(part, layer, 'classic')) {
        for (let y = f.y; y < f.y + f.h; y++) {
          for (let x = f.x; x < f.x + f.w; x++) {
            if (inSlim[y * 64 + x]) continue;
            checked++;
            assert.equal(slim[(y * 64 + x) * 4 + 3], 0, `${x},${y}`);
          }
        }
      }
    }
  }
  assert.ok(checked > 0);
});

test('conversion leaves non-arm pixels untouched', () => {
  const pixels = classicArms();
  fillRect(pixels, { x: 8, y: 8, w: 8, h: 8 }, 99);
  fillRect(pixels, { x: 20, y: 20, w: 8, h: 12 }, 55);
  const slim = convertModel(pixels, 'classic', 'slim');
  for (const r of [{ x: 8, y: 8, w: 8, h: 8 }, { x: 20, y: 20, w: 8, h: 12 }]) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      assert.deepEqual(px(slim, x, y), px(pixels, x, y));
    }
  }
});

test('upgradeLegacy', () => {
  const legacy = new Uint8ClampedArray(64 * 32 * 4);
  for (let i = 0; i < legacy.length; i += 4) {
    legacy[i] = (i >> 2) & 255;
    legacy[i + 1] = (i >> 6) & 255;
    legacy[i + 2] = 17;
    legacy[i + 3] = 255;
  }
  const out = upgradeLegacy(legacy);
  assert.equal(out.length, 16384);
  assert.deepEqual(out.slice(0, 64 * 32 * 4), legacy);
  const rf = faceRect('rightLeg', 'body', 'front', 'classic');
  const lf = faceRect('leftLeg', 'body', 'front', 'classic');
  for (let fy = 0; fy < rf.h; fy++) {
    for (let fx = 0; fx < rf.w; fx++) {
      assert.deepEqual(px(out, lf.x + fx, lf.y + fy), px(out, rf.x + rf.w - 1 - fx, rf.y + fy));
    }
  }
  const ra = faceRect('rightArm', 'body', 'front', 'classic');
  const la = faceRect('leftArm', 'body', 'front', 'classic');
  assert.deepEqual(px(out, la.x, la.y), px(out, ra.x + ra.w - 1, ra.y));
});

test('upgradeLegacy leaves new outer regions empty except head', () => {
  const legacy = new Uint8ClampedArray(64 * 32 * 4).fill(255);
  const out = upgradeLegacy(legacy);
  for (const part of ['torso', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']) {
    for (const f of partRegion(part, 'outer', 'classic')) {
      if (f.y < 32) continue;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        assert.equal(out[(y * 64 + x) * 4 + 3], 0, `${part} ${x},${y}`);
      }
    }
  }
});
