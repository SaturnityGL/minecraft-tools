import { h, ICONS, iconBtn, modal, closeModal, isModalOpen, readFile, toast } from './ui-kit.js';
import { styleTab, placeTab, animTab, fxTab, docPanel, layerHeader } from './ui-inspector.js';
import { openExport } from './ui-export.js';
import { TYPES, ADD_MENU } from './layers/index.js';
import { newDoc, newLayer, normalizeDoc, History, onAssetLoaded, clone, uid, pruneAssets, PRESETS, sceneStart } from './model.js';
import { loopMs, sceneAt } from './anim.js';
import { renderFrame, layerCorners, hitTest } from './render.js';
import { loadCore, loadModels } from './assets.js';
import { TEMPLATES } from './templates.js';
import { downloadBytes } from './encode.js';

const SAVE_KEY = 'blockforge-banner-studio-v1';
const TAB_KEY = 'blockforge-banner-studio-tab';
const SNAP_PX = 7;
const DEG = Math.PI / 180;

const app = {
  doc: null,
  sel: null,
  t: 0,
  playing: true,
  needs: true,
  tab: 'style',
  hist: new History(),
  statusers: [],
  guides: true,
  snapLines: [],
  changed,
  layersDirty: () => renderLayers(),
};

const $ = id => document.getElementById(id);
let canvas, ctx, overlay, octx, stage, wrap;
let commitTimer = 0;
let lastFrame = 0;

function selLayer() {
  return app.doc.layers.find(l => l.id === app.sel) || null;
}

function changed(rebuild = false, resized = false) {
  app.needs = true;
  if (resized) fitCanvas();
  if (rebuild) renderInspector();
  scheduleCommit();
}

function scheduleCommit() {
  clearTimeout(commitTimer);
  commitTimer = setTimeout(commit, 350);
}

function commit() {
  clearTimeout(commitTimer);
  commitTimer = 0;
  if (app.hist.push(app.doc)) updateUndo();
  save();
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(app.doc));
  } catch (e) {
    try {
      const lite = clone(app.doc);
      lite.assets = {};
      localStorage.setItem(SAVE_KEY, JSON.stringify(lite));
    } catch (e2) { }
  }
}

function loadSaved() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) return normalizeDoc(JSON.parse(s));
  } catch (e) { }
  return null;
}

function setDoc(doc, keepSel = false) {
  app.doc = doc;
  if (!keepSel || !selLayer()) app.sel = null;
  const loop = loopMs(doc);
  if (app.t >= loop) app.t = 0;
  fitCanvas();
  renderAll();
}

function renderAll() {
  renderLayers();
  renderInspector();
  renderTimeline();
  updateUndo();
  app.needs = true;
}

function updateUndo() {
  $('bs-undo').disabled = !app.hist.canUndo();
  $('bs-redo').disabled = !app.hist.canRedo();
}

function undo() {
  if (commitTimer) commit();
  const d = app.hist.undo();
  if (d) { setDoc(normalizeDoc(d), true); save(); }
}

function redo() {
  if (commitTimer) commit();
  const d = app.hist.redo();
  if (d) { setDoc(normalizeDoc(d), true); save(); }
}

function select(id, tab) {
  if (app.sel !== id) {
    app.sel = id;
    if (tab) app.tab = tab;
    renderLayers();
    renderInspector();
  }
  app.needs = true;
}

function addLayer(type) {
  const d = app.doc;
  const over = {};
  const cur = sceneAt(d, app.t);
  if (!TYPES[type].full && d.scenes.length > 1) over.scene = cur.scene.id;
  const l = newLayer(d, type, over);
  if (TYPES[type].full) {
    const firstNonFull = d.layers.findIndex(x => !TYPES[x.type].full);
    const insertAt = type === 'background' ? 0 : (type === 'border' ? d.layers.length : (firstNonFull < 0 ? d.layers.length : firstNonFull));
    d.layers.splice(insertAt, 0, l);
  } else {
    const borderIdx = d.layers.findIndex(x => x.type === 'border');
    if (borderIdx >= 0) d.layers.splice(borderIdx, 0, l);
    else d.layers.push(l);
  }
  app.sel = l.id;
  app.tab = 'style';
  renderLayers();
  renderInspector();
  changed();
}

