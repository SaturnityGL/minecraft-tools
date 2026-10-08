import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc, HISTORY_LIMIT } from '../../assets/js/skins/doc.js';

test('new doc defaults', () => {
  const doc = createDoc();
  assert.equal(doc.pixels.length, 16384);
  assert.ok(doc.pixels instanceof Uint8ClampedArray);
  assert.equal(doc.model, 'classic');
  assert.equal(doc.name, 'Untitled');
  assert.ok(doc.id);
  assert.equal(doc.inStroke, false);
  assert.equal(doc.canUndo, false);
  assert.equal(doc.canRedo, false);
});

test('stroke then undo restores bytes, redo reapplies', () => {
  const doc = createDoc();
  const before = doc.pixels.slice();
  doc.beginStroke();
  doc.setPixel(3, 4, [10, 20, 30, 255]);
  doc.setPixel(5, 6, [1, 2, 3, 4]);
  assert.equal(doc.endStroke(), true);
  const after = doc.pixels.slice();
  assert.deepEqual(doc.getPixel(3, 4), [10, 20, 30, 255]);
  assert.equal(doc.undo(), true);
  assert.deepEqual(doc.pixels, before);
  assert.equal(doc.redo(), true);
  assert.deepEqual(doc.pixels, after);
  assert.equal(doc.undo(), true);
  assert.equal(doc.undo(), false);
});

test('new stroke clears redo', () => {
  const doc = createDoc();
  doc.beginStroke();
  doc.setPixel(0, 0, [9, 9, 9, 255]);
  doc.endStroke();
  doc.undo();
  assert.equal(doc.canRedo, true);
  doc.beginStroke();
  doc.setPixel(1, 1, [8, 8, 8, 255]);
  doc.endStroke();
  assert.equal(doc.canRedo, false);
  assert.equal(doc.redo(), false);
});

test('empty stroke adds no history', () => {
  const doc = createDoc();
  doc.beginStroke();
  assert.equal(doc.endStroke(), false);
  assert.equal(doc.canUndo, false);
  doc.beginStroke();
  doc.setPixel(2, 2, [0, 0, 0, 0]);
  assert.equal(doc.endStroke(), false);
  assert.equal(doc.canUndo, false);
});

test('history is capped at 200', () => {
  assert.equal(HISTORY_LIMIT, 200);
  const doc = createDoc();
  for (let i = 0; i < 201; i++) {
    doc.beginStroke();
    doc.setPixel(i % 64, Math.floor(i / 64), [i + 1, 0, 0, 255]);
    doc.endStroke();
  }
  let count = 0;
  while (doc.undo()) count++;
  assert.equal(count, 200);
});

test('setPixel outside a stroke throws', () => {
  const doc = createDoc();
  assert.throws(() => doc.setPixel(0, 0, [1, 2, 3, 4]));
});

test('touched only for pixels written in current stroke', () => {
  const doc = createDoc();
  doc.beginStroke();
  assert.equal(doc.touched(1, 1), false);
  doc.setPixel(1, 1, [5, 5, 5, 255]);
  assert.equal(doc.touched(1, 1), true);
  assert.equal(doc.touched(2, 1), false);
  doc.endStroke();
  assert.equal(doc.touched(1, 1), false);
  doc.beginStroke();
  assert.equal(doc.touched(1, 1), false);
  doc.endStroke();
});

test('a pixel written twice records first before and last after', () => {
  const doc = createDoc();
  doc.beginStroke();
  doc.setPixel(7, 7, [1, 1, 1, 255]);
  doc.setPixel(7, 7, [2, 2, 2, 255]);
  doc.endStroke();
  assert.deepEqual(doc.getPixel(7, 7), [2, 2, 2, 255]);
  doc.undo();
  assert.deepEqual(doc.getPixel(7, 7), [0, 0, 0, 0]);
  doc.redo();
  assert.deepEqual(doc.getPixel(7, 7), [2, 2, 2, 255]);
});

