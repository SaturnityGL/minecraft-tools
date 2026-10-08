import { createDoc } from './doc.js';
import { SIZE, PARTS, LAYERS, faceRect, mirrorPart } from './skinmap.js';
import { createView3D } from './view3d.js';
import { createView2D } from './view2d.js';
import { importSkin } from './io.js';
import { extractPart, applyPart } from './parts.js';
import { paletteFromSkin } from './recolor.js';
import { clipboard } from './select.js';
import { newId } from './store.js';
import { h, button, pixelCanvas, piecePixels, scaleNearest, ago, PART_LABELS } from './ui-dom.js';

const LIMBS = new Set(['rightArm', 'leftArm', 'rightLeg', 'leftLeg']);
const LAYER_CHOICES = { both: LAYERS, body: ['body'], outer: ['outer'] };

function partSelect(label) {
  return h('select', { 'aria-label': label }, PARTS.map(p => h('option', { value: p, text: PART_LABELS[p] })));
}

function layerSelect() {
  return h('select', { 'aria-label': 'Layers to take' },
    h('option', { value: 'both', text: 'Body and outer layer' }),
    h('option', { value: 'body', text: 'Body layer only' }),
    h('option', { value: 'outer', text: 'Outer layer only' }));
}

function skinTone(pixels, model) {
  const r = faceRect('head', 'body', 'front', model);
  const masked = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = r.y; y < r.y + r.h; y++) {
    const start = (y * SIZE + r.x) * 4;
    masked.set(pixels.subarray(start, start + r.w * 4), start);
  }
  return paletteFromSkin(masked, 1)[0] || null;
}

