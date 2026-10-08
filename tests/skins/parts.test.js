import test from 'node:test';
import assert from 'node:assert/strict';
import { pushToOuter, flattenToBody, extractPart, applyPart, copyLimbToOtherSide } from '../../assets/js/skins/parts.js';
import { createDoc } from '../../assets/js/skins/doc.js';
import { faceRect, mirrorOf, partRegion, faceAt } from '../../assets/js/skins/skinmap.js';

function fillRegion(doc, part, layer, rgbaFor) {
  doc.beginStroke();
  for (const f of partRegion(part, layer, doc.model)) {
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) doc.setPixel(x, y, rgbaFor(x, y, f));
    }
  }
  doc.endStroke();
}

function gradient(x, y) {
  return [(x * 3) % 256, (y * 5) % 256, (x + y) % 256, 255];
}

test('pushToOuter copies body onto outer in one undo step', () => {
  const doc = createDoc();
  fillRegion(doc, 'torso', 'body', gradient);
  assert.equal(pushToOuter(doc, 'torso'), true);
  const body = faceRect('torso', 'body', 'front', 'classic');
  const outer = faceRect('torso', 'outer', 'front', 'classic');
  assert.deepEqual(doc.getPixel(outer.x + 2, outer.y + 3), doc.getPixel(body.x + 2, body.y + 3));
  assert.deepEqual(doc.getPixel(body.x + 2, body.y + 3), gradient(body.x + 2, body.y + 3));
  doc.undo();
  assert.deepEqual(doc.getPixel(outer.x + 2, outer.y + 3), [0, 0, 0, 0]);
});

test('flattenToBody composites outer over body and clears outer', () => {
  const doc = createDoc();
  const b = faceRect('head', 'body', 'front', 'classic');
  const o = faceRect('head', 'outer', 'front', 'classic');
  doc.beginStroke();
  doc.setPixel(b.x, b.y, [100, 100, 100, 255]);
  doc.setPixel(o.x, o.y, [200, 0, 0, 255]);
  doc.setPixel(b.x + 1, b.y, [100, 100, 100, 255]);
  doc.setPixel(o.x + 1, o.y, [200, 200, 200, 128]);
  doc.setPixel(o.x + 2, o.y, [10, 20, 30, 64]);
  doc.setPixel(b.x + 3, b.y, [40, 50, 60, 255]);
  doc.endStroke();
  assert.equal(flattenToBody(doc, 'head'), true);
  assert.deepEqual(doc.getPixel(b.x, b.y), [200, 0, 0, 255]);
  assert.deepEqual(doc.getPixel(b.x + 1, b.y), [150, 150, 150, 255]);
  assert.deepEqual(doc.getPixel(b.x + 2, b.y), [10, 20, 30, 255]);
  assert.deepEqual(doc.getPixel(b.x + 3, b.y), [40, 50, 60, 255]);
  assert.deepEqual(doc.getPixel(o.x, o.y), [0, 0, 0, 0]);
  assert.deepEqual(doc.getPixel(o.x + 1, o.y), [0, 0, 0, 0]);
  doc.undo();
  assert.deepEqual(doc.getPixel(o.x, o.y), [200, 0, 0, 255]);
  assert.deepEqual(doc.getPixel(b.x, b.y), [100, 100, 100, 255]);
});

test('flatten with nothing to do reports no change', () => {
  const doc = createDoc();
  assert.equal(flattenToBody(doc, 'head'), false);
  assert.equal(doc.canUndo, false);
});

test('extract then apply to the same part is identity', () => {
  for (const model of ['classic', 'slim']) {
    const doc = createDoc({ model });
    for (const layer of ['body', 'outer']) fillRegion(doc, 'rightArm', layer, gradient);
    const before = doc.pixels.slice();
    const piece = extractPart(doc.pixels, 'rightArm', ['body', 'outer'], model);
    doc.beginStroke();
    for (const f of partRegion('rightArm', 'body', model)) doc.setPixel(f.x, f.y, [1, 2, 3, 4]);
    doc.endStroke();
    applyPart(doc, piece, 'rightArm');
    assert.deepEqual(Array.from(doc.pixels), Array.from(before));
  }
});

