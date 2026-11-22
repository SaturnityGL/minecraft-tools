import { h, iconBtn, texThumb, texturePicker, blockPicker, readFile, toast, fmtBytes } from './ui-kit.js';
import { TYPES } from './layers/index.js';
import { PRESETS, FPS_OPTIONS, BLENDS, FX, FX_FIELDS, addAsset, assetImage, resizeDoc } from './model.js';
import { TRANSITIONS, EASE_OPTIONS, MOTIONS, loopMs, frameCount } from './anim.js';
import { prettyName, blockIcon } from './assets.js';

const MAX_UPLOAD = 6 * 1024 * 1024;

function row(label, control, extra) {
  return h('label', { class: 'bs-row' + (extra ? ' ' + extra : '') }, h('span', { class: 'bs-lab' }, label), control);
}

function rangeCtl(get, set, min, max, step, opts = {}) {
  const v0 = get();
  const r = h('input', { type: 'range', min, max, step, value: v0, class: 'bs-range' });
  const n = h('input', { type: 'number', min, max, step, value: v0, class: 'bs-num' });
  const dec = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  const apply = (v, from) => {
    v = Math.max(+min, Math.min(+max, +v));
    if (!Number.isFinite(v)) return;
    v = +v.toFixed(dec);
    if (from !== r) r.value = v;
    if (from !== n) n.value = v;
    set(v);
  };
  r.addEventListener('input', () => apply(r.value, r));
  n.addEventListener('change', () => {
    let v = +n.value;
    if (opts.free) { set(v); r.value = v; return; }
    apply(v, n);
  });
  return h('div', { class: 'bs-rangewrap' }, r, n);
}

function selectCtl(opts, value, onChange) {
  const s = h('select', { class: 'bs-input' });
  for (const [v, label] of opts) {
    const o = h('option', { value: String(v) }, label);
    if (String(v) === String(value)) o.selected = true;
    s.append(o);
  }
  s.addEventListener('change', () => {
    const hit = opts.find(o => String(o[0]) === s.value);
    onChange(hit ? hit[0] : s.value);
  });
  return s;
}

function colorCtl(value, onInput) {
  const c = h('input', { type: 'color', value: normHex(value), class: 'bs-color' });
  const t = h('input', { type: 'text', value: normHex(value), class: 'bs-input bs-hex', maxlength: 7, spellcheck: 'false' });
  c.addEventListener('input', () => { t.value = c.value; onInput(c.value); });
  t.addEventListener('change', () => {
    const v = normHex(t.value);
    t.value = v;
    c.value = v;
    onInput(v);
  });
  return h('div', { class: 'bs-colorwrap' }, c, t);
}

function normHex(v) {
  let s = String(v || '#000000').trim();
  if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map(ch => ch + ch).join('');
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : '#000000';
}

async function uploadImage(app, kind) {
  const f = await readFile(kind === 'font' ? '.ttf,.otf,.woff,.woff2' : 'image/png,image/gif,image/jpeg,image/webp,image/svg+xml');
  if (!f) return null;
  if (f.size > MAX_UPLOAD) {
    toast(`That file is ${fmtBytes(f.size)}. Keep uploads under 6 MB.`, 'bad');
    return null;
  }
  return addAsset(app.doc, kind, f.name, f.data);
}

function imageField(app, layer, f) {
  const id = layer[f.k];
  const a = id && app.doc.assets[id];
  const thumb = h('div', { class: 'bs-imgthumb' });
  if (a) {
    const img = h('img', { src: a.data, alt: '' });
    thumb.append(img);
  } else thumb.append(h('span', { class: 'bs-muted bs-small' }, 'No image'));
  const others = Object.entries(app.doc.assets).filter(([, x]) => x.kind === 'image');
  const btns = h('div', { class: 'bs-btnrow' },
    h('button', { type: 'button', class: 'bs-btn sm', onclick: async () => {
      const nid = await uploadImage(app, 'image');
      if (!nid) return;
      layer[f.k] = nid;
      assetImage(app.doc, nid);
      app.changed(true);
    } }, a ? 'Replace' : 'Upload'),
    a && h('button', { type: 'button', class: 'bs-btn sm ghost', onclick: () => { layer[f.k] = null; app.changed(true); } }, 'Remove'));
  const wrap = h('div', { class: 'bs-imgfield' }, thumb, h('div', null, a ? h('div', { class: 'bs-small bs-ellip' }, a.name) : null, btns));
  if (others.length > 1 || (others.length === 1 && !a)) {
    wrap.append(selectCtl([['', 'Use an image already in this banner...'], ...others.map(([k, x]) => [k, x.name])], '', v => {
      if (!v) return;
      layer[f.k] = v;
      app.changed(true);
    }));
  }
  return row(f.label, wrap, 'col');
}