test('replaceAll with model change is undone including the model', () => {
  const doc = createDoc();
  const next = new Uint8ClampedArray(16384);
  next[0] = 200;
  next[3] = 255;
  doc.replaceAll(next, { model: 'slim' });
  assert.equal(doc.model, 'slim');
  assert.deepEqual(doc.getPixel(0, 0), [200, 0, 0, 255]);
  doc.undo();
  assert.equal(doc.model, 'classic');
  assert.deepEqual(doc.getPixel(0, 0), [0, 0, 0, 0]);
  doc.redo();
  assert.equal(doc.model, 'slim');
  assert.deepEqual(doc.getPixel(0, 0), [200, 0, 0, 255]);
});

test('replaceAll with only a model change is one undo step', () => {
  const doc = createDoc();
  doc.replaceAll(doc.pixels.slice(), { model: 'slim' });
  assert.equal(doc.model, 'slim');
  assert.equal(doc.canUndo, true);
  doc.undo();
  assert.equal(doc.model, 'classic');
  assert.equal(doc.canUndo, false);
});

test('version increases on write', () => {
  const doc = createDoc();
  const v0 = doc.version;
  doc.beginStroke();
  doc.setPixel(0, 0, [1, 2, 3, 255]);
  const v1 = doc.version;
  assert.ok(v1 > v0);
  doc.endStroke();
  doc.undo();
  const v2 = doc.version;
  assert.ok(v2 > v1);
  doc.redo();
  assert.ok(doc.version > v2);
});

test('change fires once per stroke, undo, redo, replaceAll', () => {
  const doc = createDoc();
  let n = 0;
  const off = doc.on('change', () => { n++; });
  doc.beginStroke();
  doc.setPixel(0, 0, [1, 2, 3, 255]);
  doc.setPixel(1, 0, [1, 2, 3, 255]);
  assert.equal(n, 0);
  doc.endStroke();
  assert.equal(n, 1);
  doc.beginStroke();
  doc.endStroke();
  assert.equal(n, 1);
  doc.undo();
  assert.equal(n, 2);
  doc.redo();
  assert.equal(n, 3);
  doc.replaceAll(new Uint8ClampedArray(16384));
  assert.equal(n, 4);
  off();
  doc.undo();
  assert.equal(n, 4);
});

test('undo during a stroke ends it first', () => {
  const doc = createDoc();
  doc.beginStroke();
  doc.setPixel(0, 0, [1, 2, 3, 255]);
  assert.equal(doc.inStroke, true);
  assert.equal(doc.undo(), true);
  assert.equal(doc.inStroke, false);
  assert.deepEqual(doc.getPixel(0, 0), [0, 0, 0, 0]);
});

test('createDoc copies provided pixels and options', () => {
  const src = new Uint8ClampedArray(16384);
  src[0] = 77;
  const doc = createDoc({ pixels: src, model: 'slim', name: 'Steve', id: 'abc' });
  assert.equal(doc.pixels[0], 77);
  assert.notEqual(doc.pixels, src);
  assert.equal(doc.model, 'slim');
  assert.equal(doc.name, 'Steve');
  assert.equal(doc.id, 'abc');
});

test('load replaces everything and clears history', () => {
  const doc = createDoc({ name: 'One', id: 'a' });
  doc.beginStroke();
  doc.setPixel(0, 0, [1, 2, 3, 255]);
  doc.endStroke();
  let n = 0;
  doc.on('change', () => n++);
  const next = new Uint8ClampedArray(16384);
  next[4] = 9;
  const before = doc.version;
  doc.load(next, { model: 'slim', name: 'Two', id: 'b' });
  assert.equal(n, 1);
  assert.equal(doc.canUndo, false);
  assert.equal(doc.canRedo, false);
  assert.equal(doc.model, 'slim');
  assert.equal(doc.name, 'Two');
  assert.equal(doc.id, 'b');
  assert.equal(doc.pixels[4], 9);
  assert.deepEqual(doc.getPixel(0, 0), [0, 0, 0, 0]);
  assert.ok(doc.version > before);
  assert.throws(() => doc.load(new Uint8ClampedArray(8)), RangeError);
});
