import { SIZE, LAYERS, faceRect, partBox } from './skinmap.js';

export const PART_LABELS = {
  head: 'Head',
  torso: 'Torso',
  rightArm: 'Right arm',
  leftArm: 'Left arm',
  rightLeg: 'Right leg',
  leftLeg: 'Left leg'
};

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) el.append(child);
  }
  return el;
}

export function button(label, onclick, props = {}) {
  return h('button', { type: 'button', class: 'sk-btn small', text: label, onclick, ...props });
}

export function hex(rgb) {
  return '#' + [rgb[0], rgb[1], rgb[2]].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function swatch(rgb, props = {}) {
  const el = h('button', { type: 'button', class: 'swatch', title: hex(rgb), 'aria-label': `Color ${hex(rgb)}`, ...props });
  el.style.background = hex(rgb);
  return el;
}

function over(dst, d, src, s) {
  const sa = src[s + 3] / 255;
  if (sa === 0) return;
  const da = dst[d + 3] / 255;
  const out = sa + da * (1 - sa);
  for (let i = 0; i < 3; i++) dst[d + i] = Math.round((src[s + i] * sa + dst[d + i] * da * (1 - sa)) / out);
  dst[d + 3] = Math.round(out * 255);
}

function frontSlots(model) {
  const arm = partBox('rightArm', model).w;
  const head = partBox('head', model);
  const torso = partBox('torso', model);
  const leg = partBox('rightLeg', model);
  const left = partBox('rightArm', 'classic').w;
  return {
    w: left * 2 + torso.w,
    h: head.h + torso.h + leg.h,
    slots: {
      head: { x: left, y: 0 },
      torso: { x: left, y: head.h },
      rightArm: { x: left - arm, y: head.h },
      leftArm: { x: left + torso.w, y: head.h },
      rightLeg: { x: left, y: head.h + torso.h },
      leftLeg: { x: left + leg.w, y: head.h + torso.h }
    }
  };
}

export function frontPixels(pixels, model) {
  const layout = frontSlots(model);
  const data = new Uint8ClampedArray(layout.w * layout.h * 4);
  for (const layer of LAYERS) {
    for (const [part, slot] of Object.entries(layout.slots)) {
      const r = faceRect(part, layer, 'front', model);
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          over(data, ((slot.y + y) * layout.w + slot.x + x) * 4, pixels, ((r.y + y) * SIZE + r.x + x) * 4);
        }
      }
    }
  }
  return { w: layout.w, h: layout.h, data };
}

export function headPixels(pixels, model) {
  const r = faceRect('head', 'body', 'front', model);
  const data = new Uint8ClampedArray(r.w * r.h * 4);
  for (const layer of LAYERS) {
    const f = faceRect('head', layer, 'front', model);
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        over(data, (y * r.w + x) * 4, pixels, ((f.y + y) * SIZE + f.x + x) * 4);
      }
    }
  }
  return { w: r.w, h: r.h, data };
}

export function piecePixels(piece) {
  const r = faceRect(piece.part, 'body', 'front', piece.model);
  const data = new Uint8ClampedArray(r.w * r.h * 4);
  for (const layer of LAYERS) {
    const faces = piece.layers[layer];
    if (!faces || !faces.front) continue;
    for (let i = 0; i < r.w * r.h; i++) over(data, i * 4, faces.front, i * 4);
  }
  return { w: r.w, h: r.h, data };
}

export function scaleNearest(image, factor) {
  const w = image.w * factor;
  const h2 = image.h * factor;
  const data = new Uint8ClampedArray(w * h2 * 4);
  for (let y = 0; y < h2; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < w; x++) {
      const s = (sy * image.w + Math.floor(x / factor)) * 4;
      data.set(image.data.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return { w, h: h2, data };
}

export function pixelCanvas(image, props = {}) {
  const canvas = h('canvas', { class: 'px-canvas', width: image.w, height: image.h, ...props });
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.w, image.h), 0, 0);
  return canvas;
}

export function fileSafe(name) {
  const cleaned = String(name || '').trim().replace(/[^A-Za-z0-9 _-]+/g, '').replace(/\s+/g, '-').slice(0, 40);
  return cleaned || 'skin';
}

export function ago(time) {
  const mins = Math.round((Date.now() - time) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