function colorsField(app, layer, f) {
  const list = Array.isArray(layer[f.k]) ? layer[f.k] : (layer[f.k] = ['#ffffff', '#000000']);
  const wrap = h('div', { class: 'bs-colors' });
  list.forEach((c, i) => {
    const sw = h('input', { type: 'color', value: normHex(c), class: 'bs-color', title: 'Color ' + (i + 1) });
    sw.addEventListener('input', () => { list[i] = sw.value; app.changed(); });
    const item = h('div', { class: 'bs-swatch' }, sw);
    if (list.length > 2) item.append(iconBtn('x', 'Remove color', () => { list.splice(i, 1); app.changed(true); }, { class: 'bs-ib tiny' }));
    wrap.append(item);
  });
  if (list.length < 8) wrap.append(iconBtn('plus', 'Add color', () => { list.push(list[list.length - 1] || '#ffffff'); app.changed(true); }));
  return row(f.label, wrap, 'col');
}

function fieldEl(app, layer, f) {
  if (f.show && !f.show(layer)) return null;
  const set = (v, rebuild) => { layer[f.k] = v; app.changed(rebuild); };
  switch (f.t) {
    case 'heading': return h('h4', { class: 'bs-h' }, f.label);
    case 'note': return h('p', { class: 'bs-note' }, f.label);
    case 'range': return row(f.label, rangeCtl(() => layer[f.k] ?? f.min, v => set(v), f.min, f.max, f.step || 1));
    case 'number': {
      const n = h('input', { type: 'number', class: 'bs-input', value: layer[f.k] ?? 0, min: f.min, max: f.max, step: f.step || 1 });
      n.addEventListener('change', () => set(+n.value));
      return row(f.label, n);
    }
    case 'color': return row(f.label, colorCtl(layer[f.k], v => set(v)));
    case 'colors': return colorsField(app, layer, f);
    case 'select': return row(f.label, selectCtl(f.opts, layer[f.k], v => set(v, true)));
    case 'font': {
      const s = selectCtl(f.opts, layer[f.k], v => set(v, true));
      for (const o of s.options) if (o.value !== 'custom') o.style.fontFamily = `"${o.value === 'minecraft' ? 'Minecraft' : o.value}"`;
      s.style.fontFamily = layer[f.k] === 'minecraft' ? 'Minecraft' : `"${layer[f.k]}"`;
      return row(f.label, s);
    }
    case 'font-upload': {
      const a = layer[f.k] && app.doc.assets[layer[f.k]];
      const fonts = Object.entries(app.doc.assets).filter(([, x]) => x.kind === 'font');
      const wrap = h('div', { class: 'bs-col' },
        h('div', { class: 'bs-btnrow' },
          h('span', { class: 'bs-small bs-ellip' }, a ? a.name : 'No font file yet'),
          h('button', { type: 'button', class: 'bs-btn sm', onclick: async () => {
            const id = await uploadImage(app, 'font');
            if (id) set(id, true);
          } }, a ? 'Replace' : 'Upload .ttf / .otf / .woff')));
      if (fonts.length > 1) wrap.append(selectCtl(fonts.map(([k, x]) => [k, x.name]), layer[f.k], v => set(v, true)));
      return row(f.label, wrap, 'col');
    }
    case 'check': {
      const c = h('input', { type: 'checkbox', checked: !!layer[f.k] });
      c.addEventListener('change', () => set(c.checked, true));
      return h('label', { class: 'bs-check' }, c, h('span', null, f.label));
    }
    case 'text': {
      const i = h('input', { type: 'text', class: 'bs-input', value: layer[f.k] ?? '', spellcheck: 'false' });
      const status = f.status ? h('div', { class: 'bs-status bs-small', 'data-status': f.k }) : null;
      const upd = () => { if (status) status.textContent = f.status(layer); };
      i.addEventListener(f.status ? 'change' : 'input', () => { set(i.value); setTimeout(upd, 50); });
      upd();
      if (status) app.statusers.push(upd);
      return row(f.label, h('div', { class: 'bs-col' }, i, status), 'col');
    }
    case 'textarea': {
      const ta = h('textarea', { class: 'bs-input bs-ta', rows: Math.min(5, Math.max(2, String(layer[f.k] || '').split('\n').length + 1)), spellcheck: 'false', 'data-main': '1' }, layer[f.k] ?? '');
      ta.addEventListener('input', () => { set(ta.value); app.layersDirty(); });
      return row(f.label, ta, 'col');
    }
    case 'texture': {
      const btn = h('button', { type: 'button', class: 'bs-texbtn', onclick: () => texturePicker(f.prefix || 'block/', layer[f.k], v => set(v, true)) },
        texThumb(layer[f.k], 28), h('span', null, layer[f.k] ? prettyName(layer[f.k]) : 'Pick...'), h('span', { class: 'bs-muted bs-small' }, 'Change'));
      return row(f.label, btn, 'col');
    }
    case 'block': {
      const btn = h('button', { type: 'button', class: 'bs-texbtn', onclick: () => blockPicker(layer[f.k], v => { set(v, true); if (layer.name === 'block' || TYPES[layer.type].label === layer.name || layer.nameAuto) { layer.name = prettyName(v); layer.nameAuto = true; app.layersDirty(); } }) },
        texThumb(blockIcon(layer[f.k]), 28), h('span', null, layer[f.k] ? prettyName(layer[f.k]) : 'Pick...'), h('span', { class: 'bs-muted bs-small' }, 'Change'));
      return row(f.label, btn, 'col');
    }
    case 'image': return imageField(app, layer, f);
  }
  return null;
}

