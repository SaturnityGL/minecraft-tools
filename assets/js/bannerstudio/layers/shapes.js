import { makeCanvas } from '../assets.js';
import { assetImage } from '../model.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return '#' + [0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
}

function addFilter(ctx, f) {
  const p = ctx.filter;
  ctx.filter = (p && p !== 'none' ? p + ' ' : '') + f;
}

const cache = new Map();

function sprite(key, cols, rows, fn) {
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas(cols, rows);
  const x = c.getContext('2d');
  const R = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  fn(R, x);
  if (cache.size > 400) cache.clear();
  cache.set(key, c);
  return c;
}

const cell = l => Math.max(1, Math.round(l.px || 4));

function grid(l, minC, minR) {
  const px = cell(l);
  return { px, cols: Math.max(minC, Math.round(l.w / px)), rows: Math.max(minR, Math.round(l.h / px)) };
}

function blitCentered(ctx, c, px) {
  ctx.imageSmoothingEnabled = false;
  const w = c.width * px, h = c.height * px;
  ctx.drawImage(c, Math.round(-w / 2), Math.round(-h / 2), w, h);
}

const HEART = [
  '.KK...KK.',
  'KRRKKKRRK',
  'KRWRRRRRK',
  'KRRRRRRRK',
  'KRRRRRRDK',
  '.KRRRRDK.',
  '..KRRDK..',
  '...KRK...',
  '....K....',
];

const HEART_PAL = {
  full: { K: '#000000', R: '#ff1313', W: '#ffffff', D: '#aa0000' },
  empty: { K: '#000000', R: '#2b2b2b', W: '#3d3d3d', D: '#1c1c1c' },
};

function heart(type) {
  return sprite('heart|' + type, 9, 9, R => {
    HEART.forEach((row, y) => {
      for (let x = 0; x < 9; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const pal = type === 'full' || (type === 'half' && x < 5) ? HEART_PAL.full : HEART_PAL.empty;
        R(pal[ch], x, y, 1, 1);
      }
    });
  });
}

