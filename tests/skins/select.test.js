import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelection, clipboard } from '../../assets/js/skins/select.js';
import { createDoc } from '../../assets/js/skins/doc.js';

function paint(doc, points, rgba) {
  doc.beginStroke();
  for (const [x, y] of points) doc.setPixel(x, y, rgba);
  doc.endStroke();
}

function fresh() {
  clipboard.piece = null;
  return { doc: createDoc(), sel: createSelection() };
}

test('copy then paste elsewhere reproduces pixels', () => {
  const { doc, sel } = fresh();
  paint(doc, [[2, 2], [3, 2], [2, 3]], [10, 20, 30, 255]);
  sel.set({ x: 2, y: 2, w: 2, h: 2 });
  assert.equal(sel.copy(doc), true);
  sel.set({ x: 20, y: 20, w: 1, h: 1 });
  const piece = sel.paste();
  assert.equal(piece.x, 20);
  assert.equal(piece.y, 20);
  assert.equal(sel.floating, piece);
  sel.commit(doc);
  assert.deepEqual(doc.getPixel(20, 20), [10, 20, 30, 255]);
  assert.deepEqual(doc.getPixel(21, 20), [10, 20, 30, 255]);
  assert.deepEqual(doc.getPixel(20, 21), [10, 20, 30, 255]);
  assert.deepEqual(doc.getPixel(21, 21), [0, 0, 0, 0]);
  assert.equal(sel.floating, null);
});

test('paste with no clipboard returns null', () => {
  const { sel } = fresh();
  assert.equal(sel.paste(), null);
});

test('paste without a rect starts at 0,0', () => {
  const { doc, sel } = fresh();
  paint(doc, [[5, 5]], [1, 2, 3, 255]);
  sel.set({ x: 5, y: 5, w: 1, h: 1 });
  sel.copy(doc);
  sel.clear();
  const piece = sel.paste();
  assert.equal(piece.x, 0);
  assert.equal(piece.y, 0);
});

test('flipH twice is identity and flipV mirrors rows', () => {
  const { doc, sel } = fresh();
  paint(doc, [[0, 0]], [9, 9, 9, 255]);
  paint(doc, [[1, 1]], [7, 7, 7, 255]);
  sel.set({ x: 0, y: 0, w: 2, h: 2 });
  sel.copy(doc);
  const piece = sel.paste();
  const original = Array.from(piece.pixels);
  sel.flipH();
  assert.notDeepEqual(Array.from(sel.floating.pixels), original);
  sel.flipH();
  assert.deepEqual(Array.from(sel.floating.pixels), original);
  sel.flipV();
  assert.deepEqual(Array.from(sel.floating.pixels.slice(8, 12)), [9, 9, 9, 255]);
  assert.deepEqual(Array.from(sel.floating.pixels.slice(4, 8)), [7, 7, 7, 255]);
});

test('commit clips at texture bounds and skips alpha 0', () => {
  const { doc, sel } = fresh();
  paint(doc, [[0, 0], [1, 0], [0, 1]], [5, 5, 5, 255]);
  sel.set({ x: 0, y: 0, w: 2, h: 2 });
  sel.copy(doc);
  sel.set({ x: 63, y: 63, w: 1, h: 1 });
  sel.paste();
  sel.move(0, -1);
  assert.doesNotThrow(() => sel.commit(doc));
  assert.deepEqual(doc.getPixel(63, 62), [5, 5, 5, 255]);
  assert.deepEqual(doc.getPixel(63, 63), [5, 5, 5, 255]);
});

test('commit is one undo step', () => {
  const { doc, sel } = fresh();
  paint(doc, [[0, 0], [1, 0], [0, 1], [1, 1]], [5, 5, 5, 255]);
  sel.set({ x: 0, y: 0, w: 2, h: 2 });
  sel.copy(doc);
  sel.set({ x: 10, y: 10, w: 1, h: 1 });
  sel.paste();
  sel.commit(doc);
  assert.deepEqual(doc.getPixel(11, 11), [5, 5, 5, 255]);
  doc.undo();
  assert.deepEqual(doc.getPixel(10, 10), [0, 0, 0, 0]);
  assert.deepEqual(doc.getPixel(11, 11), [0, 0, 0, 0]);
  assert.deepEqual(doc.getPixel(0, 0), [5, 5, 5, 255]);
});