function duplicate(l) {
  const d = app.doc;
  const c = clone(l);
  c.id = uid();
  c.name = l.name + ' copy';
  if (!TYPES[l.type].full) { c.x += 12; c.y += 12; }
  d.layers.splice(d.layers.indexOf(l) + 1, 0, c);
  app.sel = c.id;
  renderLayers();
  renderInspector();
  changed();
}

function removeLayer(l) {
  const d = app.doc;
  const i = d.layers.indexOf(l);
  if (i < 0) return;
  d.layers.splice(i, 1);
  pruneAssets(d);
  if (app.sel === l.id) app.sel = null;
  renderLayers();
  renderInspector();
  changed();
}

function moveLayer(l, dir) {
  const d = app.doc;
  const i = d.layers.indexOf(l);
  const j = i + dir;
  if (j < 0 || j >= d.layers.length) return;
  d.layers.splice(i, 1);
  d.layers.splice(j, 0, l);
  renderLayers();
  changed();
}

function layerSubtitle(l) {
  if (l.type === 'text') return String(l.text || '').replace(/[&§](#[0-9a-f]{6}|[0-9a-fk-or])/gi, '').split('\n')[0].slice(0, 40);
  if (l.type === 'block' || l.type === 'item') return '';
  if (l.kind) return String(l.kind);
  return '';
}

function renderLayers() {
  const list = $('bs-layers');
  list.textContent = '';
  const d = app.doc;
  if (!d.layers.length) {
    list.append(h('p', { class: 'bs-note' }, 'No layers yet. Add one above or pick a template.'));
    return;
  }
  const sceneName = id => {
    const i = d.scenes.findIndex(s => s.id === id);
    return i < 0 ? '' : (d.scenes[i].name || 'Scene ' + (i + 1));
  };
  for (let i = d.layers.length - 1; i >= 0; i--) {
    const l = d.layers[i];
    const T = TYPES[l.type];
    const sub = layerSubtitle(l);
    const rowEl = h('div', { class: 'bs-layer' + (l.id === app.sel ? ' on' : '') + (l.hidden ? ' hidden' : ''), role: 'button', tabindex: '0', 'data-id': l.id },
      iconBtn(l.hidden ? 'eyeOff' : 'eye', l.hidden ? 'Show layer' : 'Hide layer', e => { e.stopPropagation(); l.hidden = !l.hidden; renderLayers(); changed(); }, { class: 'bs-ib ' + (l.hidden ? 'dim' : '') }),
      h('div', { class: 'bs-lmain' },
        h('div', { class: 'bs-lname-row' }, h('span', { class: 'bs-ltitle' }, l.name || T.label), l.scene ? h('span', { class: 'bs-badge' }, sceneName(l.scene)) : null),
        sub ? h('div', { class: 'bs-lsub' }, sub) : null),
      h('div', { class: 'bs-lacts' },
        iconBtn(l.locked ? 'lock' : 'unlock', l.locked ? 'Unlock (allow canvas dragging)' : 'Lock (stop canvas dragging)', e => { e.stopPropagation(); l.locked = !l.locked; renderLayers(); changed(); }, { class: 'bs-ib ' + (l.locked ? '' : 'dim') }),
        iconBtn('up', 'Bring forward', e => { e.stopPropagation(); moveLayer(l, 1); }),
        iconBtn('down', 'Send back', e => { e.stopPropagation(); moveLayer(l, -1); }),
        iconBtn('copy', 'Duplicate', e => { e.stopPropagation(); duplicate(l); }),
        iconBtn('trash', 'Delete', e => { e.stopPropagation(); removeLayer(l); })));
    rowEl.addEventListener('click', () => select(l.id));
    rowEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(l.id); } });
    list.append(rowEl);
  }
}