const MC = {
  mcpanel(ctx, l) {
    const { px, cols, rows } = grid(l, 6, 6);
    const s = sprite(`panel|${cols}|${rows}`, cols, rows, R => {
      R('#000000', 1, 0, cols - 2, 1);
      R('#000000', 1, rows - 1, cols - 2, 1);
      R('#000000', 0, 1, 1, rows - 2);
      R('#000000', cols - 1, 1, 1, rows - 2);
      R('#c6c6c6', 1, 1, cols - 2, rows - 2);
      R('#ffffff', 1, 1, cols - 3, 2);
      R('#ffffff', 1, 1, 2, rows - 3);
      R('#555555', 2, rows - 3, cols - 3, 2);
      R('#555555', cols - 3, 2, 2, rows - 3);
    });
    blitCentered(ctx, s, px);
  },
  mcbutton(ctx, l) {
    const { px, cols, rows } = grid(l, 4, 4);
    const hv = !!l.hover;
    const s = sprite(`button|${cols}|${rows}|${hv}`, cols, rows, R => {
      const edge = hv ? '#7e88bf' : '#000000';
      const face = hv ? '#6a73ad' : '#6f6f6f';
      const top = hv ? '#a6aedd' : '#a0a0a0';
      const bot = hv ? '#40477a' : '#3b3b3b';
      R(edge, 1, 0, cols - 2, 1);
      R(edge, 1, rows - 1, cols - 2, 1);
      R(edge, 0, 1, 1, rows - 2);
      R(edge, cols - 1, 1, 1, rows - 2);
      R(face, 1, 1, cols - 2, rows - 2);
      R(top, 1, 1, cols - 2, 1);
      R(top, 1, 2, 1, rows - 4);
      R(bot, 1, rows - 3, cols - 2, 2);
      R(bot, cols - 2, 2, 1, rows - 5);
    });
    blitCentered(ctx, s, px);
  },
  mctooltip(ctx, l) {
    const { px, cols, rows } = grid(l, 6, 6);
    const s = sprite(`tooltip|${cols}|${rows}`, cols, rows, (R, x) => {
      const bg = 'rgba(16,0,16,0.94)';
      R(bg, 1, 0, cols - 2, 1);
      R(bg, 0, 1, cols, rows - 2);
      R(bg, 1, rows - 1, cols - 2, 1);
      const B = (col, a, b, w, h) => { x.clearRect(a, b, w, h); R(col, a, b, w, h); };
      const c0 = '#5000ff', c1 = '#28007f';
      B(c0, 2, 1, cols - 4, 1);
      B(c1, 2, rows - 2, cols - 4, 1);
      for (let y = 1; y < rows - 1; y++) {
        const col = mix(c0, c1, (y - 1) / Math.max(1, rows - 3));
        B(col, 1, y, 1, 1);
        B(col, cols - 2, y, 1, 1);
      }
    });
    blitCentered(ctx, s, px);
  },
  xpbar(ctx, l, E) {
    const px = cell(l);
    const cols = Math.max(10, Math.round(l.w / px));
    const empty = sprite('xp-e|' + cols, cols, 5, R => {
      R('#000000', 0, 0, cols, 5);
      R('#404040', 1, 1, cols - 2, 3);
      R('#5c5c5c', 1, 1, cols - 2, 1);
      R('#2a2a2a', 1, 3, cols - 2, 1);
    });
    const full = sprite('xp-f|' + cols, cols, 5, R => {
      R('#b8ff7a', 1, 1, cols - 2, 1);
      R('#80ff20', 1, 2, cols - 2, 1);
      R('#3fb010', 1, 3, cols - 2, 1);
    });
    const f = l.animateFill ? (E.phase < 0.85 ? E.phase / 0.85 : (1 - E.phase) / 0.15) : clamp(l.fill, 0, 1);
    const fw = Math.floor((cols - 2) * f);
    const X = Math.round(-cols * px / 2), Y = Math.round(-5 * px / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(empty, X, Y, cols * px, 5 * px);
    if (fw > 0) ctx.drawImage(full, 0, 0, 1 + fw, 5, X, Y, (1 + fw) * px, 5 * px);
  },
  healthbar(ctx, l, E) {
    const px = cell(l);
    const n = clamp(Math.round(l.count), 1, 40);
    const units = Math.round(clamp(l.fill, 0, 1) * n * 2);
    const b = l.beat > 0 && Math.sin(TAU * Math.round(l.beat) * E.phase) > 0.5 ? px : 0;
    const w = (n * 8 + 1) * px, h = (l.beat > 0 ? 10 : 9) * px;
    const X = Math.round(-w / 2), Y = Math.round(h / 2 - 9 * px);
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < n; i++) {
      const type = units >= 2 * (i + 1) ? 'full' : units === 2 * i + 1 ? 'half' : 'empty';
      ctx.drawImage(heart(type), X + i * 8 * px, Y - (type === 'full' ? b : 0), 9 * px, 9 * px);
    }
  },
};

const STD_KINDS = ['rect', 'round', 'pill', 'circle', 'diamond', 'hexagon', 'star', 'burst', 'ribbon', 'arrow', 'line'];

function size(l) {
  const k = l.kind, px = cell(l);
  if (k === 'xpbar') return { w: Math.max(10, Math.round(l.w / px)) * px, h: 5 * px };
  if (k === 'healthbar') return { w: (clamp(Math.round(l.count), 1, 40) * 8 + 1) * px, h: (l.beat > 0 ? 10 : 9) * px };
  if (k === 'mcpanel' || k === 'mctooltip') { const g = grid(l, 6, 6); return { w: g.cols * px, h: g.rows * px }; }
  if (k === 'mcbutton') { const g = grid(l, 4, 4); return { w: g.cols * px, h: g.rows * px }; }
  if (k === 'line') return { w: l.w, h: Math.max(l.strokeWidth || 0, 4) };
  return { w: l.w, h: l.h };
}