test('commit ends a stroke that is already open', () => {
  const { doc, sel } = fresh();
  paint(doc, [[0, 0]], [5, 5, 5, 255]);
  sel.set({ x: 0, y: 0, w: 1, h: 1 });
  sel.copy(doc);
  sel.paste();
  sel.move(4, 4);
  doc.beginStroke();
  doc.setPixel(30, 30, [1, 1, 1, 255]);
  sel.commit(doc);
  assert.equal(doc.inStroke, false);
  assert.deepEqual(doc.getPixel(4, 4), [5, 5, 5, 255]);
  doc.undo();
  assert.deepEqual(doc.getPixel(4, 4), [0, 0, 0, 0]);
  assert.deepEqual(doc.getPixel(30, 30), [1, 1, 1, 255]);
});

test('cancel drops the floating piece and leaves the doc alone', () => {
  const { doc, sel } = fresh();
  paint(doc, [[0, 0]], [5, 5, 5, 255]);
  sel.set({ x: 0, y: 0, w: 1, h: 1 });
  sel.copy(doc);
  sel.paste();
  sel.move(3, 3);
  const version = doc.version;
  sel.cancel();
  assert.equal(sel.floating, null);
  assert.equal(doc.version, version);
  assert.equal(sel.commit(doc), false);
});

test('cut copies then clears in one stroke', () => {
  const { doc, sel } = fresh();
  paint(doc, [[4, 4], [5, 4]], [8, 8, 8, 255]);
  sel.set({ x: 4, y: 4, w: 2, h: 1 });
  assert.equal(sel.cut(doc), true);
  assert.deepEqual(doc.getPixel(4, 4), [0, 0, 0, 0]);
  assert.equal(clipboard.piece.w, 2);
  assert.deepEqual(Array.from(clipboard.piece.pixels.slice(0, 4)), [8, 8, 8, 255]);
  doc.undo();
  assert.deepEqual(doc.getPixel(4, 4), [8, 8, 8, 255]);
  assert.deepEqual(doc.getPixel(5, 4), [8, 8, 8, 255]);
});

test('lift then move then commit moves pixels in one undo step', () => {
  const { doc, sel } = fresh();
  paint(doc, [[4, 4], [5, 4]], [8, 8, 8, 255]);
  sel.set({ x: 4, y: 4, w: 2, h: 1 });
  sel.lift(doc);
  assert.deepEqual(doc.getPixel(4, 4), [8, 8, 8, 255]);
  sel.move(10, 0);
  sel.commit(doc);
  assert.deepEqual(doc.getPixel(4, 4), [0, 0, 0, 0]);
  assert.deepEqual(doc.getPixel(14, 4), [8, 8, 8, 255]);
  assert.deepEqual(doc.getPixel(15, 4), [8, 8, 8, 255]);
  doc.undo();
  assert.deepEqual(doc.getPixel(4, 4), [8, 8, 8, 255]);
  assert.deepEqual(doc.getPixel(14, 4), [0, 0, 0, 0]);
});

test('lift then cancel leaves the doc untouched', () => {
  const { doc, sel } = fresh();
  paint(doc, [[4, 4]], [8, 8, 8, 255]);
  sel.set({ x: 4, y: 4, w: 1, h: 1 });
  sel.lift(doc);
  sel.cancel();
  assert.deepEqual(doc.getPixel(4, 4), [8, 8, 8, 255]);
  assert.equal(sel.lifted, null);
});

test('set normalizes negative sizes', () => {
  const { sel } = fresh();
  sel.set({ x: 5, y: 5, w: -3, h: -2 });
  assert.deepEqual(sel.rect, { x: 2, y: 3, w: 3, h: 2 });
});
