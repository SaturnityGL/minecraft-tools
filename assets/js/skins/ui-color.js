import { paletteFromSkin, recolor } from './recolor.js';
import { partRegion, PARTS, LAYERS } from './skinmap.js';
import { h, button, swatch, hex, PART_LABELS } from './ui-dom.js';

const RECENT_MAX = 16;
const PINNED_MAX = 32;
const SKIN_MAX = 24;

function same(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function clean(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(c => Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every(v => Number.isInteger(v) && v >= 0 && v <= 255))
    .map(c => [c[0], c[1], c[2]]);
}

export function initColor(ed) {
  const { doc, state, store, select } = ed;
  const root = document.getElementById('palette');
  let recent = clean(store.prefs.get('recentColors', [])).slice(0, RECENT_MAX);
  let pinned = clean(store.prefs.get('pinnedColors', [])).slice(0, PINNED_MAX);
  let dragIndex = -1;

  const pinnedRow = h('div', { class: 'swatch-row', role: 'group', 'aria-label': 'Pinned colors' });
  const recentRow = h('div', { class: 'swatch-row', role: 'group', 'aria-label': 'Recent colors' });
  const skinRow = h('div', { class: 'swatch-row', role: 'group', 'aria-label': 'Colors used in this skin' });

  function savePinned() {
    store.prefs.set('pinnedColors', pinned);
  }

  function movePinned(from, to) {
    if (to < 0 || to >= pinned.length || from === to) return;
    const [c] = pinned.splice(from, 1);
    pinned.splice(to, 0, c);
    savePinned();
    renderPinned();
    const next = pinnedRow.children[to];
    if (next) next.focus();
  }

  function renderPinned() {
    pinnedRow.replaceChildren();
    if (pinned.length === 0) {
      pinnedRow.append(h('span', { class: 'empty-note', text: 'Pin colors you want to keep handy.' }));
      return;
    }
    pinned.forEach((c, i) => {
      const el = swatch(c, {
        title: `${hex(c)}. Click to use. Right-click or Shift+click removes it. Drag or Alt+arrow keys reorder.`,
        draggable: true,
        onclick: e => {
          if (e.shiftKey) {
            pinned.splice(i, 1);
            savePinned();
            renderPinned();
          } else ed.setColor(c);
        },
        oncontextmenu: e => {
          e.preventDefault();
          pinned.splice(i, 1);
          savePinned();
          renderPinned();
        },
        onkeydown: e => {
          if (!e.altKey) return;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            movePinned(i, i - 1);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            movePinned(i, i + 1);
          }
        },
        ondragstart: e => {
          dragIndex = i;
          el.classList.add('is-drag');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', hex(c));
        },
        ondragend: () => {
          dragIndex = -1;
          el.classList.remove('is-drag');
        },
        ondragover: e => {
          if (dragIndex >= 0) e.preventDefault();
        },
        ondrop: e => {
          e.preventDefault();
          const from = dragIndex;
          dragIndex = -1;
          if (from >= 0) movePinned(from, i);
        }
      });
      pinnedRow.append(el);
    });
  }

  function renderRecent() {
    recentRow.replaceChildren();
    if (recent.length === 0) {
      recentRow.append(h('span', { class: 'empty-note', text: 'Colors you paint with show up here.' }));
      return;
    }
    for (const c of recent) recentRow.append(swatch(c, { onclick: () => ed.setColor(c) }));
  }

  function renderSkin() {
    skinRow.replaceChildren();
    const colors = paletteFromSkin(doc.pixels, SKIN_MAX);
    for (const c of colors) {
      skinRow.append(swatch(c, {
        title: `${hex(c)}. Click to use. Shift+click sets it as the recolor source.`,
        onclick: e => {
          if (e.shiftKey) setSource(c);
          else ed.setColor(c);
        }
      }));
    }
  }

  function pinCurrent() {
    const c = [state.color[0], state.color[1], state.color[2]];
    if (pinned.some(p => same(p, c))) {
      ed.setStatus('That color is already pinned.');
      return;
    }
    if (pinned.length >= PINNED_MAX) {
      ed.setStatus(`You can pin up to ${PINNED_MAX} colors. Remove one first.`);
      return;
    }
    pinned.push(c);
    savePinned();
    renderPinned();
  }

  ed.on('color-used', color => {
    const c = [color[0], color[1], color[2]];
    recent = [c, ...recent.filter(r => !same(r, c))].slice(0, RECENT_MAX);
    store.prefs.set('recentColors', recent);
    renderRecent();
  });

  let source = null;
  let target = null;
  const sourceBtn = h('button', { type: 'button', class: 'swatch big', 'aria-label': 'Color to replace', title: 'Color to replace. Click, then click a pixel on the skin.' });
  const targetBtn = h('button', { type: 'button', class: 'swatch big', 'aria-label': 'New color', title: 'New color. Click to use the current color.' });
  const tolerance = h('input', { type: 'range', min: '0', max: '100', value: '20', 'aria-label': 'Tolerance' });
  const toleranceOut = h('output', { text: '20' });
  const scope = h('select', { 'aria-label': 'Where to recolor' },
    h('option', { value: 'all', text: 'Whole skin' }),
    h('option', { value: 'selection', text: 'Selection only' }),
    PARTS.map(p => h('option', { value: p, text: `${PART_LABELS[p]} only` })));
  const layerScope = h('select', { 'aria-label': 'Layers to recolor' },
    h('option', { value: 'both', text: 'Both layers' }),
    h('option', { value: 'active', text: 'Painting layer only' }));
  const applyBtn = button('Apply', applyRecolor, { class: 'sk-btn small primary' });
  const fold = h('details', { class: 'fold' },
    h('summary', { text: 'Replace a color' }),
    h('div', { class: 'fold-body' },
      h('div', { class: 'recolor-pair' },
        sourceBtn,
        h('span', { class: 'arrow', text: 'becomes' }),
        targetBtn),
      h('div', { class: 'row' },
        button('Pick on skin', pickSource),
        button('From: current', () => setSource(state.color)),
        button('To: current', () => setTarget(state.color))),
      h('div', { class: 'slider-row' }, h('span', { text: 'Similar shades' }), tolerance, toleranceOut),
      scope,
      layerScope,
      h('div', { class: 'row' }, applyBtn, button('Clear', clearRecolor)),
      h('p', { class: 'empty-note', text: 'The model shows a live preview. Similar shades keep their shading, so a whole outfit can change color at once.' })));

  function paintPair() {
    sourceBtn.style.background = source ? hex(source) : 'none';
    targetBtn.style.background = target ? hex(target) : 'none';
    applyBtn.disabled = !source || !target;
  }

  function region() {
    const layers = layerScope.value === 'active' ? [state.layer] : LAYERS;
    if (scope.value === 'selection') return select.rect ? [select.rect] : [];
    if (scope.value === 'all') {
      if (layers.length === LAYERS.length) return null;
      return PARTS.flatMap(p => layers.flatMap(l => partRegion(p, l, doc.model)));
    }
    return layers.flatMap(l => partRegion(scope.value, l, doc.model));
  }

  function compute() {
    if (!source || !target) return null;
    return recolor(doc.pixels, { source, target, tolerance: Number(tolerance.value), region: region() });
  }

  function preview() {
    layerScope.disabled = scope.value === 'selection';
    ed.setPreview('recolor', fold.open && !select.floating ? compute() : null);
  }

  function setSource(c) {
    source = [c[0], c[1], c[2]];
    fold.open = true;
    paintPair();
    preview();
  }

  function setTarget(c) {
    target = [c[0], c[1], c[2]];
    fold.open = true;
    paintPair();
    preview();
  }

  function pickSource() {
    ed.pickOnce(px => setSource(px));
  }

  function clearRecolor() {
    source = null;
    target = null;
    paintPair();
    preview();
  }

  function applyRecolor() {
    if (scope.value === 'selection' && !select.rect) {
      ed.setStatus('Drag a box with the select tool first, or switch to another area.');
      return;
    }
    ed.finishStroke();
    select.commit();
    const out = compute();
    if (!out) return;
    const changed = doc.replaceAll(out, { model: doc.model });
    ed.setStatus(changed ? 'Recolored. Undo brings the old colors back.' : 'No pixels matched that color there.');
    source = null;
    paintPair();
    preview();
  }

  sourceBtn.addEventListener('click', pickSource);
  targetBtn.addEventListener('click', () => setTarget(state.color));
  tolerance.addEventListener('input', () => {
    toleranceOut.textContent = tolerance.value;
    preview();
  });
  scope.addEventListener('change', preview);
  layerScope.addEventListener('change', preview);
  fold.addEventListener('toggle', preview);
  ed.on('selection', () => {
    if (fold.open) preview();
  });

  let timer = null;
  doc.on('change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      renderSkin();
      if (fold.open) preview();
    }, 250);
  });

  root.append(
    h('div', { class: 'mini-head' }, h('span', { text: 'Pinned' }), h('button', { type: 'button', class: 'link-btn', text: 'Pin current color', onclick: pinCurrent })),
    pinnedRow,
    h('div', { class: 'mini-head' }, h('span', { text: 'Recent' })),
    recentRow,
    h('div', { class: 'mini-head' }, h('span', { text: 'In this skin' })),
    skinRow,
    fold);

  renderPinned();
  renderRecent();
  renderSkin();
  paintPair();

  ed.recolorWith = (from, to) => {
    source = [from[0], from[1], from[2]];
    target = [to[0], to[1], to[2]];
    scope.value = 'all';
    layerScope.value = 'both';
    fold.open = true;
    paintPair();
    preview();
    fold.scrollIntoView({ block: 'nearest' });
  };
}
