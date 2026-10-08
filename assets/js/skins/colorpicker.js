import { rgbToHsv, hsvToRgb, hexToRgb, rgbToHex } from './color.js';

const SIZE = 200;
const CENTER = SIZE / 2;
const OUTER = 96;
const INNER = 76;
const HALF = Math.floor((INNER - 5) / Math.SQRT2);
const SQ_LEFT = CENTER - HALF;
const SQ_TOP = CENTER - HALF;
const SQ_SIDE = HALF * 2;

function buildRing() {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - CENTER;
      const dy = y + 0.5 - CENTER;
      const d = Math.hypot(dx, dy);
      if (d < INNER || d > OUTER) continue;
      const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const [r, g, b] = hsvToRgb([h, 1, 1]);
      const i = (y * SIZE + x) * 4;
      let a = 255;
      if (d > OUTER - 1) a = Math.round(255 * (OUTER - d));
      else if (d < INNER + 1) a = Math.round(255 * (d - INNER));
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function createColorPicker(container, { onChange } = {}) {
  const ring = buildRing();
  let hsv = [0, 1, 1];

  const root = document.createElement('div');
  root.className = 'cp';

  const canvas = document.createElement('canvas');
  canvas.className = 'cp-canvas';
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Color wheel. Drag the ring for hue and the square for saturation and brightness.');
  const ctx = canvas.getContext('2d');

  const row = document.createElement('div');
  row.className = 'cp-row';
  const swatch = document.createElement('span');
  swatch.className = 'cp-swatch';
  swatch.setAttribute('role', 'img');
  swatch.setAttribute('aria-label', 'Current color');
  const label = document.createElement('label');
  label.className = 'cp-hex-label';
  label.textContent = 'Hex';
  const field = document.createElement('input');
  field.type = 'text';
  field.className = 'cp-hex';
  field.maxLength = 7;
  field.spellcheck = false;
  field.autocomplete = 'off';
  field.setAttribute('aria-label', 'Hex color');
  label.appendChild(field);
  row.append(swatch, label);
  root.append(canvas, row);
  container.appendChild(root);

  function get() {
    return hsvToRgb(hsv);
  }

  function draw() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(ring, 0, 0);
    const img = ctx.createImageData(SQ_SIDE, SQ_SIDE);
    for (let y = 0; y < SQ_SIDE; y++) {
      for (let x = 0; x < SQ_SIDE; x++) {
        const [r, g, b] = hsvToRgb([hsv[0], x / (SQ_SIDE - 1), 1 - y / (SQ_SIDE - 1)]);
        const i = (y * SQ_SIDE + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, SQ_LEFT, SQ_TOP);

    const ang = hsv[0] * Math.PI / 180;
    const mid = (INNER + OUTER) / 2;
    marker(CENTER + Math.cos(ang) * mid, CENTER + Math.sin(ang) * mid, 6);
    marker(SQ_LEFT + hsv[1] * (SQ_SIDE - 1), SQ_TOP + (1 - hsv[2]) * (SQ_SIDE - 1), 5);

    const hex = rgbToHex(get());
    swatch.style.background = hex;
    return hex;
  }

  function marker(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  function refresh(updateField) {
    const hex = draw();
    if (updateField) field.value = hex;
  }

  function emit() {
    if (onChange) onChange(get());
  }

  function set(rgb) {
    const current = get();
    if (current[0] === rgb[0] && current[1] === rgb[1] && current[2] === rgb[2]) {
      refresh(document.activeElement !== field);
      return;
    }
    const next = rgbToHsv(rgb);
    if (next[1] === 0 || next[2] === 0) next[0] = hsv[0];
    if (next[2] === 0) next[1] = hsv[1];
    hsv = next;
    refresh(document.activeElement !== field);
  }

  let drag = null;

  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * SIZE / rect.width,
      y: (e.clientY - rect.top) * SIZE / rect.height
    };
  }

  function apply(mode, p) {
    if (mode === 'hue') {
      hsv = [(Math.atan2(p.y - CENTER, p.x - CENTER) * 180 / Math.PI + 360) % 360, hsv[1], hsv[2]];
    } else {
      const s = Math.min(1, Math.max(0, (p.x - SQ_LEFT) / (SQ_SIDE - 1)));
      const v = Math.min(1, Math.max(0, 1 - (p.y - SQ_TOP) / (SQ_SIDE - 1)));
      hsv = [hsv[0], s, v];
    }
    refresh(true);
    emit();
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const p = localPoint(e);
    const d = Math.hypot(p.x - CENTER, p.y - CENTER);
    if (d >= INNER - 3 && d <= OUTER + 4) drag = 'hue';
    else if (p.x >= SQ_LEFT - 4 && p.x <= SQ_LEFT + SQ_SIDE + 4 && p.y >= SQ_TOP - 4 && p.y <= SQ_TOP + SQ_SIDE + 4) drag = 'sv';
    else return;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    apply(drag, p);
  });

  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    apply(drag, localPoint(e));
  });

  function endDrag() {
    drag = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  field.addEventListener('input', () => {
    const rgb = hexToRgb(field.value.trim());
    if (!rgb) return;
    const next = rgbToHsv(rgb);
    if (next[1] === 0 || next[2] === 0) next[0] = hsv[0];
    if (next[2] === 0) next[1] = hsv[1];
    hsv = next;
    refresh(false);
    emit();
  });

  field.addEventListener('blur', () => {
    field.value = rgbToHex(get());
  });

  refresh(true);

  return { set, get };
}