function renderInspector() {
  const box = $('bs-inspector');
  const keepScroll = box.scrollTop;
  box.textContent = '';
  app.statusers = [];
  const l = selLayer();
  if (!l) {
    box.append(h('div', { class: 'bs-ihead' }, h('h3', null, 'Banner settings')), docPanel(app));
    return;
  }
  const tabs = [['style', 'Style'], ['place', 'Position'], ['anim', 'Animate'], ['fx', 'Effects']];
  const bar = h('div', { class: 'bs-tabs', role: 'tablist' });
  for (const [id, label] of tabs) {
    const count = id === 'anim' ? l.motion.filter(m => !m.off).length : id === 'fx' ? l.fx.filter(f => !f.off).length : 0;
    bar.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(app.tab === id), class: 'bs-tab' + (app.tab === id ? ' on' : ''), onclick: () => {
      app.tab = id;
      try { localStorage.setItem(TAB_KEY, id); } catch (e) { }
      renderInspector();
    } }, label, count ? h('span', { class: 'bs-count' }, count) : null));
  }
  const body = app.tab === 'place' ? placeTab(app, l) : app.tab === 'anim' ? animTab(app, l) : app.tab === 'fx' ? fxTab(app, l) : styleTab(app, l);
  box.append(h('div', { class: 'bs-ihead' }, layerHeader(app, l), iconBtn('x', 'Back to banner settings', () => select(null))), bar, body);
  box.scrollTop = keepScroll;
}

function renderTimeline() {
  const d = app.doc;
  const bar = $('bs-scenes');
  bar.textContent = '';
  const loop = loopMs(d);
  const cur = sceneAt(d, app.t);
  d.scenes.forEach((s, i) => {
    const b = h('button', { type: 'button', class: 'bs-scene' + (i === cur.index ? ' on' : ''), style: { flexGrow: s.dur }, title: `${s.name} (${(s.dur / 1000).toFixed(1)}s)`, onclick: () => seek(sceneStart(d, s.id) + Math.min(s.dur * 0.5, 900)) },
      h('span', null, s.name || 'Scene ' + (i + 1)), h('small', null, (s.dur / 1000).toFixed(1) + 's'));
    bar.append(b);
  });
  const scrub = $('bs-scrub');
  scrub.max = String(loop - 1);
  scrub.step = String(1000 / d.fps);
  const ed = $('bs-scene-edit');
  ed.textContent = '';
  const s = cur.scene;
  const nameIn = h('input', { type: 'text', class: 'bs-input', value: s.name, maxlength: 30, 'aria-label': 'Scene name' });
  nameIn.addEventListener('change', () => { s.name = nameIn.value || 'Scene ' + (cur.index + 1); renderTimeline(); renderLayers(); changed(); });
  const durIn = h('input', { type: 'number', class: 'bs-input bs-dur', value: (s.dur / 1000).toFixed(1), min: 0.2, max: 60, step: 0.1, 'aria-label': 'Scene length in seconds' });
  durIn.addEventListener('change', () => {
    s.dur = Math.round(Math.max(0.2, Math.min(60, +durIn.value || 3)) * 1000);
    renderTimeline();
    if (!selLayer()) renderInspector();
    changed();
  });
  ed.append(h('span', { class: 'bs-muted bs-small' }, `Scene ${cur.index + 1} of ${d.scenes.length}`), nameIn, h('label', { class: 'bs-inline' }, durIn, h('span', { class: 'bs-small' }, 'sec')),
    h('button', { type: 'button', class: 'bs-btn sm', onclick: () => addScene(cur.index) }, '+ Scene'),
    d.scenes.length > 1 ? h('button', { type: 'button', class: 'bs-btn sm ghost', onclick: () => moveScene(cur.index, -1), disabled: cur.index === 0 }, 'Move left') : null,
    d.scenes.length > 1 ? h('button', { type: 'button', class: 'bs-btn sm ghost', onclick: () => moveScene(cur.index, 1), disabled: cur.index === d.scenes.length - 1 }, 'Move right') : null,
    d.scenes.length > 1 ? h('button', { type: 'button', class: 'bs-btn sm danger', onclick: () => deleteScene(cur.index) }, 'Delete scene') : null);
  app.sceneIndex = cur.index;
}

function addScene(after) {
  const d = app.doc;
  const s = { id: uid(), name: 'Scene ' + (d.scenes.length + 1), dur: 3000 };
  d.scenes.splice(after + 1, 0, s);
  seek(sceneStart(d, s.id) + 10);
  renderTimeline();
  if (!selLayer()) renderInspector();
  changed();
  toast('Scene added. New layers you add now show in this scene.');
}

