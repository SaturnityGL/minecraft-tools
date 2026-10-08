import { SIZE, faces, faceAt } from './skinmap.js';

const MARGIN = 8;
const MIN_SCALE = 2;
const MAX_SCALE = 96;
const GRID_MIN_SCALE = 8;
const LABEL_MIN_SCALE = 6;
const CHECK_CELL = 8;
const KEEP_VISIBLE = 48;
const LABELS = {
  head: 'Head',
  torso: 'Torso',
  rightArm: 'R arm',
  leftArm: 'L arm',
  rightLeg: 'R leg',
  leftLeg: 'L leg'
};
const ANT_SPEED = 90;
const CHECKER = {
  dark: ['#3b362d', '#2c2821'],
  light: ['#ffffff', '#d9d4c7']
};
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function makeChecker(a, b) {
  const tile = document.createElement('canvas');
  tile.width = CHECK_CELL * 2;
  tile.height = CHECK_CELL * 2;
  const t = tile.getContext('2d');
  t.fillStyle = a;
  t.fillRect(0, 0, tile.width, tile.height);
  t.fillStyle = b;
  t.fillRect(CHECK_CELL, 0, CHECK_CELL, CHECK_CELL);
  t.fillRect(0, CHECK_CELL, CHECK_CELL, CHECK_CELL);
  return tile;
}

function makeHatch() {
  const tile = document.createElement('canvas');
  tile.width = 8;
  tile.height = 8;
  const t = tile.getContext('2d');
  t.strokeStyle = 'rgba(255, 255, 255, 0.13)';
  t.lineWidth = 1;
  t.beginPath();
  t.moveTo(0, 8);
  t.lineTo(8, 0);
  t.moveTo(-1, 1);
  t.lineTo(1, -1);
  t.moveTo(7, 9);
  t.lineTo(9, 7);
  t.stroke();
  return tile;
}