export function styleTab(app, layer) {
  const T = TYPES[layer.type];
  const out = h('div', { class: 'bs-fields' });
  for (const f of T.schema) {
    const el = fieldEl(app, layer, f);
    if (el) out.append(el);
  }
  return out;
}

export function placeTab(app, layer) {
  const T = TYPES[layer.type];
  const out = h('div', { class: 'bs-fields' });
  const d = app.doc;
  if (!T.full) {
    const pair = h('div', { class: 'bs-pair' },
      row('X', numIn(layer, 'x', app, -d.w, d.w * 2)),
      row('Y', numIn(layer, 'y', app, -d.h, d.h * 2)));
    out.append(pair,
      h('div', { class: 'bs-btnrow' },
        h('button', { type: 'button', class: 'bs-btn sm ghost', onclick: () => { layer.x = Math.round(d.w / 2); app.changed(true); } }, 'Center X'),
        h('button', { type: 'button', class: 'bs-btn sm ghost', onclick: () => { layer.y = Math.round(d.h / 2); app.changed(true); } }, 'Center Y'),
        h('button', { type: 'button', class: 'bs-btn sm ghost', onclick: () => { layer.x = Math.round(d.w / 2); layer.y = Math.round(d.h / 2); app.changed(true); } }, 'Center both')),
      row('Scale', rangeCtl(() => layer.scale, v => { layer.scale = v; app.changed(); }, 0.05, 6, 0.01)),
      row('Rotation', rangeCtl(() => layer.rot, v => { layer.rot = v; app.changed(); }, -180, 180, 1)));
    const fx = h('input', { type: 'checkbox', checked: !!layer.flipX });
    fx.addEventListener('change', () => { layer.flipX = fx.checked; app.changed(); });
    out.append(h('label', { class: 'bs-check' }, fx, h('span', null, 'Mirror horizontally')));
  }
  out.append(
    row('Opacity', rangeCtl(() => layer.opacity, v => { layer.opacity = v; app.changed(); }, 0, 1, 0.01)),
    row('Blend', selectCtl(BLENDS, layer.blend, v => { layer.blend = v; app.changed(); })));
  return out;
}

function numIn(obj, k, app, min, max) {
  const n = h('input', { type: 'number', class: 'bs-input', value: Math.round(obj[k]), min, max, step: 1, 'data-k': k });
  n.addEventListener('change', () => { obj[k] = Math.round(+n.value || 0); app.changed(); });
  return n;
}

function transitionBlock(app, layer, which) {
  const tr = layer[which];
  const isEnter = which === 'enter';
  const box = h('div', { class: 'bs-sub' });
  box.append(row(isEnter ? 'Enter' : 'Exit', selectCtl(TRANSITIONS, tr.type, v => { tr.type = v; app.changed(true); })));
  if (tr.type !== 'none') {
    box.append(row('Length (ms)', rangeCtl(() => tr.dur, v => { tr.dur = v; app.changed(); }, 50, 4000, 50)));
    if (isEnter) box.append(row('Delay (ms)', rangeCtl(() => tr.delay || 0, v => { tr.delay = v; app.changed(); }, 0, 8000, 50)));
    box.append(row('Easing', selectCtl(EASE_OPTIONS, tr.ease, v => { tr.ease = v; app.changed(); })));
  }
  return box;
}