function moveScene(i, dir) {
  const d = app.doc;
  const j = i + dir;
  if (j < 0 || j >= d.scenes.length) return;
  const [s] = d.scenes.splice(i, 1);
  d.scenes.splice(j, 0, s);
  seek(sceneStart(d, s.id) + 10);
  renderTimeline();
  changed();
}

function deleteScene(i) {
  const d = app.doc;
  const s = d.scenes[i];
  const owned = d.layers.filter(l => l.scene === s.id);
  if (owned.length && !confirm(`Delete "${s.name}" and its ${owned.length} layer${owned.length > 1 ? 's' : ''}?`)) return;
  d.scenes.splice(i, 1);
  d.layers = d.layers.filter(l => l.scene !== s.id);
  pruneAssets(d);
  if (!selLayer()) app.sel = null;
  app.t = Math.min(app.t, loopMs(d) - 1);
  renderAll();
  changed();
}

function seek(t) {
  const loop = loopMs(app.doc);
  app.t = ((t % loop) + loop) % loop;
  app.needs = true;
}

function setPlaying(p) {
  app.playing = p;
  const b = $('bs-play');
  b.innerHTML = p ? ICONS.pause : ICONS.play;
  b.title = p ? 'Pause (Space)' : 'Play (Space)';
  b.setAttribute('aria-label', b.title);
}

function fitCanvas() {
  const d = app.doc;
  if (canvas.width !== d.w || canvas.height !== d.h) {
    canvas.width = d.w;
    canvas.height = d.h;
  }
  const zoom = $('bs-zoom').value;
  const availW = Math.max(120, stage.clientWidth - 24);
  const availH = Math.max(120, Math.min(window.innerHeight * 0.62, 720));
  let k = zoom === 'fit' ? Math.min(availW / d.w, availH / d.h) : +zoom;
  if (zoom === 'fit' && k > 1) k = Math.min(k, Math.max(1, Math.floor(k)));
  const cw = Math.max(1, Math.round(d.w * k)), ch = Math.max(1, Math.round(d.h * k));
  wrap.style.width = cw + 'px';
  wrap.style.height = ch + 'px';
  canvas.style.imageRendering = k >= 1.5 ? 'pixelated' : 'auto';
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.round(cw * dpr);
  overlay.height = Math.round(ch * dpr);
  overlay.style.width = cw + 'px';
  overlay.style.height = ch + 'px';
  app.view = { k, dpr };
  $('bs-sizelabel').textContent = `${d.w} x ${d.h}` + (k !== 1 ? ` at ${Math.round(k * 100)}%` : '');
  app.needs = true;
}

function drawOverlay() {
  const { k, dpr } = app.view;
  const d = app.doc;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const s = k * dpr;
  octx.setTransform(s, 0, 0, s, 0, 0);
  const px = 1 / s;
  if (app.guides) {
    const p = PRESETS.find(x => x.id === d.preset);
    if (p && p.id === 'youtube' && d.w === p.w) {
      octx.setLineDash([6 * px, 4 * px]);
      octx.strokeStyle = 'rgba(255,255,255,.55)';
      octx.lineWidth = px;
      octx.strokeRect((d.w - 1235) / 2, (d.h - 338) / 2, 1235, 338);
      octx.setLineDash([]);
    }
  }
  for (const ln of app.snapLines) {
    octx.strokeStyle = '#ff3df0';
    octx.lineWidth = px;
    octx.beginPath();
    if (ln.x != null) { octx.moveTo(ln.x, 0); octx.lineTo(ln.x, d.h); }
    else { octx.moveTo(0, ln.y); octx.lineTo(d.w, ln.y); }
    octx.stroke();
  }
  const l = selLayer();
  if (!l || l.hidden || TYPES[l.type].full) return;
  const c = layerCorners(d, l, app.t);
  if (!c) return;
  octx.strokeStyle = l.locked ? 'rgba(255,255,255,.5)' : '#3df5ff';
  octx.lineWidth = 1.5 * px;
  octx.setLineDash(l.locked ? [4 * px, 3 * px] : []);
  octx.beginPath();
  c.forEach((p, i) => i ? octx.lineTo(p[0], p[1]) : octx.moveTo(p[0], p[1]));
  octx.closePath();
  octx.stroke();
  octx.setLineDash([]);
  if (l.locked) return;
  const hs = 5 * px;
  octx.fillStyle = '#fff';
  for (const p of c) {
    octx.fillRect(p[0] - hs, p[1] - hs, hs * 2, hs * 2);
    octx.strokeRect(p[0] - hs, p[1] - hs, hs * 2, hs * 2);
  }
  const rh = rotHandle(c, px);
  octx.beginPath();
  octx.moveTo((c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2);
  octx.lineTo(rh[0], rh[1]);
  octx.stroke();
  octx.beginPath();
  octx.arc(rh[0], rh[1], hs * 1.1, 0, Math.PI * 2);
  octx.fill();
  octx.stroke();
}

function rotHandle(c, px) {
  const mx = (c[0][0] + c[1][0]) / 2, my = (c[0][1] + c[1][1]) / 2;
  const cx = (c[0][0] + c[2][0]) / 2, cy = (c[0][1] + c[2][1]) / 2;
  let vx = mx - cx, vy = my - cy;
  const len = Math.hypot(vx, vy) || 1;
  vx /= len; vy /= len;
  return [mx + vx * 22 * px, my + vy * 22 * px];
}

function docPoint(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * app.doc.w / r.width, (e.clientY - r.top) * app.doc.h / r.height];
}

