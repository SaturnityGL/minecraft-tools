import { createDoc } from './doc.js';
import { faces, PARTS, LAYERS } from './skinmap.js';
import { rgbToOklab, oklabToRgb } from './color.js';
import { TOOLS } from './tools.js';
import { BRUSH_TOOLS } from './tools-brushes.js';
import { createView3D } from './view3d.js';
import { createView2D } from './view2d.js';
import { createColorPicker } from './colorpicker.js';
import { importSkin, exportPng, downloadBlob } from './io.js';
import { convertModel } from './convert.js';
import { pushToOuter, flattenToBody, copyLimbToOtherSide } from './parts.js';
import { openStore } from './store.js';
import { createPointerController } from './ui-pointer.js';
import { createSelectController } from './ui-select.js';
import { createDrawer } from './ui-drawer.js';
import { fileSafe, PART_LABELS } from './ui-dom.js';
import { initColor } from './ui-color.js';
import { initStore } from './ui-store.js';
import { initDonor } from './ui-donor.js';
import { initExtras } from './ui-extras.js';

const SKIN = [224, 172, 135, 255];
const SHIRT = [58, 134, 200, 255];
const PANTS = [66, 66, 150, 255];
const SHOES = [48, 48, 54, 255];
const HAIR = [92, 58, 34, 255];
const EYE = [40, 34, 80, 255];

const HINTS = {
  '3d': 'Drag on the model to paint. Drag empty space or right-drag to rotate. Scroll or pinch to zoom.',
  '2d': 'Drag on a painted area to paint. Drag elsewhere, right-drag or middle-drag to pan. Scroll or pinch to zoom.',
  split: 'Paint in either view and both update live. Scroll or pinch to zoom the view under the pointer.'
};
const SELECT_HINT = 'Drag a box to select. Drag inside it to move, arrow keys nudge, Enter applies, Esc cancels.';

const SELECTABLE_TOOLS = new Set([...Object.keys(TOOLS), 'blend', 'shade', 'select']);
const COLOR_TOOLS = new Set(['pencil', 'autotone', 'bucket']);
const TOOL_KEYS = { b: 'pencil', e: 'eraser', n: 'autotone', i: 'eyedropper', g: 'bucket', m: 'select', u: 'blend', h: 'shade' };
const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function defaultSkin(model) {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  const put = (x, y, c) => pixels.set(c, (y * 64 + x) * 4);
  for (const f of faces(model)) {
    if (f.layer !== 'body') continue;
    for (let fy = 0; fy < f.h; fy++) {
      for (let fx = 0; fx < f.w; fx++) {
        let c = SKIN;
        if (f.part === 'head') {
          const sideBack = f.face === 'right' ? fx < 2 : f.face === 'left' ? fx >= f.w - 2 : false;
          if (f.face === 'top' || f.face === 'back') c = HAIR;
          else if ((f.face === 'right' || f.face === 'left') && (fy < 3 || sideBack)) c = HAIR;
          else if (f.face === 'front' && fy < 2) c = HAIR;
          else if (f.face === 'front' && fy === 4 && (fx === 2 || fx === f.w - 3)) c = EYE;
        } else if (f.part === 'torso') {
          c = SHIRT;
        } else if (f.part === 'rightArm' || f.part === 'leftArm') {
          if (f.face === 'top' || (f.face !== 'bottom' && fy < 4)) c = SHIRT;
        } else {
          c = PANTS;
          if (f.face === 'bottom' || (f.face !== 'top' && fy >= f.h - 2)) c = SHOES;
        }
        put(f.x + fx, f.y + fy, c);
      }
    }
  }
  return pixels;
}

function wheelDelta(e) {
  return e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
}