test('applying to the opposite side mirrors with mirrorOf', () => {
  for (const [model, part] of [['classic', 'rightArm'], ['slim', 'leftLeg'], ['classic', 'rightLeg']]) {
    const doc = createDoc({ model });
    for (const layer of ['body', 'outer']) fillRegion(doc, part, layer, gradient);
    const piece = extractPart(doc.pixels, part, ['body', 'outer'], model);
    const target = part === 'rightArm' ? 'leftArm' : part === 'leftLeg' ? 'rightLeg' : 'leftLeg';
    assert.equal(applyPart(doc, piece, target), true);
    for (const layer of ['body', 'outer']) {
      for (const f of partRegion(part, layer, model)) {
        for (let y = f.y; y < f.y + f.h; y++) {
          for (let x = f.x; x < f.x + f.w; x++) {
            const m = mirrorOf(x, y, model);
            assert.deepEqual(doc.getPixel(m.x, m.y), doc.getPixel(x, y));
          }
        }
      }
    }
  }
});

test('apply honors the layers option', () => {
  const doc = createDoc();
  fillRegion(doc, 'head', 'body', gradient);
  fillRegion(doc, 'head', 'outer', () => [9, 9, 9, 255]);
  const piece = extractPart(doc.pixels, 'head', ['body', 'outer'], 'classic');
  const other = createDoc();
  applyPart(other, piece, 'head', { layers: ['outer'] });
  const b = faceRect('head', 'body', 'front', 'classic');
  const o = faceRect('head', 'outer', 'front', 'classic');
  assert.deepEqual(other.getPixel(b.x, b.y), [0, 0, 0, 0]);
  assert.deepEqual(other.getPixel(o.x, o.y), [9, 9, 9, 255]);
});

test('applying to an unrelated part throws', () => {
  const doc = createDoc();
  const piece = extractPart(doc.pixels, 'head', ['body'], 'classic');
  assert.throws(() => applyPart(doc, piece, 'torso'), RangeError);
});

test('classic arm applied onto a slim doc fits slim faces', () => {
  const source = createDoc({ model: 'classic' });
  fillRegion(source, 'rightArm', 'body', () => [200, 100, 50, 255]);
  const piece = extractPart(source.pixels, 'rightArm', ['body'], 'classic');
  const slim = createDoc({ model: 'slim' });
  assert.equal(applyPart(slim, piece, 'rightArm'), true);
  for (const f of partRegion('rightArm', 'body', 'slim')) {
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) assert.equal(slim.getPixel(x, y)[3], 255);
    }
  }
  const classicBack = faceRect('rightArm', 'body', 'back', 'classic');
  const slimBack = faceRect('rightArm', 'body', 'back', 'slim');
  assert.equal(slimBack.w, 3);
  assert.equal(classicBack.w, 4);
});

test('slim arm applied onto a classic doc duplicates the outer column', () => {
  const source = createDoc({ model: 'slim' });
  fillRegion(source, 'rightArm', 'body', (x, y) => [x, y, 7, 255]);
  const piece = extractPart(source.pixels, 'rightArm', ['body'], 'slim');
  const classic = createDoc({ model: 'classic' });
  applyPart(classic, piece, 'rightArm');
  const slimFront = faceRect('rightArm', 'body', 'front', 'slim');
  const front = faceRect('rightArm', 'body', 'front', 'classic');
  assert.deepEqual(classic.getPixel(front.x, front.y), source.getPixel(slimFront.x, slimFront.y));
  assert.deepEqual(classic.getPixel(front.x + 1, front.y), source.getPixel(slimFront.x, slimFront.y));
  assert.deepEqual(classic.getPixel(front.x + 3, front.y), source.getPixel(slimFront.x + 2, slimFront.y));
});

test('copyLimbToOtherSide mirrors both layers in one stroke', () => {
  const doc = createDoc();
  for (const layer of ['body', 'outer']) fillRegion(doc, 'leftLeg', layer, gradient);
  assert.equal(copyLimbToOtherSide(doc, 'leftLeg'), true);
  const src = faceRect('leftLeg', 'outer', 'front', 'classic');
  const m = mirrorOf(src.x, src.y, 'classic');
  assert.equal(faceAt(m.x, m.y, 'classic').part, 'rightLeg');
  assert.deepEqual(doc.getPixel(m.x, m.y), doc.getPixel(src.x, src.y));
  doc.undo();
  assert.deepEqual(doc.getPixel(m.x, m.y), [0, 0, 0, 0]);
  assert.equal(copyLimbToOtherSide(doc, 'head'), false);
});