let drag = null;

function onDown(e) {
  if (e.button !== 0) return;
  const d = app.doc;
  const [x, y] = docPoint(e);
  const px = 1 / app.view.k;
  const l = selLayer();
  if (l && !l.locked && !l.hidden && !TYPES[l.type].full) {
    const c = layerCorners(d, l, app.t);
    if (c) {
      const rh = rotHandle(c, px);
      if (Math.hypot(x - rh[0], y - rh[1]) < 10 * px) {
        drag = { mode: 'rot', l, a0: Math.atan2(y - l.y, x - l.x), rot0: l.rot };
      } else {
        for (const p of c) {
          if (Math.hypot(x - p[0], y - p[1]) < 10 * px) {
            drag = { mode: 'scale', l, d0: Math.hypot(x - l.x, y - l.y) || 1, s0: l.scale };
            break;
          }
        }
      }
    }
  }
  if (!drag) {
    const hit = hitTest(d, x, y, app.t);
    if (hit) {
      select(hit.id);
      drag = { mode: 'move', l: hit, x0: x, y0: y, lx: hit.x, ly: hit.y, moved: false };
    } else {
      select(null);
      return;
    }
  }
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onMove(e) {
  if (!drag) {
    const [x, y] = docPoint(e);
    const hit = hitTest(app.doc, x, y, app.t);
    canvas.style.cursor = hit ? 'move' : 'default';
    return;
  }
  const d = app.doc;
  const [x, y] = docPoint(e);
  const l = drag.l;
  const snapOn = !e.altKey;
  const tol = SNAP_PX / app.view.k;
  app.snapLines = [];
  if (drag.mode === 'move') {
    let nx = drag.lx + (x - drag.x0), ny = drag.ly + (y - drag.y0);
    if (Math.abs(x - drag.x0) + Math.abs(y - drag.y0) > 1) drag.moved = true;
    if (snapOn) {
      const xs = [d.w / 2, d.w / 3, d.w * 2 / 3], ys = [d.h / 2, d.h / 3, d.h * 2 / 3];
      for (const sx of xs) if (Math.abs(nx - sx) < tol) { nx = sx; app.snapLines.push({ x: sx }); break; }
      for (const sy of ys) if (Math.abs(ny - sy) < tol) { ny = sy; app.snapLines.push({ y: sy }); break; }
    }
    l.x = Math.round(nx);
    l.y = Math.round(ny);
  } else if (drag.mode === 'scale') {
    let s = drag.s0 * Math.hypot(x - l.x, y - l.y) / drag.d0;
    s = Math.max(0.05, Math.min(12, s));
    if (snapOn && Math.abs(s - Math.round(s)) < 0.04) s = Math.round(s);
    l.scale = +s.toFixed(3);
  } else if (drag.mode === 'rot') {
    let r = drag.rot0 + (Math.atan2(y - l.y, x - l.x) - drag.a0) / DEG;
    r = ((r + 180) % 360 + 360) % 360 - 180;
    if (snapOn) {
      const near = Math.round(r / 15) * 15;
      if (Math.abs(r - near) < 4) r = near;
    }
    l.rot = Math.round(r);
  }
  app.needs = true;
  livePlace(l);
}

function livePlace(l) {
  const box = $('bs-inspector');
  for (const k of ['x', 'y']) {
    const n = box.querySelector(`input[data-k="${k}"]`);
    if (n && document.activeElement !== n) n.value = Math.round(l[k]);
  }
}

function onUp(e) {
  if (!drag) return;
  const was = drag;
  drag = null;
  app.snapLines = [];
  app.needs = true;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  if (was.mode !== 'move' || was.moved) {
    if (app.tab === 'place') renderInspector();
    changed();
  }
}

function onDbl(e) {
  const [x, y] = docPoint(e);
  const hit = hitTest(app.doc, x, y, app.t);
  if (!hit) return;
  app.tab = 'style';
  app.sel = null;
  select(hit.id, 'style');
  const ta = $('bs-inspector').querySelector('[data-main]');
  if (ta) { ta.focus(); ta.select(); }
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = lastFrame ? Math.min(100, now - lastFrame) : 0;
  lastFrame = now;
  if (app.playing && !drag) {
    seek(app.t + dt);
  }
  if (!app.needs && !app.playing) return;
  app.needs = false;
  renderFrame(ctx, app.doc, app.t, { editor: true });
  drawOverlay();
  const scrub = $('bs-scrub');
  if (document.activeElement !== scrub) scrub.value = String(Math.floor(app.t));
  $('bs-time').textContent = (app.t / 1000).toFixed(2) + 's / ' + (loopMs(app.doc) / 1000).toFixed(1) + 's';
  const idx = sceneAt(app.doc, app.t).index;
  if (idx !== app.sceneIndex) renderTimeline();
}

function stepFrame(dir) {
  setPlaying(false);
  const f = 1000 / app.doc.fps;
  seek(Math.round(app.t / f + dir) * f);
}

function onKey(e) {
  if (isModalOpen()) return;
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (typing) return;
  const l = selLayer();
  if (mod && e.key.toLowerCase() === 'd' && l) { e.preventDefault(); duplicate(l); return; }
  if (e.key === ' ') { e.preventDefault(); setPlaying(!app.playing); return; }
  if (e.key === ',' ) { stepFrame(-1); return; }
  if (e.key === '.') { stepFrame(1); return; }
  if (!l) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeLayer(l); return; }
  if (e.key === 'Escape') { select(null); return; }
  if (TYPES[l.type].full || l.locked) return;
  const step = e.shiftKey ? 10 : 1;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) {
    e.preventDefault();
    l.x += mv[0];
    l.y += mv[1];
    livePlace(l);
    changed();
  }
}