export function animTab(app, layer) {
  const out = h('div', { class: 'bs-fields' });
  const d = app.doc;
  const sceneOpts = [['', 'Every scene (always on)'], ...d.scenes.map((s, i) => [s.id, `Only ${s.name || 'Scene ' + (i + 1)}`])];
  out.append(row('Shows during', selectCtl(sceneOpts, layer.scene || '', v => { layer.scene = v || null; app.changed(true); app.layersDirty(); })));
  out.append(h('h4', { class: 'bs-h' }, 'Transitions'));
  if (layer.scene) {
    out.append(h('p', { class: 'bs-note' }, 'Enter plays when its scene starts, exit plays right before the scene ends.'),
      transitionBlock(app, layer, 'enter'), transitionBlock(app, layer, 'exit'));
  } else {
    out.append(h('p', { class: 'bs-note' }, 'Always-on layers stay put so the loop is seamless. Pick a scene above to give this layer enter and exit transitions.'));
  }

  out.append(h('h4', { class: 'bs-h' }, 'Looping motion'));
  out.append(h('p', { class: 'bs-note' }, 'Motions repeat a whole number of times per loop, so the GIF loops with no jump.'));
  layer.motion.forEach((m, i) => {
    const def = (MOTIONS.find(x => x[0] === m.type) || [m.type, m.type, {}]);
    const box = h('div', { class: 'bs-sub' + (m.off ? ' off' : '') });
    const head = h('div', { class: 'bs-subhead' }, h('strong', null, def[1]),
      h('label', { class: 'bs-check inline' }, (() => { const c = h('input', { type: 'checkbox', checked: !m.off }); c.addEventListener('change', () => { m.off = !c.checked; app.changed(true); }); return c; })(), h('span', null, 'On')),
      iconBtn('trash', 'Remove motion', () => { layer.motion.splice(i, 1); app.changed(true); }));
    box.append(head);
    if ('amp' in def[2]) {
      const big = ['turn', 'rock', 'walk', 'sway', 'drift', 'orbit', 'float', 'wave', 'jump', 'shake'].includes(m.type);
      const max = m.type === 'rock' || m.type === 'walk' ? 90 : big ? 60 : 1;
      const step = big ? 0.5 : 0.01;
      box.append(row('Amount', rangeCtl(() => m.amp ?? def[2].amp, v => { m.amp = v; app.changed(); }, 0, max, step)));
    }
    box.append(row('Times per loop', rangeCtl(() => m.cycles ?? 1, v => { m.cycles = Math.max(1, Math.round(v)); app.changed(); }, 1, 24, 1)));
    box.append(row('Offset', rangeCtl(() => m.offset || 0, v => { m.offset = v; app.changed(); }, 0, 1, 0.05)));
    const rv = h('input', { type: 'checkbox', checked: !!m.reverse });
    rv.addEventListener('change', () => { m.reverse = rv.checked; app.changed(); });
    box.append(h('label', { class: 'bs-check' }, rv, h('span', null, 'Reverse direction')));
    out.append(box);
  });
  const add = selectCtl([['', '+ Add motion...'], ...MOTIONS.map(m => [m[0], m[1]])], '', v => {
    if (!v) return;
    const def = MOTIONS.find(m => m[0] === v);
    layer.motion.push(Object.assign({ type: v, offset: 0, reverse: false }, JSON.parse(JSON.stringify(def[2]))));
    app.changed(true);
  });
  out.append(add);
  return out;
}

export function fxTab(app, layer) {
  const out = h('div', { class: 'bs-fields' });
  if (!layer.fx.length) out.append(h('p', { class: 'bs-note' }, 'Effects stack on top of the layer: outlines, glow, shine sweeps, the enchanted glint and more.'));
  layer.fx.forEach((fx, i) => {
    const def = FX.find(x => x[0] === fx.type);
    if (!def) return;
    const box = h('div', { class: 'bs-sub' + (fx.off ? ' off' : '') });
    box.append(h('div', { class: 'bs-subhead' }, h('strong', null, def[1]),
      h('label', { class: 'bs-check inline' }, (() => { const c = h('input', { type: 'checkbox', checked: !fx.off }); c.addEventListener('change', () => { fx.off = !c.checked; app.changed(true); }); return c; })(), h('span', null, 'On')),
      i > 0 ? iconBtn('up', 'Move up', () => { layer.fx.splice(i - 1, 0, layer.fx.splice(i, 1)[0]); app.changed(true); }) : null,
      iconBtn('trash', 'Remove effect', () => { layer.fx.splice(i, 1); app.changed(true); })));
    for (const [k, t, label, min, max, step] of FX_FIELDS[fx.type] || []) {
      if (t === 'color') box.append(row(label, colorCtl(fx[k] ?? def[2][k], v => { fx[k] = v; app.changed(); })));
      else box.append(row(label, rangeCtl(() => fx[k] ?? def[2][k], v => { fx[k] = v; app.changed(); }, min, max, step)));
    }
    out.append(box);
  });
  out.append(selectCtl([['', '+ Add effect...'], ...FX.map(f => [f[0], f[1]])], '', v => {
    if (!v) return;
    const def = FX.find(f => f[0] === v);
    layer.fx.push(Object.assign({ type: v }, JSON.parse(JSON.stringify(def[2]))));
    app.changed(true);
  }));
  return out;
}