function isField(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function start() {
  const state = {
    tool: 'pencil',
    color: [158, 35, 200, 255],
    brushSize: 1,
    mirror: false,
    grid: true,
    lock: 'off',
    lockColor: null,
    layer: 'body',
    show: { body: true, outer: true },
    partVisible: { head: true, torso: true, rightArm: true, leftArm: true, rightLeg: true, leftLeg: true },
    autotone: { strength: 35, mode: 'light', retone: false },
    blend: { strength: 50 },
    shade: { dir: 'darken', hueShift: true },
    bucketScope: 'face',
    view: '3d',
    pose: 'stand',
    backdrop: 'dark',
    touchRotate: false
  };

  const doc = createDoc({ pixels: defaultSkin('classic'), model: 'classic', name: 'My skin' });
  const ctx = { doc, state };
  const $ = id => document.getElementById(id);

  const canvas3d = $('skin-canvas');
  const canvas2d = $('flat-canvas');
  const pane3d = $('pane-3d');
  const pane2d = $('pane-2d');
  const viewport = $('viewport');
  const statusEl = $('status');
  const hintEl = $('stage-hint');
  const noticeEl = $('notice');
  const rail = $('tool-rail');
  const modelSelect = $('model-select');
  const modelConfirm = $('model-confirm');
  const fileInput = $('file-input');
  const undoBtn = rail.querySelector('[data-action="undo"]');
  const redoBtn = rail.querySelector('[data-action="redo"]');
  const mirrorBtn = rail.querySelector('[data-action="mirror"]');
  const gridBtn = rail.querySelector('[data-action="grid"]');
  const showBody = $('show-body');
  const showOuter = $('show-outer');
  const toolOptions = $('tool-options');
  const viewSeg = $('view-seg');
  const splitBtn = $('view-split');
  const poseSelect = $('pose-select');
  const backdropBtn = $('backdrop-btn');
  const resetBtn = $('reset-btn');
  const resetConfirm = $('reset-confirm');
  const showAllBtn = $('parts-show-all');
  const partTarget = $('part-target');
  const touchBtn = $('touch-rotate');
  const side = $('side');
  const sideToggle = $('side-toggle');
  const partButtons = [...document.querySelectorAll('[data-part]')];
  const narrow = window.matchMedia('(max-width: 999px)');

  const listeners = new Map();
  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
  }
  function emit(event, data) {
    for (const fn of listeners.get(event) || []) fn(data);
  }

  let statusTimer = null;
  function setStatus(message) {
    statusEl.textContent = message;
    clearTimeout(statusTimer);
    if (message) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 7000);
  }

  function notice(message) {
    const row = document.createElement('div');
    row.className = 'notice-row';
    const text = document.createElement('span');
    text.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'link-btn';
    close.textContent = 'Dismiss';
    close.addEventListener('click', () => {
      row.remove();
      noticeEl.hidden = noticeEl.children.length === 0;
    });
    row.append(text, close);
    noticeEl.append(row);
    noticeEl.hidden = false;
  }

  let view3d = null;
  try {
    view3d = createView3D(canvas3d, { doc, state });
  } catch (err) {
    state.view = '2d';
    notice('Your browser could not start 3D graphics, so only the flat view is available. Painting, saving and downloading all still work.');
  }
  const view2d = createView2D(canvas2d, { doc, state });
  let builtModel = doc.model;

  const previews = { select: null, recolor: null };
  function pushPreview() {
    const p = previews.select || previews.recolor || null;
    if (view3d) view3d.setPreview(p);
    view2d.setPreview(p);
  }
  function setPreview(key, pixels) {
    previews[key] = pixels || null;
    pushPreview();
  }

  const highlights = { check: null, select: null };
  function pushHighlights() {
    const a = highlights.check;
    const b = highlights.select;
    let merged = a || b || null;
    if (a && b) {
      merged = new Uint8ClampedArray(a);
      for (let o = 0; o < merged.length; o += 4) {
        if (b[o + 3] > 0) merged.set(b.subarray(o, o + 4), o);
      }
    }
    if (view3d) view3d.setHighlight(merged);
    view2d.setHighlight(a);
  }
  function setHighlight(key, pixels) {
    highlights[key] = pixels || null;
    pushHighlights();
  }

  const picker = createColorPicker($('color-picker'), {
    onChange(rgb) {
      state.color = [rgb[0], rgb[1], rgb[2], 255];
      emit('color', state.color);
    }
  });
  picker.set(state.color);

  let prevTool = 'pencil';
  let pendingPick = null;

  function syncToggles() {
    mirrorBtn.setAttribute('aria-pressed', String(state.mirror));
    mirrorBtn.classList.toggle('is-active', state.mirror);
    gridBtn.setAttribute('aria-pressed', String(state.grid));
    gridBtn.classList.toggle('is-active', state.grid);
    touchBtn.setAttribute('aria-pressed', String(state.touchRotate));
    touchBtn.textContent = state.touchRotate ? 'Touch: rotate' : 'Touch: paint';
  }

  function syncToolOptions() {
    for (const el of toolOptions.querySelectorAll('[data-tools]')) {
      el.hidden = !el.dataset.tools.split(/\s+/).includes(state.tool);
    }
    for (const b of toolOptions.querySelectorAll('[data-size]')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.size) === state.brushSize));
    }
    for (const b of toolOptions.querySelectorAll('[data-dir]')) {
      b.setAttribute('aria-pressed', String(b.dataset.dir === state.shade.dir));
    }
    $('lock-select').value = state.lock;
    $('bucket-scope').value = state.bucketScope;
    $('autotone-mode').value = state.autotone.mode;
    $('autotone-retone').checked = state.autotone.retone;
    $('shade-hue').checked = state.shade.hueShift;
    $('autotone-strength').value = String(state.autotone.strength);
    $('autotone-value').textContent = String(state.autotone.strength);
    $('blend-strength').value = String(state.blend.strength);
    $('blend-value').textContent = String(state.blend.strength);
  }

  function syncSelectUi() {
    const has = !!select.rect || select.floating;
    for (const b of toolOptions.querySelectorAll('[data-select]')) {
      const id = b.dataset.select;
      if (id === 'paste') b.disabled = !select.hasClipboard;
      else if (id === 'apply' || id === 'cancel') b.disabled = !select.floating;
      else b.disabled = !has;
    }
    emit('selection');
  }

  function syncHint() {
    hintEl.textContent = state.tool === 'select' ? SELECT_HINT : HINTS[state.view];
  }

  function syncTools() {
    for (const b of rail.querySelectorAll('[data-tool]')) {
      const active = b.dataset.tool === state.tool;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    }
    syncToolOptions();
    syncHint();
  }

  function setTool(id) {
    if (!SELECTABLE_TOOLS.has(id)) return;
    if (state.tool === 'select' && id !== 'select') select.clear();
    if (id === 'eyedropper' && state.tool !== 'eyedropper') prevTool = state.tool;
    state.tool = id;
    syncTools();
  }

  function setColor(rgb) {
    state.color = [rgb[0], rgb[1], rgb[2], 255];
    picker.set(state.color);
    emit('color', state.color);
  }

  function shiftLightness(amount) {
    const lab = rgbToOklab(state.color);
    lab[0] = Math.min(1, Math.max(0, lab[0] + amount));
    setColor(oklabToRgb(lab));
  }

  function sample(hit) {
    const px = doc.getPixel(hit.x, hit.y);
    if (px[3] === 0) {
      setStatus('That pixel is empty, so there is no color to pick.');
      return;
    }
    setColor(px);
  }

  function pickOnce(fn) {
    pendingPick = fn;
    viewport.classList.add('is-picking');
    setStatus('Click a pixel on the skin to pick its color. Esc cancels.');
  }

  function takePick() {
    const fn = pendingPick;
    if (!fn) return null;
    pendingPick = null;
    viewport.classList.remove('is-picking');
    return px => {
      if (!px || px[3] === 0) setStatus('Nothing there to pick. Try again on a painted pixel.');
      else {
        setStatus('');
        fn(px);
      }
    };
  }

  const adapter3d = {
    setPreview: p => setPreview('select', p),
    setHighlight: px => setHighlight('select', px)
  };
  const adapter2d = {
    setPreview: p => setPreview('select', p),
    setSelection: rect => view2d.setSelection(rect)
  };

  const select = createSelectController({
    doc,
    views: () => [adapter3d, adapter2d],
    setStatus,
    onChange: () => syncSelectUi()
  });

  function resolveTool() {
    if (state.tool === 'autotone' && state.autotone.retone) return BRUSH_TOOLS.retone;
    return TOOLS[state.tool] || BRUSH_TOOLS[state.tool] || null;
  }

  const pointer = createPointerController({
    doc,
    state,
    ctx,
    sample,
    restoreTool: () => setTool(prevTool),
    resolveTool,
    onStrokeStart: tool => {
      if (COLOR_TOOLS.has(tool.id)) emit('color-used', state.color);
    },
    select,
    takePick
  });
  const finishStroke = pointer.finishStroke;

  if (view3d) {
    pointer.attach(canvas3d, {
      pick: (x, y) => view3d.pick(x, y),
      drag: (dx, dy) => view3d.orbit.rotate(dx, dy),
      wheel: e => view3d.orbit.zoom(wheelDelta(e)),
      gesture: (prev, now) => {
        view3d.orbit.rotate(now.cx - prev.cx, now.cy - prev.cy);
        view3d.orbit.zoom((prev.d - now.d) * 3);
      }
    });
  }
  pointer.attach(canvas2d, {
    pick: (x, y) => view2d.pick(x, y),
    texel: (x, y) => view2d.texel(x, y),
    drag: (dx, dy) => view2d.pan(dx, dy),
    wheel: e => view2d.zoomAt(e.clientX, e.clientY, Math.exp(-wheelDelta(e) * 0.0015)),
    gesture: (prev, now) => {
      view2d.pan(now.cx - prev.cx, now.cy - prev.cy);
      if (prev.d > 0 && now.d > 0) view2d.zoomAt(now.cx, now.cy, now.d / prev.d);
    }
  });

  window.addEventListener('blur', () => pointer.cancelAll());

  function showing3d() {
    return !!view3d && state.view !== '2d';
  }

  function showing2d() {
    return state.view !== '3d';
  }

  function allowedViews() {
    const list = [];
    if (view3d) list.push('3d');
    list.push('2d');
    if (view3d && !narrow.matches) list.push('split');
    return list;
  }

  function syncView() {
    const allowed = allowedViews();
    if (!allowed.includes(state.view)) state.view = allowed[0];
    pane3d.hidden = state.view === '2d';
    pane2d.hidden = state.view === '3d';
    for (const b of viewSeg.querySelectorAll('[data-view]')) {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
      b.disabled = !allowed.includes(b.dataset.view);
    }
    splitBtn.hidden = narrow.matches;
    poseSelect.disabled = !view3d;
    syncHint();
    if (showing3d()) view3d.resize();
    if (showing2d()) view2d.resize();
    emit('view');
  }

  function setView(next) {
    state.view = next;
    syncView();
  }

  function cycleView() {
    const allowed = allowedViews();
    const i = allowed.indexOf(state.view);
    setView(allowed[(i + 1) % allowed.length]);
  }

  narrow.addEventListener('change', syncView);

  viewSeg.addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (!b || b.disabled) return;
    setView(b.dataset.view);
  });

  poseSelect.addEventListener('change', () => {
    state.pose = poseSelect.value;
  });

  function syncBackdrop() {
    viewport.dataset.backdrop = state.backdrop;
    const light = state.backdrop === 'light';
    backdropBtn.setAttribute('aria-pressed', String(light));
    backdropBtn.textContent = light ? 'Dark backdrop' : 'Light backdrop';
  }

  function undo() {
    finishStroke();
    if (select.cancel()) return;
    doc.undo();
  }

  function redo() {
    finishStroke();
    select.commit();
    doc.redo();
  }

  function zoomStep(dir) {
    if (showing3d()) view3d.orbit.zoom(dir * 150);
    if (showing2d()) {
      const r = canvas2d.getBoundingClientRect();
      view2d.zoomAt(r.left + r.width / 2, r.top + r.height / 2, dir < 0 ? 1.25 : 0.8);
    }
  }

  function resetViews() {
    if (view3d) view3d.orbit.reset();
    view2d.reset();
  }

  function setBrushSize(size) {
    state.brushSize = Math.min(3, Math.max(1, size));
    syncToolOptions();
  }

  function setLayer(layer) {
    state.layer = layer;
    state.show[layer] = true;
    syncLayers();
  }

  const actions = {
    undo,
    redo,
    lighten: () => shiftLightness(0.05),
    darken: () => shiftLightness(-0.05),
    'zoom-in': () => zoomStep(-1),
    'zoom-out': () => zoomStep(1),
    mirror: () => {
      state.mirror = !state.mirror;
      syncToggles();
    },
    grid: () => {
      state.grid = !state.grid;
      syncToggles();
    }
  };

  rail.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !rail.contains(b)) return;
    if (b.dataset.tool) setTool(b.dataset.tool);
    else if (b.dataset.action && actions[b.dataset.action]) actions[b.dataset.action]();
    if (e.detail > 0) b.blur();
  });

  const selectActions = {
    copy: () => select.copy(),
    cut: () => select.cut(),
    paste: () => select.paste(),
    'flip-h': () => select.flip('h'),
    'flip-v': () => select.flip('v'),
    erase: () => select.erase(),
    apply: () => select.commit(),
    cancel: () => select.cancel(),
    none: () => select.clear()
  };

  toolOptions.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.size) setBrushSize(Number(b.dataset.size));
    else if (b.dataset.dir) {
      state.shade.dir = b.dataset.dir;
      syncToolOptions();
    } else if (b.dataset.select && selectActions[b.dataset.select]) {
      finishStroke();
      selectActions[b.dataset.select]();
    }
  });

  $('lock-select').addEventListener('change', e => {
    state.lock = e.target.value;
    state.lockColor = null;
  });
  $('bucket-scope').addEventListener('change', e => {
    state.bucketScope = e.target.value;
  });
  $('autotone-mode').addEventListener('change', e => {
    state.autotone.mode = e.target.value;
  });
  $('autotone-retone').addEventListener('change', e => {
    state.autotone.retone = e.target.checked;
  });
  $('shade-hue').addEventListener('change', e => {
    state.shade.hueShift = e.target.checked;
  });
  $('autotone-strength').addEventListener('input', e => {
    state.autotone.strength = Number(e.target.value);
    $('autotone-value').textContent = e.target.value;
  });
  $('blend-strength').addEventListener('input', e => {
    state.blend.strength = Number(e.target.value);
    $('blend-value').textContent = e.target.value;
  });

  const menus = [...document.querySelectorAll('[data-menu]')].map(btn => ({ btn, menu: $(btn.dataset.menu) }));

  function closeMenus(returnFocus) {
    for (const m of menus) {
      if (m.menu.hidden) continue;
      m.menu.hidden = true;
      m.btn.setAttribute('aria-expanded', 'false');
      if (returnFocus) m.btn.focus();
    }
    resetConfirm.hidden = true;
    resetBtn.hidden = false;
  }

  function anyMenuOpen() {
    return menus.some(m => !m.menu.hidden);
  }

  for (const m of menus) {
    m.btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = m.menu.hidden;
      closeMenus(false);
      if (!open) return;
      m.menu.hidden = false;
      m.btn.setAttribute('aria-expanded', 'true');
      emit('menu', m.menu.id);
      const first = m.menu.querySelector('button:not([hidden]), input, select');
      if (first) first.focus();
    });
  }
  document.addEventListener('click', e => {
    for (const m of menus) {
      if (!m.menu.hidden && !m.menu.contains(e.target)) {
        m.menu.hidden = true;
        m.btn.setAttribute('aria-expanded', 'false');
      }
    }
  });

  backdropBtn.addEventListener('click', () => {
    state.backdrop = state.backdrop === 'light' ? 'dark' : 'light';
    syncBackdrop();
    closeMenus(true);
  });

  touchBtn.addEventListener('click', () => {
    state.touchRotate = !state.touchRotate;
    syncToggles();
  });

  sideToggle.addEventListener('click', () => {
    const open = !side.classList.contains('is-open');
    side.classList.toggle('is-open', open);
    sideToggle.setAttribute('aria-expanded', String(open));
  });

  window.addEventListener('keydown', e => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) return;
    if (e.key === 'Escape') {
      if (anyMenuOpen()) {
        e.preventDefault();
        closeMenus(true);
        return;
      }
      if (pendingPick) {
        pendingPick = null;
        viewport.classList.remove('is-picking');
        setStatus('');
        return;
      }
    }
    const t = e.target;
    if (isField(t)) return;
    if (e.key === 'Tab') {
      const free = t === document.body || t === canvas3d || t === canvas2d;
      if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && free) {
        e.preventDefault();
        cycleView();
      }
      return;
    }
    const key = e.key.toLowerCase();
    const selecting = state.tool === 'select';
    if (e.ctrlKey || e.metaKey) {
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (key === 'c' && selecting && (select.rect || select.floating)) {
        e.preventDefault();
        select.copy();
      } else if (key === 'x' && selecting && (select.rect || select.floating)) {
        e.preventDefault();
        select.cut();
      } else if (key === 'v' && select.hasClipboard) {
        e.preventDefault();
        finishStroke();
        setTool('select');
        select.paste();
      } else if (key === 'a' && selecting) {
        e.preventDefault();
        select.selectAll();
      }
      return;
    }
    if (e.altKey) return;
    if (selecting) {
      if (e.key === 'Enter' && select.commit()) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        if (!select.cancel()) select.clear();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && select.erase()) {
        e.preventDefault();
        return;
      }
      if (NUDGE[e.key] && select.nudge(NUDGE[e.key][0], NUDGE[e.key][1])) {
        e.preventDefault();
        return;
      }
    }
    if (TOOL_KEYS[key]) {
      setTool(TOOL_KEYS[key]);
    } else if (key === 'x') {
      setLayer(state.layer === 'body' ? 'outer' : 'body');
      setStatus(`Painting on the ${state.layer} layer.`);
    } else if (key === 's') {
      actions.mirror();
    } else if (key === 'l') {
      actions.grid();
    } else if (key === '[') {
      setBrushSize(state.brushSize - 1);
    } else if (key === ']') {
      setBrushSize(state.brushSize + 1);
    } else if (key === '0') {
      resetViews();
    } else if (key === '?') {
      emit('shortcuts');
    }
  });

  function syncUi() {
    undoBtn.disabled = !doc.canUndo;
    redoBtn.disabled = !doc.canRedo;
    modelSelect.value = doc.model;
    modelConfirm.hidden = true;
  }

  doc.on('change', () => {
    if (doc.model !== builtModel) {
      builtModel = doc.model;
      if (view3d) view3d.rebuild();
    }
    if (select.floating) select.refresh();
    syncUi();
  });

  modelSelect.addEventListener('change', () => {
    const next = modelSelect.value;
    if (next === doc.model) {
      modelConfirm.hidden = true;
      return;
    }
    $('model-confirm-text').textContent = next === 'slim'
      ? 'Switch to slim arms. Convert the arm pixels to fit, or only change the type?'
      : 'Switch to classic arms. Convert the arm pixels to fit, or only change the type?';
    modelConfirm.hidden = false;
  });

  function switchModel(convert) {
    const next = modelSelect.value;
    modelConfirm.hidden = true;
    if (next === doc.model) return;
    finishStroke();
    select.clear();
    const pixels = convert ? convertModel(doc.pixels, doc.model, next) : doc.pixels.slice();
    doc.replaceAll(pixels, { model: next });
    setStatus(convert ? 'Arms converted. Undo brings the old ones back.' : 'Model type changed. The pixels were left as they were.');
  }

  $('model-convert').addEventListener('click', () => switchModel(true));
  $('model-keep').addEventListener('click', () => switchModel(false));
  $('model-cancel').addEventListener('click', () => {
    modelSelect.value = doc.model;
    modelConfirm.hidden = true;
  });

  function syncLayers() {
    showBody.checked = state.show.body;
    showOuter.checked = state.show.outer;
    for (const r of document.querySelectorAll('input[name="paint-layer"]')) r.checked = r.value === state.layer;
  }

  showBody.addEventListener('change', () => {
    state.show.body = showBody.checked;
  });
  showOuter.addEventListener('change', () => {
    state.show.outer = showOuter.checked;
  });
  for (const r of document.querySelectorAll('input[name="paint-layer"]')) {
    r.addEventListener('change', () => {
      if (r.checked) setLayer(r.value);
    });
  }

  function syncParts() {
    for (const b of partButtons) {
      const visible = !!state.partVisible[b.dataset.part];
      b.setAttribute('aria-pressed', String(visible));
      b.classList.toggle('is-off', !visible);
    }
    showAllBtn.disabled = PARTS.every(p => state.partVisible[p]);
  }

  function isSolo(part) {
    return PARTS.every(p => state.partVisible[p] === (p === part));
  }

  function solo(part) {
    const restore = isSolo(part);
    for (const p of PARTS) state.partVisible[p] = restore || p === part;
    syncParts();
  }

  for (const b of partButtons) {
    const part = b.dataset.part;
    b.title = `${b.getAttribute('aria-label')}. Click to hide or show. Double-click or Alt+click to show only this part.`;
    b.addEventListener('click', e => {
      if (!PARTS.includes(part)) return;
      if (e.altKey) {
        solo(part);
        return;
      }
      state.partVisible[part] = !state.partVisible[part];
      syncParts();
    });
    b.addEventListener('dblclick', e => {
      if (PARTS.includes(part) && !e.altKey) solo(part);
    });
  }

  showAllBtn.addEventListener('click', () => {
    for (const p of PARTS) state.partVisible[p] = true;
    syncParts();
  });

  function syncPartActions() {
    const part = partTarget.value;
    $('part-mirror-copy').disabled = part === 'head' || part === 'torso';
  }

  function partAction(work, message) {
    finishStroke();
    select.clear();
    const part = partTarget.value;
    if (!PARTS.includes(part)) return;
    const changed = work(part);
    setStatus(changed ? message(PART_LABELS[part]) : 'Nothing to change there.');
  }

  partTarget.addEventListener('change', syncPartActions);
  $('part-push').addEventListener('click', () => {
    partAction(part => pushToOuter(doc, part), label => `${label}: body copied onto the outer layer.`);
  });
  $('part-flatten').addEventListener('click', () => {
    partAction(part => flattenToBody(doc, part), label => `${label}: outer layer flattened into the body.`);
  });
  $('part-mirror-copy').addEventListener('click', () => {
    partAction(part => copyLimbToOtherSide(doc, part), label => `${label} copied to the other side, mirrored.`);
  });

  let openAsNew = (pixels, model) => {
    doc.replaceAll(pixels, { model });
  };

  async function loadFile(file) {
    if (!file) return;
    try {
      const result = await importSkin(file);
      finishStroke();
      select.clear();
      openAsNew(result.pixels, result.model, file.name.replace(/\.png$/i, ''));
      setStatus('Skin loaded as a new draft.');
    } catch (err) {
      setStatus(err.message);
    }
  }

  $('upload-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    loadFile(file);
  });

  viewport.addEventListener('dragover', e => {
    e.preventDefault();
    viewport.classList.add('is-drop');
  });
  viewport.addEventListener('dragleave', () => viewport.classList.remove('is-drop'));
  viewport.addEventListener('drop', e => {
    e.preventDefault();
    viewport.classList.remove('is-drop');
    loadFile(e.dataTransfer.files[0]);
  });

  $('download-btn').addEventListener('click', async () => {
    try {
      finishStroke();
      select.commit();
      const blob = await exportPng(doc.pixels);
      downloadBlob(blob, `${fileSafe(doc.name)}.png`);
      setStatus('Downloaded.');
      emit('downloaded');
    } catch (err) {
      setStatus(err.message);
    }
  });

  resetBtn.addEventListener('click', () => {
    resetConfirm.hidden = false;
    resetBtn.hidden = true;
    $('reset-no').focus();
  });
  $('reset-no').addEventListener('click', () => closeMenus(true));
  $('reset-yes').addEventListener('click', () => {
    finishStroke();
    select.clear();
    doc.replaceAll(defaultSkin(doc.model), { model: doc.model });
    closeMenus(true);
    setStatus('Skin reset. Undo brings it back.');
  });

  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.target === canvas3d && view3d) view3d.resize();
      else if (entry.target === canvas2d) view2d.resize();
    }
  });
  observer.observe(canvas3d);
  observer.observe(canvas2d);

  const drawer = createDrawer($('drawer'));
  const frameHooks = [];

  function refresh() {
    picker.set(state.color);
    syncTools();
    syncToggles();
    syncLayers();
    syncParts();
    syncPartActions();
    syncBackdrop();
    syncView();
    syncUi();
    syncSelectUi();
    poseSelect.value = state.pose;
  }

  function frame() {
    if (showing3d()) view3d.render();
    if (showing2d()) view2d.render();
    for (const hook of frameHooks) hook();
    requestAnimationFrame(frame);
  }

  const ed = {
    doc,
    state,
    ctx,
    view3d,
    view2d,
    canvas3d,
    canvas2d,
    viewport,
    picker,
    drawer,
    select,
    store: null,
    on,
    emit,
    setStatus,
    notice,
    setTool,
    setColor,
    setLayer,
    setPreview,
    setHighlight,
    pickOnce,
    finishStroke,
    closeMenus,
    refresh,
    defaultSkin,
    layers: LAYERS,
    onFrame: fn => frameHooks.push(fn),
    get openAsNew() { return openAsNew; },
    set openAsNew(fn) { openAsNew = fn; }
  };

  window.__skinEditor = ed;

  refresh();
  requestAnimationFrame(frame);

  openStore().then(store => {
    ed.store = store;
    initColor(ed);
    initExtras(ed);
    initDonor(ed);
    initStore(ed);
  });
}

start();
