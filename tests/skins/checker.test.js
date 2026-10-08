import test from 'node:test';
import assert from 'node:assert/strict';
import { check, fixTransparent, clearStray } from '../../assets/js/skins/checker.js';
import { faceRect, faceAt, faces } from '../../assets/js/skins/skinmap.js';

function blank() {
  return new Uint8ClampedArray(64 * 64 * 4);
}

function put(pixels, x, y, rgba) {
  pixels.set(rgba, (y * 64 + x) * 4);
}

function get(pixels, x, y) {
  return Array.from(pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
}

function fillBody(pixels, model, rgba) {
  for (const f of faces(model)) {
    if (f.layer !== 'body') continue;
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) put(pixels, x, y, rgba);
    }
  }
}

test('a fully opaque body is clean', () => {
  const px = blank();
  fillBody(px, 'classic', [10, 20, 30, 255]);
  const report = check(px, 'classic');
  assert.deepEqual(report.transparentBody, []);
  assert.deepEqual(report.strayPixels, []);
});

test('check flags non-opaque body pixels, not outer ones', () => {
  const px = blank();
  fillBody(px, 'classic', [10, 20, 30, 255]);
  const body = faceRect('head', 'body', 'front', 'classic');
  const outer = faceRect('head', 'outer', 'front', 'classic');
  put(px, body.x, body.y, [10, 20, 30, 200]);
  put(px, body.x + 1, body.y, [0, 0, 0, 0]);
  put(px, outer.x, outer.y, [5, 5, 5, 100]);
  const report = check(px, 'classic');
  assert.deepEqual(report.transparentBody, [{ x: body.x, y: body.y }, { x: body.x + 1, y: body.y }]);
});

test('check flags paint outside every face', () => {
  const px = blank();
  fillBody(px, 'classic', [10, 20, 30, 255]);
  assert.equal(faceAt(0, 0, 'classic'), null);
  put(px, 0, 0, [1, 2, 3, 255]);
  put(px, 1, 0, [1, 2, 3, 0]);
  assert.deepEqual(check(px, 'classic').strayPixels, [{ x: 0, y: 0 }]);
});

test('fixTransparent copies the nearest opaque pixel in the same face', () => {
  const px = blank();
  fillBody(px, 'classic', [10, 20, 30, 255]);
  const f = faceRect('head', 'body', 'front', 'classic');
  put(px, f.x + 3, f.y + 3, [200, 100, 50, 255]);
  put(px, f.x + 4, f.y + 3, [0, 0, 0, 0]);
  put(px, f.x + 2, f.y + 3, [7, 7, 7, 100]);
  const { pixels, remaining } = fixTransparent(px, 'classic');
  assert.deepEqual(remaining, []);
  assert.equal(get(pixels, f.x + 4, f.y + 3)[3], 255);
  assert.equal(get(pixels, f.x + 2, f.y + 3)[3], 255);
  assert.deepEqual(check(pixels, 'classic').transparentBody, []);
  assert.deepEqual(get(px, f.x + 4, f.y + 3), [0, 0, 0, 0]);
});

test('fixTransparent picks the closest pixel', () => {
  const px = blank();
  const f = faceRect('torso', 'body', 'front', 'classic');
  put(px, f.x, f.y, [255, 0, 0, 255]);
  put(px, f.x + 7, f.y, [0, 0, 255, 255]);
  const { pixels } = fixTransparent(px, 'classic');
  assert.deepEqual(get(pixels, f.x + 1, f.y), [255, 0, 0, 255]);
  assert.deepEqual(get(pixels, f.x + 6, f.y), [0, 0, 255, 255]);
});

test('fixTransparent falls back to the same part when the face has no opaque pixel', () => {
  const px = blank();
  const top = faceRect('head', 'body', 'top', 'classic');
  const front = faceRect('head', 'body', 'front', 'classic');
  put(px, front.x, front.y, [9, 8, 7, 255]);
  const { pixels, remaining } = fixTransparent(px, 'classic');
  assert.deepEqual(get(pixels, top.x, top.y), [9, 8, 7, 255]);
  const emptyPart = faceRect('leftLeg', 'body', 'front', 'classic');
  assert.deepEqual(get(pixels, emptyPart.x, emptyPart.y), [0, 0, 0, 0]);
  assert.ok(remaining.some(p => p.x === emptyPart.x && p.y === emptyPart.y));
});

test('clearStray zeroes only pixels outside every face', () => {
  const px = blank();
  const f = faceRect('head', 'body', 'front', 'classic');
  put(px, f.x, f.y, [1, 2, 3, 255]);
  put(px, 0, 0, [9, 9, 9, 255]);
  put(px, 1, 0, [9, 9, 9, 0]);
  const out = clearStray(px, 'classic');
  assert.deepEqual(get(out, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(get(out, 1, 0), [0, 0, 0, 0]);
  assert.deepEqual(get(out, f.x, f.y), [1, 2, 3, 255]);
  assert.deepEqual(get(px, 0, 0), [9, 9, 9, 255]);
  assert.deepEqual(check(out, 'classic').strayPixels, []);
});

test('slim model treats the slim arm gap as stray', () => {
  const px = blank();
  const classicBack = faceRect('rightArm', 'body', 'back', 'classic');
  const slimBack = faceRect('rightArm', 'body', 'back', 'slim');
  assert.ok(classicBack.w > slimBack.w);
  const gapX = slimBack.x + slimBack.w;
  put(px, gapX, slimBack.y, [4, 4, 4, 255]);
  assert.deepEqual(check(px, 'slim').strayPixels, [{ x: gapX, y: slimBack.y }]);
  assert.deepEqual(get(clearStray(px, 'slim'), gapX, slimBack.y), [0, 0, 0, 0]);
});