function fillPaint(ctx, l, w, h) {
  const m = l.fillMode;
  if (m === 'none') return null;
  if (m === 'linear') {
    const a = (l.gradAngle || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const L = (Math.abs(w * c) + Math.abs(h * s)) / 2;
    const g = ctx.createLinearGradient(-c * L, -s * L, c * L, s * L);
    g.addColorStop(0, l.color);
    g.addColorStop(1, l.color2);
    return g;
  }
  if (m === 'radial') {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) / 2);
    g.addColorStop(0, l.color);
    g.addColorStop(1, l.color2);
    return g;
  }
  return l.color;
}

function poly(ctx, pts) {
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}

function starPts(n, inner, w, h, off) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n + off;
    const r = i % 2 ? inner : 1;
    pts.push([Math.cos(a) * r * w / 2, Math.sin(a) * r * h / 2]);
  }
  return pts;
}

function trace(ctx, l, w, h) {
  const k = l.kind;
  const rr = Math.max(0, Math.min(l.radius || 0, w / 2, h / 2));
  if (k === 'rect') ctx.rect(-w / 2, -h / 2, w, h);
  else if (k === 'round') ctx.roundRect(-w / 2, -h / 2, w, h, rr);
  else if (k === 'pill' || k === 'line') ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) / 2);
  else if (k === 'circle') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
  else if (k === 'diamond') poly(ctx, [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]]);
  else if (k === 'hexagon') poly(ctx, Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3) * w / 2, Math.sin(i * Math.PI / 3) * h / 2]));
  else if (k === 'star') poly(ctx, starPts(clamp(Math.round(l.points), 3, 24), clamp(l.inner, 0.1, 0.95), w, h, 0));
  else if (k === 'burst') poly(ctx, starPts(Math.max(10, Math.round(l.points * 3)), 1 - (1 - clamp(l.inner, 0.1, 0.95)) * 0.5, w, h, 0));
  else if (k === 'arrow') {
    const hl = Math.min(h * 0.9, w * 0.45), sh = h * 0.2;
    poly(ctx, [[-w / 2, -sh], [w / 2 - hl, -sh], [w / 2 - hl, -h / 2], [w / 2, 0], [w / 2 - hl, h / 2], [w / 2 - hl, sh], [-w / 2, sh]]);
  }
}

function ribbon(ctx, l, w, h, paint) {
  const f = h * 0.38, d = h * 0.22;
  const tail = s => {
    ctx.beginPath();
    poly(ctx, [[s * -w / 2, -h / 2 + d], [s * (-w / 2 + f * 2), -h / 2 + d], [s * (-w / 2 + f * 2), h / 2], [s * -w / 2, h / 2], [s * (-w / 2 + f * 0.6), d / 2]]);
  };
  const pieces = [
    () => tail(1),
    () => tail(-1),
    () => { ctx.beginPath(); ctx.rect(-w / 2 + f, -h / 2, w - f * 2, h - d); },
  ];
  pieces.forEach((p, i) => {
    p();
    if (paint) { ctx.fillStyle = paint; ctx.fill(); }
    if (i < 2) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill(); }
    if (l.strokeWidth > 0) { ctx.lineWidth = l.strokeWidth; ctx.strokeStyle = l.stroke; ctx.stroke(); }
  });
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  [1, -1].forEach(s => {
    ctx.beginPath();
    poly(ctx, [[s * (-w / 2 + f), h / 2 - d], [s * (-w / 2 + f), h / 2], [s * (-w / 2 + f + d), h / 2 - d]]);
    ctx.fill();
  });
}

const KIND_OPTS = [
  ['rect', 'Rectangle'], ['round', 'Rounded rectangle'], ['pill', 'Pill'], ['circle', 'Circle'], ['diamond', 'Diamond'],
  ['hexagon', 'Hexagon'], ['star', 'Star'], ['burst', 'Starburst'], ['ribbon', 'Ribbon'], ['arrow', 'Arrow'], ['line', 'Line'],
  ['mcpanel', 'Minecraft panel'], ['mcbutton', 'Minecraft button'], ['mctooltip', 'Minecraft tooltip'],
  ['xpbar', 'Minecraft XP bar'], ['healthbar', 'Minecraft hearts'],
];

