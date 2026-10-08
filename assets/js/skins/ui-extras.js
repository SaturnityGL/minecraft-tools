import { SIZE } from './skinmap.js';
import { check, fixTransparent, clearStray } from './checker.js';
import { createView3D } from './view3d.js';
import { encodePng } from './png.js';
import { downloadBlob } from './io.js';
import { h, button, headPixels, scaleNearest, fileSafe } from './ui-dom.js';

const AVATAR_SIZES = [64, 128, 256, 512];
const SHORTCUTS = [
  ['B', 'Pencil'],
  ['E', 'Eraser'],
  ['N', 'Auto-tone brush'],
  ['U', 'Blend brush'],
  ['H', 'Shade brush'],
  ['G', 'Fill bucket'],
  ['I', 'Pick a color (or hold Alt with any tool)'],
  ['M', 'Select box'],
  ['X', 'Switch between body and outer layer'],
  ['S', 'Mirror painting on or off'],
  ['L', 'Pixel grid on or off'],
  ['[ and ]', 'Smaller or larger brush'],
  ['Tab', 'Cycle 3D, flat and split view'],
  ['0', 'Reset the camera'],
  ['Ctrl+Z', 'Undo'],
  ['Ctrl+Y or Ctrl+Shift+Z', 'Redo'],
  ['Ctrl+C, X, V', 'Copy, cut and paste the selection'],
  ['Ctrl+A', 'Select the whole texture'],
  ['Arrow keys', 'Nudge the selection one pixel'],
  ['Delete', 'Erase inside the selection'],
  ['Enter', 'Place a moved or pasted selection'],
  ['Esc', 'Cancel or clear the selection'],
  ['?', 'Show this list']
];