export function docPanel(app) {
  const d = app.doc;
  const out = h('div', { class: 'bs-fields' });
  const name = h('input', { type: 'text', class: 'bs-input', value: d.name, maxlength: 80 });
  name.addEventListener('input', () => { d.name = name.value; app.changed(); });
  out.append(row('Banner name', name, 'col'));

  const presetOpts = [...PRESETS.map(p => [p.id, `${p.label} (${p.w}x${p.h})`]), ['custom', 'Custom size']];
  const cur = PRESETS.find(p => p.id === d.preset && p.w === d.w && p.h === d.h) ? d.preset : 'custom';
  out.append(row('Size', selectCtl(presetOpts, cur, v => {
    if (v === 'custom') { d.preset = 'custom'; app.changed(true); return; }
    const p = PRESETS.find(x => x.id === v);
    resizeDoc(d, p.w, p.h);
    d.preset = p.id;
    app.changed(true, true);
  }), 'col'));
  const p = PRESETS.find(x => x.id === d.preset);
  if (p && p.note) out.append(h('p', { class: 'bs-note' }, p.note));
  const wIn = h('input', { type: 'number', class: 'bs-input', value: d.w, min: 16, max: 4096 });
  const hIn = h('input', { type: 'number', class: 'bs-input', value: d.h, min: 16, max: 4096 });
  const applySize = () => {
    const w = Math.max(16, Math.min(4096, Math.round(+wIn.value || d.w)));
    const hh = Math.max(16, Math.min(4096, Math.round(+hIn.value || d.h)));
    if (w === d.w && hh === d.h) return;
    resizeDoc(d, w, hh);
    d.preset = 'custom';
    app.changed(true, true);
  };
  wIn.addEventListener('change', applySize);
  hIn.addEventListener('change', applySize);
  out.append(h('div', { class: 'bs-pair' }, row('Width', wIn), row('Height', hIn)));

  out.append(row('Frame rate', selectCtl(FPS_OPTIONS, d.fps, v => { d.fps = v; app.changed(true); })));
  const loop = loopMs(d);
  out.append(h('p', { class: 'bs-note' }, `Loop is ${(loop / 1000).toFixed(1)}s, ${frameCount(d)} frames. Change scene lengths in the timeline.`));

  out.append(h('h4', { class: 'bs-h' }, 'Canvas'));
  out.append(row('Base color', colorCtl(d.bg, v => { d.bg = v; app.changed(); })));
  const tr = h('input', { type: 'checkbox', checked: !!d.transparent });
  tr.addEventListener('change', () => { d.transparent = tr.checked; app.changed(true); });
  out.append(h('label', { class: 'bs-check' }, tr, h('span', null, 'Transparent background (GIF keeps hard edges only)')));
  out.append(row('Corner rounding', rangeCtl(() => d.corner || 0, v => { d.corner = v; app.changed(); }, 0, Math.round(Math.min(d.w, d.h) / 2), 1)));
  out.append(h('p', { class: 'bs-note' }, 'Tip: click anything on the canvas to edit it. Drag to move, drag a corner to resize, drag the top dot to rotate. Hold Alt to turn off snapping.'));
  return out;
}

export function layerHeader(app, layer) {
  const T = TYPES[layer.type];
  const name = h('input', { type: 'text', class: 'bs-input bs-lname', value: layer.name, maxlength: 60, 'aria-label': 'Layer name' });
  name.addEventListener('input', () => { layer.name = name.value; layer.nameAuto = false; app.changed(); app.layersDirty(); });
  return h('div', { class: 'bs-lhead' }, h('span', { class: 'bs-tag' }, T.label), name);
}
