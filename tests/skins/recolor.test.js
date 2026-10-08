import test from 'node:test';
import assert from 'node:assert/strict';
import { recolor, paletteFromSkin } from '../../assets/js/skins/recolor.js';
import { rgbToOklab, mixOklab } from '../../assets/js/skins/color.js';

function texture(entries) {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (const [x, y, rgba] of entries) pixels.set(rgba, (y * 64 + x) * 4);
  return pixels;
}

function at(pixels, x, y) {
  return Array.from(pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
}

test('exact source becomes exact target at tolerance 0', () => {
  const px = texture([[1, 1, [100, 50, 25, 255]], [2, 1, [101, 50, 25, 255]]]);
  const out = recolor(px, { source: [100, 50, 25], target: [10, 200, 30], tolerance: 0, region: null });
  assert.deepEqual(at(out, 1, 1), [10, 200, 30, 255]);
  assert.deepEqual(at(out, 2, 1), [101, 50, 25, 255]);
});

test('input array is not modified', () => {
  const px = texture([[1, 1, [100, 50, 25, 255]]]);
  const copy = px.slice();
  recolor(px, { source: [100, 50, 25], target: [0, 0, 0], tolerance: 50, region: null });
  assert.deepEqual(Array.from(px), Array.from(copy));
});

test('a darker shade keeps its lightness difference', () => {
  const source = [200, 120, 80];
  const shade = mixOklab(source, [0, 0, 0], 0.15);
  const px = texture([[3, 3, [...source, 255]], [4, 3, [...shade, 255]]]);
  const target = [60, 120, 220];
  const out = recolor(px, { source, target, tolerance: 60, region: null });
  const dBefore = rgbToOklab(source)[0] - rgbToOklab(shade)[0];
  const outShade = at(out, 4, 3).slice(0, 3);
  const dAfter = rgbToOklab(target)[0] - rgbToOklab(outShade)[0];
  assert.ok(Math.abs(dBefore - dAfter) < 0.02);
});

test('pixels beyond tolerance are untouched', () => {
  const px = texture([[1, 1, [255, 0, 0, 255]], [2, 1, [0, 0, 255, 255]]]);
  const out = recolor(px, { source: [255, 0, 0], target: [0, 255, 0], tolerance: 10, region: null });
  assert.deepEqual(at(out, 1, 1), [0, 255, 0, 255]);
  assert.deepEqual(at(out, 2, 1), [0, 0, 255, 255]);
});

test('tolerance 100 reaches an OKLab distance of 0.5', () => {
  const source = [255, 0, 0];
  const near = [250, 10, 10];
  const far = [0, 0, 255];
  const px = texture([[1, 1, [...near, 255]], [2, 1, [...far, 255]]]);
  const out = recolor(px, { source, target: [0, 255, 0], tolerance: 100, region: null });
  assert.notDeepEqual(at(out, 1, 1), [...near, 255]);
  assert.deepEqual(at(out, 2, 1), [...far, 255]);
});

test('alpha is preserved and transparent pixels are skipped', () => {
  const px = texture([[1, 1, [100, 50, 25, 90]], [2, 1, [100, 50, 25, 0]]]);
  const out = recolor(px, { source: [100, 50, 25], target: [10, 20, 30], tolerance: 0, region: null });
  assert.deepEqual(at(out, 1, 1), [10, 20, 30, 90]);
  assert.deepEqual(at(out, 2, 1), [100, 50, 25, 0]);
});

test('region limits the change and clips to the texture', () => {
  const px = texture([[1, 1, [100, 50, 25, 255]], [30, 30, [100, 50, 25, 255]]]);
  const out = recolor(px, {
    source: [100, 50, 25],
    target: [1, 2, 3],
    tolerance: 0,
    region: [{ x: 0, y: 0, w: 4, h: 4 }, { x: 60, y: 60, w: 20, h: 20 }]
  });
  assert.deepEqual(at(out, 1, 1), [1, 2, 3, 255]);
  assert.deepEqual(at(out, 30, 30), [100, 50, 25, 255]);
});

test('paletteFromSkin lists distinct opaque colors by descending count with a cap', () => {
  const px = texture([
    [0, 0, [1, 1, 1, 255]], [1, 0, [2, 2, 2, 255]], [2, 0, [2, 2, 2, 255]],
    [3, 0, [3, 3, 3, 255]], [4, 0, [3, 3, 3, 255]], [5, 0, [3, 3, 3, 255]],
    [6, 0, [9, 9, 9, 100]]
  ]);
  assert.deepEqual(paletteFromSkin(px), [[3, 3, 3], [2, 2, 2], [1, 1, 1]]);
  assert.deepEqual(paletteFromSkin(px, 2), [[3, 3, 3], [2, 2, 2]]);
  assert.deepEqual(paletteFromSkin(new Uint8ClampedArray(64 * 64 * 4)), []);
});