const isStd = l => STD_KINDS.includes(l.kind);
const fillable = l => isStd(l) && l.fillMode !== 'none';

export const shape = {
  type: 'shape',
  label: 'Shape',
  full: false,
  defaults() {
    return {
      kind: 'round', w: 300, h: 80, fillMode: 'solid', color: '#2b2b3a', color2: '#5b2a9e', gradAngle: 90,
      stroke: '#ffffff', strokeWidth: 0, radius: 16, points: 5, inner: 0.5, px: 4, hover: false,
      fill: 0.7, animateFill: false, count: 10, beat: 0, spin: 0,
    };
  },
  schema: [
    { k: 'kind', t: 'select', label: 'Kind', opts: KIND_OPTS },
    { k: 'w', t: 'range', label: 'Width', min: 8, max: 1400, step: 1, show: l => l.kind !== 'healthbar' },
    { k: 'h', t: 'range', label: 'Height', min: 4, max: 800, step: 1, show: l => !['line', 'xpbar', 'healthbar'].includes(l.kind) },
    { k: 'fillMode', t: 'select', label: 'Fill', opts: [['solid', 'Solid'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient'], ['none', 'None']], show: isStd },
    { k: 'color', t: 'color', label: 'Color', show: l => isStd(l) && l.fillMode !== 'none' },
    { k: 'color2', t: 'color', label: 'Second color', show: l => isStd(l) && (l.fillMode === 'linear' || l.fillMode === 'radial') },
    { k: 'gradAngle', t: 'range', label: 'Gradient angle', min: 0, max: 360, step: 1, show: l => isStd(l) && l.fillMode === 'linear' },
    { k: 'stroke', t: 'color', label: 'Outline color', show: l => isStd(l) && l.kind !== 'line' },
    { k: 'strokeWidth', t: 'range', label: 'Outline width (line: thickness)', min: 0, max: 40, step: 1, show: isStd },
    { k: 'radius', t: 'range', label: 'Corner radius', min: 0, max: 200, step: 1, show: l => l.kind === 'round' },
    { k: 'points', t: 'range', label: 'Points', min: 3, max: 24, step: 1, show: l => l.kind === 'star' || l.kind === 'burst' },
    { k: 'inner', t: 'range', label: 'Inner size', min: 0.1, max: 0.95, step: 0.01, show: l => l.kind === 'star' || l.kind === 'burst' },
    { k: 'spin', t: 'range', label: 'Spin turns per loop', min: -6, max: 6, step: 1, show: l => l.kind === 'star' || l.kind === 'burst' },
    { k: 'px', t: 'range', label: 'Pixel size', min: 1, max: 16, step: 1, show: l => !isStd(l) },
    { k: 'hover', t: 'check', label: 'Hover style', show: l => l.kind === 'mcbutton' },
    { k: 'fill', t: 'range', label: 'Fill amount', min: 0, max: 1, step: 0.01, show: l => l.kind === 'xpbar' || l.kind === 'healthbar' },
    { k: 'animateFill', t: 'check', label: 'Fill over the loop', show: l => l.kind === 'xpbar' },
    { k: 'count', t: 'range', label: 'Hearts', min: 1, max: 20, step: 1, show: l => l.kind === 'healthbar' },
    { k: 'beat', t: 'range', label: 'Beats per loop', min: 0, max: 12, step: 1, show: l => l.kind === 'healthbar' },
  ],
  bounds(l) { return size(l); },
  draw(ctx, l, st, E) {
    const { w, h } = size(l);
    const mc = MC[l.kind];
    if (mc) {
      ctx.save();
      mc(ctx, l, E);
      ctx.restore();
      return;
    }
    ctx.save();
    if ((l.kind === 'star' || l.kind === 'burst') && l.spin) ctx.rotate(TAU * Math.round(l.spin) * E.phase);
    const paint = fillPaint(ctx, l, w, h);
    ctx.lineJoin = 'round';
    if (l.kind === 'ribbon') ribbon(ctx, l, w, h, paint);
    else {
      ctx.beginPath();
      trace(ctx, l, w, h);
      if (paint) { ctx.fillStyle = paint; ctx.fill(); }
      if (l.strokeWidth > 0 && l.kind !== 'line') { ctx.lineWidth = l.strokeWidth; ctx.strokeStyle = l.stroke; ctx.stroke(); }
    }
    ctx.restore();
  },
};

const tintCache = new WeakMap();

function tinted(img, l) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.min(1, 1024 / Math.max(iw, ih));
  const key = `${l.tintColor}|${l.tintAmount}|${k}`;
  let m = tintCache.get(img);
  if (!m) { m = new Map(); tintCache.set(img, m); }
  let c = m.get(key);
  if (c) return c;
  c = makeCanvas(iw * k, ih * k);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, c.width, c.height);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = clamp(l.tintAmount, 0, 1);
  x.fillStyle = l.tintColor;
  x.fillRect(0, 0, c.width, c.height);
  if (m.size > 12) m.clear();
  m.set(key, c);
  return c;
}

function imgSize(l, img) {
  const w = Math.max(8, l.width || 200);
  if (!img) return { w, h: w * 0.5 };
  if (l.crop === 'circle' || l.crop === 'hex') return { w, h: w };
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  return { w, h: w * (ih / Math.max(1, iw)) };
}

export const image = {
  type: 'image',
  label: 'Image',
  full: false,
  defaults(doc) {
    return {
      src: '', width: Math.round(Math.min(240, doc.w * 0.4)), pixelated: false, crop: 'none', radius: 24,
      tint: false, tintColor: '#ff4fa3', tintAmount: 0.4, grayscale: false,
    };
  },
  schema: [
    { k: 'src', t: 'image', label: 'Image' },
    { k: 'width', t: 'range', label: 'Width', min: 16, max: 2000, step: 1 },
    { k: 'crop', t: 'select', label: 'Crop', opts: [['none', 'None'], ['circle', 'Circle'], ['rounded', 'Rounded'], ['hex', 'Hexagon']] },
    { k: 'radius', t: 'range', label: 'Corner radius', min: 0, max: 400, step: 1, show: l => l.crop === 'rounded' },
    { k: 'pixelated', t: 'check', label: 'Pixelated (no smoothing)' },
    { k: 'grayscale', t: 'check', label: 'Grayscale' },
    { k: 'tint', t: 'check', label: 'Tint' },
    { k: 'tintColor', t: 'color', label: 'Tint color', show: l => l.tint },
    { k: 'tintAmount', t: 'range', label: 'Tint amount', min: 0, max: 1, step: 0.01, show: l => l.tint },
  ],
  bounds(l, E) { const { w, h } = imgSize(l, assetImage(E.doc, l.src)); return { w, h }; },
  draw(ctx, l, st, E) {
    const img = assetImage(E.doc, l.src);
    const { w, h } = imgSize(l, img);
    if (!img) {
      if (!E.editor) return;
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `${Math.max(12, Math.round(w / 14))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Upload an image', 0, 0);
      ctx.restore();
      return;
    }
    ctx.save();
    if (l.crop !== 'none') {
      ctx.beginPath();
      if (l.crop === 'circle') ctx.arc(0, 0, Math.min(w, h) / 2, 0, TAU);
      else if (l.crop === 'rounded') ctx.roundRect(-w / 2, -h / 2, w, h, Math.max(0, Math.min(l.radius, w / 2, h / 2)));
      else poly(ctx, Array.from({ length: 6 }, (_, i) => [Math.cos(-Math.PI / 2 + i * Math.PI / 3) * w / 2, Math.sin(-Math.PI / 2 + i * Math.PI / 3) * h / 2]));
      ctx.clip();
    }
    if (l.grayscale) addFilter(ctx, 'grayscale(1)');
    ctx.imageSmoothingEnabled = !l.pixelated;
    const src = l.tint ? tinted(img, l) : img;
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    if (l.crop === 'circle' || l.crop === 'hex') {
      const s = Math.min(sw, sh);
      ctx.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, -w / 2, -h / 2, w, h);
    } else ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.restore();
  },
};
