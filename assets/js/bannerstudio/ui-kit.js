import { texture, textureNames, blockIds, blockIcon, prettyName } from './assets.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
export const ICONS = {
  eye: `<svg viewBox="0 0 24 24" ${P}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" ${P}><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" ${P}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  unlock: `<svg viewBox="0 0 24 24" ${P}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.2"/></svg>`,
  up: `<svg viewBox="0 0 24 24" ${P}><path d="M6 15l6-6 6 6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" ${P}><path d="M6 9l6 6 6-6"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" ${P}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${P}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" ${P}><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" ${P}><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>`,
  x: `<svg viewBox="0 0 24 24" ${P}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${P}><path d="M12 5v14M5 12h14"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" ${P}><path d="M15 6l-6 6 6 6"/></svg>`,
  next: `<svg viewBox="0 0 24 24" ${P}><path d="M9 6l6 6-6 6"/></svg>`,
};

export function iconBtn(name, title, onclick, extra = {}) {
  return h('button', Object.assign({ type: 'button', class: 'bs-ib', title, 'aria-label': title, html: ICONS[name], onclick }, extra));
}

export function drawTex(canvas, name) {
  const x = canvas.getContext('2d');
  x.clearRect(0, 0, canvas.width, canvas.height);
  const img = name && texture(name, 0);
  if (!img) return;
  x.imageSmoothingEnabled = false;
  const sw = img.width, sh = Math.min(img.height, img.width);
  x.drawImage(img, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
}

export function texThumb(name, size = 28) {
  const c = h('canvas', { width: size, height: size, class: 'bs-tex' });
  drawTex(c, name);
  return c;
}

let modalOpen = null;

export function modal(title, body, opts = {}) {
  closeModal();
  const close = () => closeModal();
  const box = h('div', { class: 'bs-modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'bs-modal-head' }, h('h2', null, title), iconBtn('x', 'Close', close)),
    h('div', { class: 'bs-modal-body' }, body));
  const back = h('div', { class: 'bs-backdrop', onclick: e => { if (e.target === back && !opts.sticky) close(); } }, box);
  const onKey = e => { if (e.key === 'Escape' && !opts.sticky) close(); };
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  modalOpen = { back, onKey, onClose: opts.onClose };
  const first = box.querySelector('input,select,button:not(.bs-ib)');
  if (first && opts.focus !== false) first.focus();
  return { box, close };
}

export function closeModal() {
  if (!modalOpen) return;
  const m = modalOpen;
  modalOpen = null;
  document.removeEventListener('keydown', m.onKey);
  m.back.remove();
  if (m.onClose) m.onClose();
}

export function isModalOpen() {
  return !!modalOpen;
}

export function picker(title, items, onPick, current) {
  const search = h('input', { type: 'search', class: 'bs-input', placeholder: 'Search ' + items.length + ' items', autocomplete: 'off' });
  const grid = h('div', { class: 'bs-pick-grid' });
  const count = h('div', { class: 'bs-muted bs-small' });
  const LIMIT = 300;
  const fill = () => {
    const q = search.value.trim().toLowerCase().replace(/\s+/g, '_');
    const list = q ? items.filter(it => it.id.toLowerCase().includes(q) || it.label.toLowerCase().replace(/\s+/g, '_').includes(q)) : items;
    grid.textContent = '';
    for (const it of list.slice(0, LIMIT)) {
      grid.append(h('button', { type: 'button', class: 'bs-pick' + (it.id === current ? ' on' : ''), title: it.label, onclick: () => { onPick(it.id); closeModal(); } },
        texThumb(it.tex, 32), h('span', null, it.label)));
    }
    count.textContent = list.length > LIMIT ? `Showing ${LIMIT} of ${list.length}. Search to narrow it down.` : `${list.length} found`;
  };
  search.addEventListener('input', fill);
  fill();
  modal(title, [search, count, grid], { wide: true });
}

export function texturePicker(prefix, current, onPick) {
  const names = textureNames(prefix);
  const items = names.map(n => ({ id: n, label: prettyName(n), tex: n }));
  picker(prefix === 'item/' ? 'Pick an item' : 'Pick a texture', items, onPick, current);
}

export function blockPicker(current, onPick) {
  const items = blockIds().map(id => ({ id, label: prettyName(id), tex: blockIcon(id) }));
  picker('Pick a block', items, onPick, current);
}

export function readFile(accept, asText = false) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, size: f.size, data: r.result });
      r.onerror = () => resolve(null);
      if (asText) r.readAsText(f); else r.readAsDataURL(f);
    });
    document.body.append(inp);
    inp.click();
  });
}

export function toast(msg, kind = '') {
  let wrap = document.querySelector('.bs-toasts');
  if (!wrap) {
    wrap = h('div', { class: 'bs-toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(wrap);
  }
  const t = h('div', { class: 'bs-toast ' + kind }, msg);
  wrap.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