export function initDonor(ed) {
  const { doc, store, select } = ed;
  const donorRoot = document.getElementById('drawer-donor');
  const shelfRoot = document.getElementById('drawer-parts');

  function describe(part, mirrored) {
    return mirrored ? `${PART_LABELS[part]} applied to the ${PART_LABELS[mirrorPart(part)].toLowerCase()}, mirrored.` : `${PART_LABELS[part]} applied.`;
  }

  function applyPiece(piece, mirrored, layers) {
    ed.finishStroke();
    select.clear();
    const target = mirrored ? mirrorPart(piece.part) : piece.part;
    const changed = applyPart(doc, piece, target, layers ? { layers } : undefined);
    ed.setStatus(changed ? `${describe(piece.part, mirrored)} Undo brings the old one back.` : 'That part already looks the same.');
  }

  const shelfList = h('div', { class: 'card-list' });
  const shelfPart = partSelect('Part to save');
  const shelfLayers = layerSelect();

  async function savePiece(piece, name) {
    if (!store.available) {
      ed.setStatus('The parts shelf needs browser storage, which is blocked here.');
      return;
    }
    const ok = await store.parts.put({ id: newId(), name: name.slice(0, 40), created: Date.now(), piece });
    ed.setStatus(ok ? 'Saved to the parts shelf.' : 'The part could not be saved.');
    renderShelf();
  }

  function renameInline(title, entry) {
    const input = h('input', { type: 'text', class: 'text-input', maxlength: '40', value: entry.name, 'aria-label': 'New name' });
    let done = false;
    const finish = async keep => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      if (keep && next && next !== entry.name) await store.parts.put({ ...entry, name: next });
      renderShelf();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    title.replaceWith(input);
    input.focus();
    input.select();
  }

  async function renderShelf() {
    if (!store.available) {
      shelfList.replaceChildren(h('p', { class: 'empty-note', text: 'The parts shelf is not available because this browser is blocking storage.' }));
      return;
    }
    const entries = await store.parts.list();
    shelfList.replaceChildren();
    if (entries.length === 0) {
      shelfList.append(h('p', { class: 'empty-note', text: 'Nothing saved yet. Save a head, a jacket or a pair of legs here and reuse it on any skin.' }));
      return;
    }
    for (const entry of entries) {
      const piece = entry.piece;
      const title = h('strong', { text: entry.name, title: entry.name });
      shelfList.append(h('div', { class: 'card' },
        h('div', { class: 'thumb' }, pixelCanvas(scaleNearest(piecePixels(piece), 4))),
        h('div', { class: 'meta' },
          title,
          h('span', { text: `${PART_LABELS[piece.part]}, ${Object.keys(piece.layers).join(' + ')}, ${ago(entry.created)}` }),
          h('div', { class: 'row' },
            button('Apply', () => applyPiece(piece, false)),
            LIMBS.has(piece.part) ? button('Other side', () => applyPiece(piece, true), { title: 'Apply to the opposite arm or leg, mirrored' }) : null,
            button('Rename', () => renameInline(title, entry)),
            button('Delete', async () => {
              await store.parts.remove(entry.id);
              renderShelf();
            }, { class: 'sk-btn small danger' })))));
    }
  }

  shelfRoot.append(
    h('div', { class: 'row', style: 'margin-bottom:12px' },
      h('h3', { text: 'Save from this skin', style: 'margin:0' }),
      shelfPart,
      shelfLayers,
      button('Save part', () => {
        ed.finishStroke();
        select.commit();
        const part = shelfPart.value;
        savePiece(extractPart(doc.pixels, part, LAYER_CHOICES[shelfLayers.value], doc.model), `${doc.name} ${PART_LABELS[part].toLowerCase()}`);
      })),
    shelfList);

  document.getElementById('tab-parts').addEventListener('click', () => queueMicrotask(() => {
    if (ed.drawer.active === 'parts') renderShelf();
  }));

  const donorState = {
    grid: false,
    layer: 'body',
    show: { body: true, outer: true },
    partVisible: { head: true, torso: true, rightArm: true, leftArm: true, rightLeg: true, leftLeg: true },
    pose: 'stand',
    backdrop: 'dark'
  };
  const donor = createDoc({ model: 'classic', name: 'Donor' });
  let loaded = false;
  let myTone = null;

  const canvas3 = h('canvas', { 'aria-label': 'Donor skin in 3D. Click a part to choose it, drag to rotate.', role: 'img' });
  const canvas2 = h('canvas', { class: 'flat', 'aria-label': 'Donor skin texture. Drag a box to copy an area.', role: 'img' });
  const views = h('div', { class: 'donor-views', hidden: true }, canvas3, canvas2);
  const fileInput = h('input', { type: 'file', accept: 'image/png', hidden: true });
  const info = h('p', { class: 'empty-note', text: 'Open a second skin here to borrow its head, jacket, arms or legs. Your own skin is not changed until you press Apply.' });
  const part = partSelect('Part to take');
  const layers = layerSelect();
  const side = h('select', { 'aria-label': 'Where to put it' },
    h('option', { value: 'same', text: 'Onto the same part' }),
    h('option', { value: 'mirror', text: 'Onto the opposite side, mirrored' }));
  const controls = h('div', { class: 'col', hidden: true });
  const pasteBtn = button('Paste copied area onto my skin', () => {
    ed.finishStroke();
    ed.setTool('select');
    select.paste(copiedAt);
  });
  pasteBtn.disabled = true;
  let copiedAt = null;

  let view3 = null;
  let view2 = null;

  function ensureViews() {
    if (view2) return;
    views.hidden = false;
    controls.hidden = false;
    try {
      view3 = createView3D(canvas3, { doc: donor, state: donorState });
    } catch (err) {
      canvas3.hidden = true;
    }
    view2 = createView2D(canvas2, { doc: donor, state: donorState });
    const observer = new ResizeObserver(() => {
      if (view3) view3.resize();
      view2.resize();
    });
    observer.observe(canvas3);
    observer.observe(canvas2);
    wire3d();
    wire2d();
  }

  function syncSide() {
    const limb = LIMBS.has(part.value);
    side.disabled = !limb;
    if (!limb) side.value = 'same';
  }

  function wire3d() {
    if (!view3) return;
    let last = null;
    let travelled = 0;
    canvas3.addEventListener('pointerdown', e => {
      canvas3.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
      travelled = 0;
    });
    canvas3.addEventListener('pointermove', e => {
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      travelled += Math.abs(dx) + Math.abs(dy);
      last = { x: e.clientX, y: e.clientY };
      view3.orbit.rotate(dx, dy);
    });
    const release = e => {
      if (!last) return;
      last = null;
      if (travelled > 5 || e.type !== 'pointerup') return;
      const hit = view3.pick(e.clientX, e.clientY);
      if (hit && hit.face) {
        part.value = hit.face.part;
        syncSide();
      }
    };
    canvas3.addEventListener('pointerup', release);
    canvas3.addEventListener('pointercancel', release);
    canvas3.addEventListener('wheel', e => {
      e.preventDefault();
      view3.orbit.zoom(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY);
    }, { passive: false });
  }

  function wire2d() {
    let start = null;
    let rect = null;
    const at = e => {
      const t = view2.texel(e.clientX, e.clientY);
      if (!t) return null;
      return { x: Math.min(SIZE - 1, Math.max(0, t.x)), y: Math.min(SIZE - 1, Math.max(0, t.y)) };
    };
    canvas2.addEventListener('pointerdown', e => {
      const p = at(e);
      if (!p) return;
      canvas2.setPointerCapture(e.pointerId);
      start = p;
      rect = { x: p.x, y: p.y, w: 1, h: 1 };
      view2.setSelection(rect);
    });
    canvas2.addEventListener('pointermove', e => {
      if (!start) return;
      const p = at(e);
      if (!p) return;
      rect = {
        x: Math.min(start.x, p.x),
        y: Math.min(start.y, p.y),
        w: Math.abs(p.x - start.x) + 1,
        h: Math.abs(p.y - start.y) + 1
      };
      view2.setSelection(rect);
    });
    const release = () => {
      if (!start) return;
      start = null;
      if (!rect || rect.w * rect.h < 2) {
        view2.setSelection(null);
        return;
      }
      const pixels = new Uint8ClampedArray(rect.w * rect.h * 4);
      for (let y = 0; y < rect.h; y++) {
        const from = ((rect.y + y) * SIZE + rect.x) * 4;
        pixels.set(donor.pixels.subarray(from, from + rect.w * 4), y * rect.w * 4);
      }
      clipboard.piece = { w: rect.w, h: rect.h, pixels };
      copiedAt = { x: rect.x, y: rect.y };
      pasteBtn.disabled = false;
      ed.emit('selection');
      ed.setStatus(`Copied ${rect.w} by ${rect.h} pixels from the donor. Paste them with the button or Ctrl+V.`);
    };
    canvas2.addEventListener('pointerup', release);
    canvas2.addEventListener('pointercancel', release);
  }

  async function loadDonor(file) {
    if (!file) return;
    try {
      const result = await importSkin(file);
      ensureViews();
      donor.load(result.pixels, { model: result.model, name: file.name.replace(/\.png$/i, '') });
      if (view3) view3.rebuild();
      loaded = true;
      myTone = skinTone(doc.pixels, doc.model);
      info.textContent = `Donor: ${donor.name} (${donor.model} arms). Click a part on the model or pick one below. Drag a box on the flat texture to copy any area.`;
      queueMicrotask(() => {
        if (view3) view3.resize();
        view2.resize();
      });
    } catch (err) {
      ed.setStatus(err.message);
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    loadDonor(file);
  });
  donorRoot.addEventListener('dragover', e => e.preventDefault());
  donorRoot.addEventListener('drop', e => {
    e.preventDefault();
    loadDonor(e.dataTransfer.files[0]);
  });
  part.addEventListener('change', syncSide);

  function donorPiece() {
    return extractPart(donor.pixels, part.value, LAYER_CHOICES[layers.value], donor.model);
  }

  controls.append(
    h('div', { class: 'row' }, part, layers),
    side,
    h('div', { class: 'row' },
      button('Apply to my skin', () => applyPiece(donorPiece(), side.value === 'mirror', LAYER_CHOICES[layers.value]), { class: 'sk-btn small primary' }),
      button('Save to shelf', () => savePiece(donorPiece(), `${donor.name} ${PART_LABELS[part.value].toLowerCase()}`))),
    pasteBtn,
    button('Match skin tone', () => {
      const theirs = skinTone(donor.pixels, donor.model);
      if (!theirs || !myTone) {
        ed.setStatus('Could not find a skin tone to match. Both faces need solid pixels.');
        return;
      }
      ed.recolorWith(theirs, myTone);
      ed.setStatus('Recolor is set up in the Color panel: donor skin tone becomes yours. Check the preview, then press Apply there.');
    }, { title: 'After borrowing parts, recolor the donor skin tone to the tone your skin had when the donor was opened' }));

  donorRoot.append(
    h('div', { class: 'drawer-cols' },
      views,
      h('div', { class: 'donor-controls' },
        info,
        h('div', { class: 'row' }, button('Open donor skin', () => fileInput.click()), fileInput),
        controls)));
  syncSide();

  document.getElementById('tab-donor').addEventListener('click', () => queueMicrotask(() => {
    if (ed.drawer.active !== 'donor' || !view2) return;
    if (view3) view3.resize();
    view2.resize();
  }));

  ed.onFrame(() => {
    if (!loaded || ed.drawer.active !== 'donor') return;
    if (view3) view3.render();
    view2.render();
  });
}