function templateGallery(first = false) {
  const grid = h('div', { class: 'bs-tgrid' });
  for (const T of TEMPLATES) {
    const doc = T.make();
    const tw = 280, th = Math.max(40, Math.round(tw * doc.h / doc.w));
    const c = h('canvas', { width: tw, height: Math.min(th, 200) });
    const card = h('button', { type: 'button', class: 'bs-tcard', onclick: () => {
      if (!first && app.doc.layers.length && !confirm('Replace your current banner with this template? You can undo afterwards.')) return;
      closeModal();
      const fresh = normalizeDoc(T.make());
      app.t = 0;
      setDoc(fresh);
      commit();
      setPlaying(true);
    } }, h('div', { class: 'bs-tthumb' }, c), h('strong', null, T.name), h('span', null, T.desc));
    grid.append(card);
    const drawThumb = () => {
      const x = c.getContext('2d');
      const k = Math.min(c.width / doc.w, c.height / doc.h);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, c.width, c.height);
      x.setTransform(k, 0, 0, k, (c.width - doc.w * k) / 2, (c.height - doc.h * k) / 2);
      const t = Math.min(doc.scenes[0].dur * 0.75, 2000);
      try { renderFrame(x, doc, t, {}); } catch (err) { }
    };
    requestAnimationFrame(drawThumb);
    setTimeout(drawThumb, 900);
  }
  modal(first ? 'Start from a template' : 'Templates', [
    h('p', { class: 'bs-note' }, 'Every template is fully editable. Swap the text, blocks and colors to make it yours.'),
    grid,
  ], { wide: true, focus: false });
}

