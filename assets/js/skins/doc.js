import { SIZE } from './skinmap.js';

export const HISTORY_LIMIT = 200;

const LENGTH = SIZE * SIZE * 4;

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function sameBytes(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function createDoc({ pixels, model = 'classic', name = 'Untitled', id } = {}) {
  if (pixels && pixels.length !== LENGTH) throw new RangeError(`pixels must have ${LENGTH} bytes`);
  const buffer = pixels ? new Uint8ClampedArray(pixels) : new Uint8ClampedArray(LENGTH);
  const listeners = new Set();
  const undoStack = [];
  const redoStack = [];
  let current = null;

  const doc = {
    pixels: buffer,
    model,
    name,
    id: id || makeId(),
    version: 0,
    get inStroke() { return current !== null; },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; }
  };

  function emit() {
    for (const fn of [...listeners]) fn(doc);
  }

  function offset(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
      throw new RangeError(`pixel out of range: ${x},${y}`);
    }
    return (y * SIZE + x) * 4;
  }

  function pushHistory(entry) {
    undoStack.push(entry);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function applyEntry(entry, key) {
    for (const c of entry.changes) doc.pixels.set(c[key], c.i);
    if (entry.model) doc.model = entry.model[key];
    doc.version++;
  }

  doc.getPixel = (x, y) => {
    const o = offset(x, y);
    return [doc.pixels[o], doc.pixels[o + 1], doc.pixels[o + 2], doc.pixels[o + 3]];
  };

  doc.beginStroke = () => {
    if (current) doc.endStroke();
    current = new Map();
  };

  doc.setPixel = (x, y, rgba) => {
    if (!current) throw new Error('setPixel called outside a stroke');
    const o = offset(x, y);
    let rec = current.get(o);
    if (!rec) {
      rec = { i: o, before: doc.pixels.slice(o, o + 4), after: null };
      current.set(o, rec);
    }
    doc.pixels[o] = rgba[0];
    doc.pixels[o + 1] = rgba[1];
    doc.pixels[o + 2] = rgba[2];
    doc.pixels[o + 3] = rgba[3];
    rec.after = doc.pixels.slice(o, o + 4);
    doc.version++;
  };

  doc.touched = (x, y) => current !== null && current.has(offset(x, y));

  doc.endStroke = () => {
    if (!current) return false;
    const changes = [];
    for (const rec of current.values()) {
      if (!sameBytes(rec.before, rec.after)) changes.push(rec);
    }
    current = null;
    if (changes.length === 0) return false;
    pushHistory({ changes, model: null });
    emit();
    return true;
  };

  doc.replaceAll = (next, { model: nextModel } = {}) => {
    if (next.length !== LENGTH) throw new RangeError(`pixels must have ${LENGTH} bytes`);
    doc.endStroke();
    const changes = [];
    for (let o = 0; o < LENGTH; o += 4) {
      const before = doc.pixels.slice(o, o + 4);
      const after = Uint8ClampedArray.from([next[o], next[o + 1], next[o + 2], next[o + 3]]);
      if (!sameBytes(before, after)) changes.push({ i: o, before, after });
    }
    const modelChange = nextModel && nextModel !== doc.model ? { before: doc.model, after: nextModel } : null;
    if (changes.length === 0 && !modelChange) return false;
    const entry = { changes, model: modelChange };
    applyEntry(entry, 'after');
    pushHistory(entry);
    emit();
    return true;
  };

  doc.load = (next, { model: nextModel, name: nextName, id: nextId } = {}) => {
    if (next.length !== LENGTH) throw new RangeError(`pixels must have ${LENGTH} bytes`);
    current = null;
    undoStack.length = 0;
    redoStack.length = 0;
    doc.pixels.set(next);
    if (nextModel) doc.model = nextModel;
    if (nextName !== undefined) doc.name = nextName;
    doc.id = nextId || makeId();
    doc.version++;
    emit();
  };

  doc.undo = () => {
    doc.endStroke();
    const entry = undoStack.pop();
    if (!entry) return false;
    applyEntry(entry, 'before');
    redoStack.push(entry);
    emit();
    return true;
  };

  doc.redo = () => {
    doc.endStroke();
    const entry = redoStack.pop();
    if (!entry) return false;
    applyEntry(entry, 'after');
    undoStack.push(entry);
    emit();
    return true;
  };

  doc.on = (event, fn) => {
    if (event !== 'change') throw new RangeError(`unknown event: ${event}`);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  };

  return doc;
}
