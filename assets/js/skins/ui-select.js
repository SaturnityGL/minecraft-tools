import { SIZE } from './skinmap.js';
import { createSelection, clipboard } from './select.js';

const FILL = [255, 255, 255, 46];
const EDGE = [255, 214, 64, 235];

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function inside(rect, p) {
  return !!rect && p.x >= rect.x && p.y >= rect.y && p.x < rect.x + rect.w && p.y < rect.y + rect.h;
}

export function createSelectController({ doc, views, setStatus, onChange }) {
  const sel = createSelection();
  let drag = null;

  function activeRect() {
    const f = sel.floating;
    return f ? { x: f.x, y: f.y, w: f.w, h: f.h } : sel.rect;
  }

  function compose() {
    const f = sel.floating;
    if (!f) return null;
    const out = new Uint8ClampedArray(doc.pixels);
    const origin = sel.lifted;
    if (origin) {
      for (let y = origin.y; y < origin.y + origin.h; y++) {
        for (let x = origin.x; x < origin.x + origin.w; x++) {
          if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) out.fill(0, (y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4);
        }
      }
    }
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const s = (y * f.w + x) * 4;
        if (f.pixels[s + 3] === 0) continue;
        const tx = f.x + x;
        const ty = f.y + y;
        if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) continue;
        out.set(f.pixels.subarray(s, s + 4), (ty * SIZE + tx) * 4);
      }
    }
    return out;
  }

  function outline(rect) {
    if (!rect) return null;
    const out = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
        const edge = x === rect.x || y === rect.y || x === rect.x + rect.w - 1 || y === rect.y + rect.h - 1;
        out.set(edge ? EDGE : FILL, (y * SIZE + x) * 4);
      }
    }
    return out;
  }

  function sync() {
    const rect = activeRect();
    const preview = compose();
    for (const v of views()) {
      v.setPreview(preview);
      if (v.setSelection) v.setSelection(rect);
      else v.setHighlight(outline(rect));
    }
    onChange();
  }

  function point(view, e) {
    if (view.texel) {
      const t = view.texel(e.clientX, e.clientY);
      return t ? { x: t.x, y: t.y, bounds: { x: 0, y: 0, w: SIZE, h: SIZE } } : null;
    }
    const hit = view.pick(e.clientX, e.clientY);
    if (!hit || !hit.face) return null;
    return { x: hit.x, y: hit.y, bounds: { x: hit.face.x, y: hit.face.y, w: hit.face.w, h: hit.face.h } };
  }

  function commit() {
    if (!sel.floating) return false;
    const f = sel.floating;
    const rect = { x: f.x, y: f.y, w: f.w, h: f.h };
    sel.commit(doc);
    sel.set(rect);
    sync();
    return true;
  }

  function cancel() {
    if (!sel.floating) return false;
    const origin = sel.lifted;
    sel.cancel();
    if (origin) sel.set(origin);
    sync();
    return true;
  }

  function ensureFloating() {
    if (sel.floating) return true;
    if (!sel.rect) return false;
    sel.lift(doc);
    return !!sel.floating;
  }

  function down(view, e) {
    const p = point(view, e);
    if (!p) return false;
    if (view.texel && (p.x < 0 || p.y < 0 || p.x >= SIZE || p.y >= SIZE)) return false;
    if (inside(activeRect(), p)) {
      ensureFloating();
      drag = { mode: 'move', last: p, moved: false };
      sync();
      return true;
    }
    commit();
    drag = { mode: 'rect', start: p, bounds: p.bounds, moved: false };
    sel.set({ x: p.x, y: p.y, w: 1, h: 1 });
    sync();
    return true;
  }

  function move(view, e) {
    if (!drag) return;
    const p = point(view, e);
    if (!p) return;
    if (drag.mode === 'move') {
      const dx = p.x - drag.last.x;
      const dy = p.y - drag.last.y;
      if (dx === 0 && dy === 0) return;
      sel.move(dx, dy);
      drag.last = p;
      drag.moved = true;
      sync();
      return;
    }
    const b = drag.bounds;
    const x = clamp(p.x, b.x, b.x + b.w - 1);
    const y = clamp(p.y, b.y, b.y + b.h - 1);
    const x0 = Math.min(drag.start.x, x);
    const y0 = Math.min(drag.start.y, y);
    if (x !== drag.start.x || y !== drag.start.y) drag.moved = true;
    sel.set({ x: x0, y: y0, w: Math.abs(x - drag.start.x) + 1, h: Math.abs(y - drag.start.y) + 1 });
    sync();
  }

  function up() {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.mode === 'move' && !d.moved && sel.lifted) {
      cancel();
    }
  }

  function clear() {
    commit();
    sel.clear();
    sync();
  }

  const api = {
    down,
    move,
    up,
    commit,
    cancel,
    clear,
    get rect() { return sel.rect; },
    get floating() { return !!sel.floating; },
    get hasClipboard() { return !!clipboard.piece; },
    copy() {
      commit();
      if (!sel.copy(doc)) {
        setStatus('Drag a box with the select tool first, then copy.');
        return false;
      }
      setStatus('Copied.');
      onChange();
      return true;
    },
    cut() {
      commit();
      if (!sel.rect) {
        setStatus('Drag a box with the select tool first, then cut.');
        return false;
      }
      sel.cut(doc);
      setStatus('Cut.');
      sync();
      return true;
    },
    erase() {
      if (sel.floating) {
        const origin = sel.lifted;
        sel.cancel();
        if (origin) sel.set(origin);
        else {
          sync();
          return true;
        }
      }
      if (!sel.rect) return false;
      sel.erase(doc);
      sync();
      return true;
    },
    paste(at) {
      commit();
      if (at && clipboard.piece) sel.set({ x: at.x, y: at.y, w: 1, h: 1 });
      if (!sel.paste()) {
        setStatus('Nothing copied yet.');
        return false;
      }
      setStatus('Pasted. Drag or use the arrow keys to place it, Enter to apply, Esc to cancel.');
      sync();
      return true;
    },
    flip(axis) {
      if (!ensureFloating()) {
        setStatus('Select something to flip first.');
        return false;
      }
      if (axis === 'h') sel.flipH();
      else sel.flipV();
      sync();
      return true;
    },
    nudge(dx, dy) {
      if (!ensureFloating()) return false;
      sel.move(dx, dy);
      sync();
      return true;
    },
    selectAll() {
      commit();
      sel.set({ x: 0, y: 0, w: SIZE, h: SIZE });
      sync();
    },
    refresh: sync
  };
  return api;
}