function mask(points) {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (const p of points) {
    const i = (p.y * SIZE + p.x) * 4;
    out[i] = 255;
    out[i + 1] = 60;
    out[i + 2] = 200;
    out[i + 3] = 255;
  }
  return out;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function initExtras(ed) {
  const { doc, state, view3d, select } = ed;

  const checkRoot = document.getElementById('drawer-check');
  const checkList = h('ul', { class: 'check-list' });
  const fixBtn = button('Fill see-through body pixels', () => {
    ed.finishStroke();
    select.commit();
    const result = fixTransparent(doc.pixels, doc.model);
    doc.replaceAll(result.pixels, { model: doc.model });
    ed.setStatus(result.remaining.length
      ? `Filled what could be filled. ${plural(result.remaining.length, 'pixel')} had no painted neighbour to copy, so paint those by hand.`
      : 'See-through body pixels filled from their nearest neighbours. Undo brings them back.');
  });
  const strayBtn = button('Clear stray pixels', () => {
    ed.finishStroke();
    select.commit();
    doc.replaceAll(clearStray(doc.pixels, doc.model), { model: doc.model });
    ed.setStatus('Stray pixels cleared.');
  });
  const showBox = h('input', { type: 'checkbox', id: 'check-show', checked: true });
  let lastResult = null;

  function runCheck() {
    lastResult = check(doc.pixels, doc.model);
    const { transparentBody, strayPixels } = lastResult;
    checkList.replaceChildren();
    if (transparentBody.length === 0 && strayPixels.length === 0) {
      checkList.append(h('li', { class: 'check-ok', text: 'No problems found. This skin is ready to upload.' }));
    } else {
      if (transparentBody.length) {
        checkList.append(h('li', { text: `${plural(transparentBody.length, 'body pixel')} see-through. Minecraft draws these black, so they usually look like holes.` }));
      }
      if (strayPixels.length) {
        checkList.append(h('li', { text: `${plural(strayPixels.length, 'pixel')} sitting in unused texture space. Harmless in game, but some sites reject them.` }));
      }
    }
    fixBtn.disabled = transparentBody.length === 0;
    strayBtn.disabled = strayPixels.length === 0;
    syncHighlight();
    return lastResult;
  }

  function syncHighlight() {
    const on = ed.drawer.active === 'check' && showBox.checked && lastResult;
    const points = on ? [...lastResult.transparentBody, ...lastResult.strayPixels] : [];
    ed.setHighlight('check', points.length ? mask(points) : null);
  }

  checkRoot.append(
    checkList,
    h('div', { class: 'row' },
      fixBtn,
      strayBtn,
      h('label', { class: 'row', for: 'check-show' }, showBox, h('span', { text: 'Highlight on the skin' }))));

  let checkTimer = null;
  doc.on('change', () => {
    if (ed.drawer.active !== 'check') return;
    clearTimeout(checkTimer);
    checkTimer = setTimeout(runCheck, 200);
  });
  showBox.addEventListener('change', syncHighlight);
  for (const tab of document.querySelectorAll('.drawer-tabs button')) {
    tab.addEventListener('click', () => queueMicrotask(() => {
      if (ed.drawer.active === 'check') runCheck();
      else syncHighlight();
    }));
  }
  ed.on('downloaded', () => {
    const result = check(doc.pixels, doc.model);
    if (result.transparentBody.length) {
      ed.setStatus(`Downloaded. Heads up: ${plural(result.transparentBody.length, 'body pixel')} see-through and will show black in game. The Check tab can fill them.`);
    }
  });

  const inset = document.getElementById('inset');
  const insetBtn = document.getElementById('inset-btn');
  let insetView = null;
  let insetVersion = -1;
  let insetKey = '';

  function setInset(on) {
    if (on && !insetView) {
      const insetState = Object.create(state);
      insetState.grid = false;
      try {
        insetView = createView3D(document.getElementById('inset-canvas'), { doc, state: insetState });
      } catch (err) {
        ed.setStatus(`The preview could not start: ${err.message}`);
        return;
      }
    }
    inset.hidden = !on;
    insetBtn.setAttribute('aria-pressed', String(on));
    insetBtn.textContent = on ? 'Hide actual-size preview' : 'Show actual-size preview';
    if (on) {
      insetView.resize();
      insetVersion = -1;
    }
    if (ed.store && ed.store.available) ed.store.prefs.set('inset', on);
  }

  insetBtn.addEventListener('click', () => {
    setInset(inset.hidden);
    ed.closeMenus(true);
  });
  ed.onFrame(() => {
    if (!insetView || inset.hidden) return;
    const key = `${state.pose}|${state.backdrop}|${state.show.body}|${state.show.outer}|${Object.values(state.partVisible).join('')}|${doc.model}`;
    if (doc.version === insetVersion && key === insetKey) return;
    insetVersion = doc.version;
    insetKey = key;
    insetView.render();
  });
  if (ed.store && ed.store.available && ed.store.prefs.get('inset', false) && view3d) setInset(true);

  const renderMenu = document.getElementById('render-menu');
  const avatarSize = h('select', { 'aria-label': 'Avatar size' }, AVATAR_SIZES.map(s => h('option', { value: String(s), text: `${s} px`, selected: s === 256 })));

  async function saveAvatar() {
    const size = Number(avatarSize.value);
    const head = headPixels(doc.pixels, doc.model);
    const image = scaleNearest(head, size / head.w);
    const bytes = await encodePng(image.data, image.w, image.h);
    downloadBlob(new Blob([bytes], { type: 'image/png' }), `${fileSafe(doc.name)}-head-${size}.png`);
    ed.closeMenus(true);
  }

  async function saveBody() {
    if (!view3d) {
      ed.setStatus('The full body render needs the 3D view, which is not available in this browser.');
      return;
    }
    try {
      const blob = await view3d.renderToBlob({ width: 600, height: 900 });
      downloadBlob(blob, `${fileSafe(doc.name)}-render.png`);
    } catch (err) {
      ed.setStatus(err.message);
    }
    ed.closeMenus(true);
  }

  renderMenu.append(
    h('p', { class: 'menu-note', text: 'Save a picture of the skin for a profile, a thumbnail or a server list.' }),
    h('div', { class: 'row' }, avatarSize, button('Head avatar', saveAvatar)),
    button('Full body, current pose and angle', saveBody, { class: 'sk-btn' }),
    h('p', { class: 'menu-note', text: 'The full body render has a clear background.' }));

  const viewport = ed.viewport;
  const refInput = document.getElementById('reference-input');
  let reference = null;

  function removeReference() {
    if (!reference) return;
    reference.remove();
    reference = null;
  }

  async function addReference(file) {
    if (!file) return;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (err) {
      ed.setStatus('That file could not be read as an image.');
      return;
    }
    removeReference();
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = h('canvas', {
      width: Math.max(1, Math.round(bitmap.width * scale)),
      height: Math.max(1, Math.round(bitmap.height * scale)),
      role: 'img',
      'aria-label': 'Reference image. Click it to pick a color.',
      title: 'Click to pick a color'
    });
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const opacity = h('input', { type: 'range', min: '20', max: '100', value: '100', 'aria-label': 'Reference opacity' });
    const bar = h('div', { class: 'reference-bar' },
      h('span', { text: 'Reference' }),
      opacity,
      h('button', { type: 'button', class: 'link-btn', text: 'Close', onclick: removeReference }));
    reference = h('div', { class: 'reference is-sampling' }, bar, canvas);
    opacity.addEventListener('input', () => {
      canvas.style.opacity = String(Number(opacity.value) / 100);
    });
    opacity.addEventListener('pointerdown', e => e.stopPropagation());
    canvas.addEventListener('click', e => {
      const r = canvas.getBoundingClientRect();
      const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * canvas.width)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * canvas.height)));
      const px = g.getImageData(x, y, 1, 1).data;
      if (px[3] === 0) return;
      ed.setColor([px[0], px[1], px[2], 255]);
      ed.setStatus('Color picked from the reference image.');
    });
    let drag = null;
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('button, input')) return;
      bar.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, left: reference.offsetLeft, top: reference.offsetTop };
    });
    bar.addEventListener('pointermove', e => {
      if (!drag) return;
      const maxLeft = Math.max(0, viewport.clientWidth - 60);
      const maxTop = Math.max(0, viewport.clientHeight - 30);
      reference.style.left = `${Math.min(maxLeft, Math.max(0, drag.left + e.clientX - drag.x))}px`;
      reference.style.top = `${Math.min(maxTop, Math.max(0, drag.top + e.clientY - drag.y))}px`;
    });
    const stop = () => { drag = null; };
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
    for (const type of ['pointerdown', 'wheel']) reference.addEventListener(type, e => e.stopPropagation());
    viewport.append(reference);
    ed.setStatus('Reference added. Drag its bar to move it, drag its corner to resize, click it to pick a color. It is not saved with the skin.');
  }

  document.getElementById('reference-btn').addEventListener('click', () => {
    ed.closeMenus(false);
    refInput.click();
  });
  refInput.addEventListener('change', () => {
    const file = refInput.files[0];
    refInput.value = '';
    addReference(file);
  });

  const dialog = document.getElementById('shortcuts-dialog');
  const list = document.getElementById('shortcuts-list');
  for (const [keys, what] of SHORTCUTS) list.append(h('kbd', { text: keys }), h('span', { text: what }));

  function showShortcuts() {
    ed.closeMenus(false);
    if (!dialog.open) dialog.showModal();
  }
  document.getElementById('shortcuts-btn').addEventListener('click', showShortcuts);
  ed.on('shortcuts', showShortcuts);
}