export function createView2D(canvas, { doc, state }) {
  const ctx = canvas.getContext('2d');
  const tex = document.createElement('canvas');
  tex.width = SIZE;
  tex.height = SIZE;
  const texCtx = tex.getContext('2d');
  const checkerTiles = { dark: makeChecker(...CHECKER.dark), light: makeChecker(...CHECKER.light) };
  const hatchTile = makeHatch();

  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let scale = MIN_SCALE;
  let offX = 0;
  let offY = 0;
  let fitted = true;
  let texPixels = null;
  let texVersion = -1;
  let lastKey = null;
  let faceModel = null;
  let faceList = [];
  let groups = [];
  let mappedPath = null;
  let preview = null;
  let previewVersion = 0;
  let highlight = null;
  let highlightVersion = 0;
  let selection = null;
  const hi = document.createElement('canvas');
  hi.width = SIZE;
  hi.height = SIZE;
  const hiCtx = hi.getContext('2d');

  function ensureFaces() {
    if (faceModel === doc.model) return;
    faceModel = doc.model;
    faceList = faces(faceModel);
    const byKey = new Map();
    for (const f of faceList) {
      const key = `${f.part}:${f.layer}`;
      const g = byKey.get(key);
      if (!g) byKey.set(key, { part: f.part, layer: f.layer, x: f.x, y: f.y, corner: f.w });
      else {
        g.x = Math.min(g.x, f.x);
        g.y = Math.min(g.y, f.y);
      }
      if (f.face === 'right') byKey.get(key).corner = f.w;
    }
    groups = [...byKey.values()];
    mappedPath = null;
  }

  function fitScale() {
    const s = Math.min((cssW - MARGIN * 2) / SIZE, (cssH - MARGIN * 2) / SIZE);
    return Math.max(MIN_SCALE, s >= 6 ? Math.floor(s) : Math.floor(s * 2) / 2);
  }

  function applyFit() {
    scale = fitScale();
    offX = (cssW - SIZE * scale) / 2;
    offY = (cssH - SIZE * scale) / 2;
  }

  function clampPan() {
    offX = clamp(offX, KEEP_VISIBLE - SIZE * scale, cssW - KEEP_VISIBLE);
    offY = clamp(offY, KEEP_VISIBLE - SIZE * scale, cssH - KEEP_VISIBLE);
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const r = window.devicePixelRatio || 1;
    if (w <= 0 || h <= 0) return;
    if (w === cssW && h === cssH && r === dpr) return;
    const prevW = cssW;
    const prevH = cssH;
    cssW = w;
    cssH = h;
    dpr = r;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    if (fitted || prevW === 0) {
      applyFit();
    } else {
      offX += (w - prevW) / 2;
      offY += (h - prevH) / 2;
      clampPan();
    }
    lastKey = null;
  }

  function pan(dx, dy) {
    fitted = false;
    offX += dx;
    offY += dy;
    clampPan();
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    if (next === scale) return;
    const tx = (px - offX) / scale;
    const ty = (py - offY) / scale;
    scale = next;
    offX = px - tx * scale;
    offY = py - ty * scale;
    fitted = false;
    clampPan();
  }

  function reset() {
    fitted = true;
    if (cssW > 0) applyFit();
  }

  function texel(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.floor((clientX - rect.left - offX) / scale),
      y: Math.floor((clientY - rect.top - offY) / scale)
    };
  }

  function setPreview(pixels) {
    preview = pixels || null;
    previewVersion++;
  }

  function setHighlight(pixels) {
    highlight = pixels || null;
    highlightVersion++;
    if (highlight) hiCtx.putImageData(new ImageData(new Uint8ClampedArray(highlight), SIZE, SIZE), 0, 0);
  }

  function setSelection(rect) {
    selection = rect ? { ...rect } : null;
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.floor((clientX - rect.left - offX) / scale);
    const y = Math.floor((clientY - rect.top - offY) / scale);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
    const face = faceAt(x, y, doc.model);
    if (!face) return null;
    if (face.layer !== state.layer || !state.show[face.layer] || !state.partVisible[face.part]) return null;
    return { x, y, face };
  }

  function stateKey() {
    const pv = state.partVisible;
    return [
      doc.version, doc.model, scale, offX, offY, cssW, cssH, dpr,
      state.grid ? 1 : 0, state.layer, state.show.body ? 1 : 0, state.show.outer ? 1 : 0,
      pv.head ? 1 : 0, pv.torso ? 1 : 0, pv.rightArm ? 1 : 0, pv.leftArm ? 1 : 0, pv.rightLeg ? 1 : 0, pv.leftLeg ? 1 : 0,
      state.backdrop, previewVersion, highlightVersion,
      selection ? `${selection.x},${selection.y},${selection.w},${selection.h},${Math.floor(performance.now() / ANT_SPEED)}` : ''
    ].join('|');
  }

  function uploadTexture() {
    texCtx.putImageData(new ImageData(preview || doc.pixels, SIZE, SIZE), 0, 0);
  }

  function isDimmed(f) {
    return f.layer !== state.layer || !state.partVisible[f.part] || !state.show[f.layer];
  }

  function draw() {
    ensureFaces();
    const light = state.backdrop === 'light';
    const size = SIZE * scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.beginPath();
    ctx.rect(offX, offY, size, size);
    ctx.clip();
    ctx.fillStyle = ctx.createPattern(checkerTiles[light ? 'light' : 'dark'], 'repeat');
    ctx.fillRect(offX, offY, size, size);
    ctx.drawImage(tex, offX, offY, size, size);

    if (!mappedPath) {
      mappedPath = new Path2D();
      mappedPath.rect(0, 0, SIZE, SIZE);
      for (const f of faceList) mappedPath.rect(f.x, f.y, f.w, f.h);
    }
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    ctx.fillStyle = light ? 'rgba(60, 50, 30, 0.55)' : 'rgba(0, 0, 0, 0.62)';
    ctx.fill(mappedPath, 'evenodd');
    ctx.restore();
    ctx.fillStyle = ctx.createPattern(hatchTile, 'repeat');
    const hatch = new Path2D();
    hatch.rect(offX, offY, size, size);
    for (const f of faceList) hatch.rect(offX + f.x * scale, offY + f.y * scale, f.w * scale, f.h * scale);
    ctx.fill(hatch, 'evenodd');
    ctx.restore();

    for (const f of faceList) {
      if (!isDimmed(f)) continue;
      const hidden = !state.partVisible[f.part] || !state.show[f.layer];
      ctx.fillStyle = hidden ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(offX + f.x * scale, offY + f.y * scale, f.w * scale, f.h * scale);
    }

    if (state.grid && scale >= GRID_MIN_SCALE) {
      ctx.beginPath();
      for (const f of faceList) {
        const x0 = offX + f.x * scale;
        const y0 = offY + f.y * scale;
        for (let i = 1; i < f.w; i++) {
          ctx.moveTo(x0 + i * scale, y0);
          ctx.lineTo(x0 + i * scale, y0 + f.h * scale);
        }
        for (let j = 1; j < f.h; j++) {
          ctx.moveTo(x0, y0 + j * scale);
          ctx.lineTo(x0 + f.w * scale, y0 + j * scale);
        }
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const pass of [0, 1]) {
      ctx.beginPath();
      for (const f of faceList) {
        if ((isDimmed(f) ? 0 : 1) !== pass) continue;
        ctx.rect(offX + f.x * scale + 0.5, offY + f.y * scale + 0.5, f.w * scale, f.h * scale);
      }
      if (pass === 1) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      } else {
        ctx.strokeStyle = light ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.3)';
      }
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (highlight) ctx.drawImage(hi, offX, offY, size, size);

    if (scale >= LABEL_MIN_SCALE) {
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      const px = scale >= 9 ? 10 : 9;
      for (const g of groups) {
        const outer = g.layer === 'outer';
        const active = g.layer === state.layer;
        const room = g.corner * scale - 4;
        ctx.font = `700 ${px}px ${FONT}`;
        const lines = outer ? [LABELS[g.part], 'outer'] : [LABELS[g.part]];
        if (lines.some(t => ctx.measureText(t).width > room) || lines.length * (px + 1) > room) continue;
        ctx.globalAlpha = active ? 1 : 0.5;
        lines.forEach((text, i) => {
          const x = offX + g.x * scale + 3;
          const y = offY + g.y * scale + 3 + i * (px + 1);
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.strokeText(text, x, y);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, x, y);
        });
      }
      ctx.globalAlpha = 1;
    }

    if (selection) {
      const x = offX + selection.x * scale + 0.5;
      const y = offY + selection.y * scale + 0.5;
      const w = selection.w * scale;
      const h = selection.h * scale;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -Math.floor(performance.now() / ANT_SPEED) % 10;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }

  function render() {
    if (cssW === 0) resize();
    if (cssW === 0) return;
    const source = preview || doc.pixels;
    if (source !== texPixels) {
      texPixels = source;
      texVersion = -1;
      lastKey = null;
    }
    const version = doc.version + previewVersion * 1e7;
    if (version !== texVersion) {
      texVersion = version;
      uploadTexture();
    }
    const key = stateKey();
    if (key === lastKey) return;
    lastKey = key;
    draw();
  }

  return { render, pick, texel, resize, pan, zoomAt, reset, setPreview, setHighlight, setSelection };
}