function newBanner() {
  const opts = h('div', { class: 'bs-tgrid small' });
  for (const p of PRESETS) {
    opts.append(h('button', { type: 'button', class: 'bs-tcard', onclick: () => {
      if (app.doc.layers.length && !confirm('Start a blank banner? You can undo afterwards.')) return;
      closeModal();
      const d = newDoc(p.id);
      const bg = newLayer(d, 'background', { kind: 'linear' });
      d.layers.push(bg);
      app.t = 0;
      setDoc(d);
      commit();
    } }, h('strong', null, p.label), h('span', null, `${p.w} x ${p.h}`), h('span', { class: 'bs-muted' }, p.note)));
  }
  modal('New blank banner', opts, { wide: true, focus: false });
}

async function openJson() {
  const f = await readFile('.json,application/json', true);
  if (!f) return;
  try {
    const d = normalizeDoc(JSON.parse(f.data));
    app.t = 0;
    setDoc(d);
    commit();
    toast('Project opened.');
  } catch (e) {
    toast('That file is not a Banner Studio project.', 'bad');
  }
}

function saveJson() {
  commit();
  const name = (app.doc.name || 'banner').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'banner';
  downloadBytes(new TextEncoder().encode(JSON.stringify(app.doc)), name + '.bannerstudio.json', 'application/json');
}

function buildAddMenu() {
  const box = $('bs-add');
  for (const [type, label, hint] of ADD_MENU) {
    box.append(h('button', { type: 'button', class: 'bs-addbtn', title: hint, onclick: () => addLayer(type) }, h('span', { class: 'bs-addicon bs-ai-' + type }), h('span', null, label)));
  }
}

export async function start() {
  canvas = $('bs-canvas');
  ctx = canvas.getContext('2d');
  overlay = $('bs-overlay');
  octx = overlay.getContext('2d');
  stage = $('bs-stage');
  wrap = $('bs-canvaswrap');
  try { app.tab = localStorage.getItem(TAB_KEY) || 'style'; } catch (e) { }

  $('bs-undo').innerHTML = ICONS.undo;
  $('bs-redo').innerHTML = ICONS.redo;
  $('bs-prev').innerHTML = ICONS.prev;
  $('bs-next').innerHTML = ICONS.next;
  $('bs-undo').addEventListener('click', undo);
  $('bs-redo').addEventListener('click', redo);
  $('bs-play').addEventListener('click', () => setPlaying(!app.playing));
  $('bs-prev').addEventListener('click', () => stepFrame(-1));
  $('bs-next').addEventListener('click', () => stepFrame(1));
  $('bs-templates').addEventListener('click', () => templateGallery(false));
  $('bs-new').addEventListener('click', newBanner);
  $('bs-open').addEventListener('click', openJson);
  $('bs-save').addEventListener('click', saveJson);
  $('bs-settings').addEventListener('click', () => select(null));
  $('bs-export').addEventListener('click', () => { commit(); setPlaying(false); openExport(app); });
  $('bs-zoom').addEventListener('change', fitCanvas);
  $('bs-guides').addEventListener('change', e => { app.guides = e.target.checked; app.needs = true; });
  const scrub = $('bs-scrub');
  scrub.addEventListener('input', () => { setPlaying(false); seek(+scrub.value); });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('dblclick', onDbl);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => fitCanvas());
  window.addEventListener('beforeunload', () => { if (commitTimer) commit(); });
  buildAddMenu();

  onAssetLoaded(() => {
    app.needs = true;
    for (const fn of app.statusers) fn();
  });

  const saved = loadSaved();
  const first = !saved;
  app.doc = saved || normalizeDoc(TEMPLATES.find(t => t.id === 'discord-hero').make());
  app.hist.reset(app.doc);
  fitCanvas();
  renderAll();
  setPlaying(true);
  requestAnimationFrame(tick);

  $('bs-loading').hidden = false;
  try {
    await loadCore();
    app.needs = true;
    await loadModels();
  } catch (e) {
    toast('Could not load Minecraft textures. Check your connection and reload.', 'bad');
  }
  $('bs-loading').hidden = true;
  app.needs = true;
  renderInspector();
  if (document.fonts) document.fonts.ready.then(() => { app.needs = true; });
  if (first) templateGallery(true);
}
