import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, rgbToOklab, oklabToRgb,
  oklabToOklch, oklchToOklab, mixOklab, distance
} from '../../assets/js/skins/color.js';

test('hex round trip', () => {
  assert.deepEqual(hexToRgb('#9e23c8'), [158, 35, 200]);
  assert.equal(rgbToHex([158, 35, 200]), '#9e23c8');
  assert.deepEqual(hexToRgb('9E23C8'), [158, 35, 200]);
  assert.deepEqual(hexToRgb('#fa0'), [255, 170, 0]);
  assert.deepEqual(hexToRgb('fa0'), [255, 170, 0]);
  assert.equal(rgbToHex(hexToRgb('#010203')), '#010203');
});

test('invalid hex returns null', () => {
  for (const bad of ['', '#', '#12', '#12345', '#1234567', 'zzzzzz', '#ggg', null, undefined, 42]) {
    assert.equal(hexToRgb(bad), null);
  }
});

test('hsv round trip on sample colors', () => {
  const samples = [
    [0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0],
    [0, 0, 255], [158, 35, 200], [12, 200, 90], [128, 128, 128]
  ];
  for (const rgb of samples) {
    assert.deepEqual(hsvToRgb(rgbToHsv(rgb)), rgb);
  }
  const [h, s, v] = rgbToHsv([255, 0, 0]);
  assert.equal(h, 0);
  assert.equal(s, 1);
  assert.equal(v, 1);
});

test('oklab round trip within 1 per channel', () => {
  const steps = [0, 64, 128, 192, 255];
  for (const r of steps) for (const g of steps) for (const b of steps) {
    const back = oklabToRgb(rgbToOklab([r, g, b]));
    assert.ok(Math.abs(back[0] - r) <= 1, `r ${r},${g},${b}`);
    assert.ok(Math.abs(back[1] - g) <= 1, `g ${r},${g},${b}`);
    assert.ok(Math.abs(back[2] - b) <= 1, `b ${r},${g},${b}`);
  }
});

test('oklab known values', () => {
  const white = rgbToOklab([255, 255, 255]);
  assert.ok(Math.abs(white[0] - 1) < 0.001);
  assert.ok(Math.abs(white[1]) < 0.001);
  const black = rgbToOklab([0, 0, 0]);
  assert.ok(Math.abs(black[0]) < 0.001);
});

test('oklabToRgb clamps', () => {
  const rgb = oklabToRgb([1.5, 0.4, 0.4]);
  for (const c of rgb) assert.ok(c >= 0 && c <= 255 && Number.isInteger(c));
});

test('oklch round trip', () => {
  const lab = rgbToOklab([200, 80, 40]);
  const back = oklchToOklab(oklabToOklch(lab));
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - lab[i]) < 1e-9);
  const [, c, h] = oklabToOklch(lab);
  assert.ok(c > 0);
  assert.ok(h >= 0 && h < 360);
});

test('mixOklab endpoints and midpoint', () => {
  const a = [200, 30, 40];
  const b = [20, 220, 90];
  assert.deepEqual(mixOklab(a, b, 0), a);
  assert.deepEqual(mixOklab(a, b, 1), b);
  const mid = mixOklab(a, b, 0.5);
  assert.equal(mid.length, 3);
  for (const c of mid) assert.ok(Number.isInteger(c));
});

test('distance', () => {
  assert.equal(distance([10, 20, 30], [10, 20, 30]), 0);
  assert.ok(distance([0, 0, 0], [255, 255, 255]) > 0.9);
  assert.ok(distance([100, 100, 100], [101, 100, 100]) < distance([100, 100, 100], [140, 100, 100]));
});
