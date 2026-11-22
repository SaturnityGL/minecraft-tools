import { rng } from '../anim.js';
import { texture, textureFrames, makeCanvas, tintFor, shaded } from '../assets.js';
import { assetImage } from '../model.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = v => v - Math.floor(v);
const pmod = (v, m) => ((v % m) + m) % m;

function rgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(r, g, b) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

function rgba(h, a) {
  const c = rgb(h);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function hsl(h, s, l) {
  h = pmod(h, 360) / 360;
  const f = n => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return hex(f(0) * 255, f(8) * 255, f(4) * 255);
}

function addFilter(ctx, f) {
  const p = ctx.filter;
  ctx.filter = (p && p !== 'none' ? p + ' ' : '') + f;
}

const scratches = new Map();

function scratch(name, w, h) {
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  let c = scratches.get(name);
  if (!c) { c = makeCanvas(w, h); scratches.set(name, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, w, h);
  return c;
}

const haloCache = new Map();

function halo(col, r) {
  r = Math.max(4, Math.round(r / 2) * 2);
  const key = col + '|' + r;
  let c = haloCache.get(key);
  if (c) return c;
  c = makeCanvas(r * 2, r * 2);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(col, 0.6));
  g.addColorStop(0.35, rgba(col, 0.2));
  g.addColorStop(1, rgba(col, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, r * 2, r * 2);
  if (haloCache.size > 300) haloCache.clear();
  haloCache.set(key, c);
  return c;
}

const lim = (m, n) => { if (m.size > n) m.clear(); };

const BG_DEFAULT_COLORS = ['#1e6b35', '#5b2a9e', '#2a7fff', '#ff4fa3'];
const blobCache = new Map();
const starCache = new Map();
const tileCache = new Map();

function blobsFor(seed, n) {
  const key = seed + '|' + n;
  let b = blobCache.get(key);
  if (b) return b;
  b = [];
  for (let i = 0; i < n; i++) {
    const r = rng((seed | 0) * 313 + i * 17 + 5);
    b.push({
      x: 0.15 + 0.7 * r(), y: 0.15 + 0.7 * r(), ax: 0.12 + 0.2 * r(), ay: 0.12 + 0.2 * r(),
      fx: 1 + Math.floor(r() * 2), fy: 1 + Math.floor(r() * 3), p1: r(), p2: r(),
      rad: 0.35 + 0.3 * r(), fr: 1 + Math.floor(r() * 2), p3: r(),
    });
  }
  lim(blobCache, 60);
  blobCache.set(key, b);
  return b;
}

function starsFor(seed, n) {
  const key = seed + '|' + n;
  let s = starCache.get(key);
  if (s) return s;
  s = [];
  const pal = ['#ffffff', '#cfe3ff', '#fff1c9'];
  for (let i = 0; i < n; i++) {
    const r = rng((seed | 0) * 211 + i * 13 + 3);
    s.push({ x: r(), y: r(), tw: 1 + Math.floor(r() * 3), p: r(), sz: r() < 0.8 ? 1 : 2, b: r(), c: pal[Math.floor(r() * 3)] });
  }
  lim(starCache, 40);
  starCache.set(key, s);
  return s;
}

function cols2(l) {
  const c = l.colors && l.colors.length ? l.colors : BG_DEFAULT_COLORS;
  return c;
}

function tilePattern(ctx, key, ts, drawTile) {
  let t = tileCache.get(key);
  if (!t) {
    t = makeCanvas(ts, ts);
    const x = t.getContext('2d');
    x.imageSmoothingEnabled = false;
    drawTile(x);
    lim(tileCache, 300);
    tileCache.set(key, t);
  }
  return ctx.createPattern(t, 'repeat');
}

const BODY = {
  solid(ctx, l, E, W, H) {
    ctx.fillStyle = l.color;
    ctx.fillRect(0, 0, W, H);
  },
  linear(ctx, l, E, W, H) {
    const c = cols2(l);
    const a = (l.angle || 0) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
    const L = Math.abs(W * dx) + Math.abs(H * dy);
    const sh = Math.max(0, Math.round(l.shift || 0));
    const cx = W / 2, cy = H / 2;
    let g;
    if (sh > 0 && c.length > 1) {
      const off = frac(E.phase * sh) * L;
      const s0 = -L / 2 - L + off;
      g = ctx.createLinearGradient(cx + dx * s0, cy + dy * s0, cx + dx * (s0 + 3 * L), cy + dy * (s0 + 3 * L));
      const n = c.length;
      for (let k = 0; k < 3; k++) for (let i = 0; i < n; i++) g.addColorStop((k + i / n) / 3, c[i]);
      g.addColorStop(1, c[0]);
    } else {
      g = ctx.createLinearGradient(cx - dx * L / 2, cy - dy * L / 2, cx + dx * L / 2, cy + dy * L / 2);
      c.forEach((col, i) => g.addColorStop(c.length > 1 ? i / (c.length - 1) : 0, col));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
  radial(ctx, l, E, W, H) {
    const c = cols2(l);
    const x = l.cx * W, y = l.cy * H;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, l.radius * Math.max(W, H)));
    c.forEach((col, i) => g.addColorStop(c.length > 1 ? i / (c.length - 1) : 0, col));
    ctx.fillStyle = c[c.length - 1];
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
  aurora(ctx, l, E, W, H) {
    const c = cols2(l);
    const lw = Math.max(24, Math.round(W / 8)), lh = Math.max(14, Math.round(lw * H / W));
    const cv = scratch('aurora', lw, lh);
    const x = cv.getContext('2d');
    x.fillStyle = l.base;
    x.fillRect(0, 0, lw, lh);
    const n = clamp(c.length, 3, 5);
    const B = blobsFor(l.seed, n);
    const ph = E.phase, M = Math.max(lw, lh);
    for (let i = 0; i < n; i++) {
      const b = B[i], col = c[i % c.length];
      const bx = (b.x + b.ax * Math.sin(TAU * (b.fx * ph + b.p1))) * lw;
      const by = (b.y + b.ay * Math.sin(TAU * (b.fy * ph + b.p2))) * lh;
      const r = b.rad * (1 + 0.15 * Math.sin(TAU * (b.fr * ph + b.p3))) * M;
      const g = x.createRadialGradient(bx, by, 0, bx, by, r);
      g.addColorStop(0, rgba(col, 0.95));
      g.addColorStop(0.5, rgba(col, 0.45));
      g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, lw, lh);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cv, 0, 0, W, H);
    ctx.restore();
  },
  texture(ctx, l, E, W, H) {
    const name = l.tex || 'block/stone_bricks';
    const nf = textureFrames(name);
    let frame = 0;
    if (nf > 1) frame = Math.floor(E.phase * nf * Math.max(1, Math.round(E.loop / 1000 * 10 / nf))) % nf;
    const src = texture(name, frame);
    ctx.fillStyle = l.base;
    ctx.fillRect(0, 0, W, H);
    if (!src) return;
    const ts = Math.max(4, Math.round(l.tileSize || 48));
    const tint = tintFor(name);
    const pat = tilePattern(ctx, `${name}#${frame}|${ts}`, ts, x => {
      x.drawImage(tint ? shaded(src, 1, tint, name + '#' + frame) : src, 0, 0, ts, ts);
    });
    const ox = Math.round(frac(E.phase * Math.round(l.scrollX || 0)) * ts);
    const oy = Math.round(frac(E.phase * Math.round(l.scrollY || 0)) * ts);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(ox, oy);
    ctx.fillStyle = pat;
    ctx.fillRect(-ts, -ts, W + ts * 2, H + ts * 2);
    ctx.restore();
  },
  image(ctx, l, E, W, H) {
    ctx.fillStyle = l.base;
    ctx.fillRect(0, 0, W, H);
    const img = assetImage(E.doc, l.src);
    if (!img) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const cyc = Math.max(1, Math.round(l.kbCycles || 1));
    const zoom = 1 + (l.kenburns || 0) * (0.5 - 0.5 * Math.cos(TAU * cyc * E.phase));
    const s = Math.max(W / iw, H / ih) * zoom;
    ctx.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
  },
  rays(ctx, l, E, W, H) {
    const c = cols2(l);
    const c0 = c[0], c1 = c[1] || c[0];
    const cx = l.cx * W, cy = l.cy * H, R = Math.hypot(W, H) * 2.2;
    const n = Math.max(2, Math.round(l.rays));
    const a0 = TAU * Math.round(l.spin || 0) * E.phase;
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = c0;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = a0 + i * TAU / n;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.lineTo(cx + Math.cos(a + TAU / n / 2) * R, cy + Math.sin(a + TAU / n / 2) * R);
      ctx.closePath();
    }
    ctx.fill();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
  stars(ctx, l, E, W, H) {
    const c = cols2(l);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c[0]);
    g.addColorStop(1, c[1] || c[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const S = starsFor(l.seed, clamp(Math.round(l.count), 0, 1000));
    const u = Math.max(1, Math.round(Math.min(W, H) / 270));
    ctx.save();
    for (const s of S) {
      const a = 0.3 + 0.7 * (0.5 - 0.5 * Math.cos(TAU * (s.tw * E.phase + s.p)));
      const x = Math.round(s.x * W), y = Math.round(s.y * H), z = s.sz * u;
      ctx.fillStyle = s.c;
      ctx.globalAlpha = a;
      ctx.fillRect(x, y, z, z);
      if (s.b > 0.93) {
        ctx.globalAlpha = a * 0.6;
        ctx.fillRect(x - z * 2, y, z * 2, z);
        ctx.fillRect(x + z, y, z * 2, z);
        ctx.fillRect(x, y - z * 2, z, z * 2);
        ctx.fillRect(x, y + z, z, z * 2);
      }
    }
    ctx.restore();
  },
  checker(ctx, l, E, W, H) {
    const c = cols2(l);
    const c0 = c[0], c1 = c[1] || c[0];
    const s = Math.max(4, Math.round(l.size || 48));
    const pat = tilePattern(ctx, `chk|${c0}|${c1}|${s}`, s * 2, x => {
      x.fillStyle = c0;
      x.fillRect(0, 0, s * 2, s * 2);
      x.fillStyle = c1;
      x.fillRect(s, 0, s, s);
      x.fillRect(0, s, s, s);
    });
    const ox = Math.round(frac(E.phase * Math.round(l.scrollX || 0)) * s * 2);
    const oy = Math.round(frac(E.phase * Math.round(l.scrollY || 0)) * s * 2);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(ox, oy);
    ctx.fillStyle = pat;
    ctx.fillRect(-s * 2, -s * 2, W + s * 4, H + s * 4);
    ctx.restore();
  },
};

function overlays(ctx, l, W, H) {
  ctx.save();
  if (l.darken > 0) {
    ctx.fillStyle = `rgba(0,0,0,${clamp(l.darken, 0, 1)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (l.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${clamp(l.vignette, 0, 1)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (l.tintAmount > 0) {
    ctx.globalAlpha = clamp(l.tintAmount, 0, 1);
    ctx.fillStyle = l.tintColor;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

const BG_KINDS = [
  ['aurora', 'Aurora'], ['solid', 'Solid color'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient'],
  ['texture', 'Minecraft texture'], ['image', 'Image'], ['rays', 'Sunburst rays'], ['stars', 'Night sky'], ['checker', 'Checkerboard'],
];

const bgIn = (...k) => l => k.includes(l.kind);

export const background = {
  type: 'background',
  label: 'Background',
  full: true,
  defaults() {
    return {
      kind: 'aurora', color: '#14121f', colors: BG_DEFAULT_COLORS.slice(), base: '#0d0b14', angle: 135, shift: 0,
      cx: 0.5, cy: 0.5, radius: 0.8, seed: 7, tex: 'block/stone_bricks', tileSize: 48, scrollX: 0, scrollY: 0,
      src: '', kenburns: 0.08, kbCycles: 1, rays: 14, spin: 1, count: 140, size: 48,
      darken: 0, vignette: 0, tintColor: '#000000', tintAmount: 0, blur: 0, pixelate: 1,
    };
  },
  schema: [
    { k: 'kind', t: 'select', label: 'Style', opts: BG_KINDS },
    { k: 'color', t: 'color', label: 'Color', show: bgIn('solid') },
    { k: 'colors', t: 'colors', label: 'Colors', show: bgIn('linear', 'radial', 'aurora', 'rays', 'stars', 'checker') },
    { k: 'base', t: 'color', label: 'Base color', show: bgIn('aurora', 'texture', 'image') },
    { k: 'angle', t: 'range', label: 'Angle', min: 0, max: 360, step: 1, show: bgIn('linear') },
    { k: 'shift', t: 'range', label: 'Slide cycles per loop', min: 0, max: 6, step: 1, show: bgIn('linear') },
    { k: 'cx', t: 'range', label: 'Center X', min: 0, max: 1, step: 0.01, show: bgIn('radial', 'rays') },
    { k: 'cy', t: 'range', label: 'Center Y', min: 0, max: 1, step: 0.01, show: bgIn('radial', 'rays') },
    { k: 'radius', t: 'range', label: 'Radius', min: 0.1, max: 2, step: 0.05, show: bgIn('radial') },
    { k: 'rays', t: 'range', label: 'Rays', min: 4, max: 48, step: 1, show: bgIn('rays') },
    { k: 'spin', t: 'range', label: 'Turns per loop', min: -6, max: 6, step: 1, show: bgIn('rays') },
    { k: 'count', t: 'range', label: 'Stars', min: 10, max: 600, step: 1, show: bgIn('stars') },
    { k: 'seed', t: 'number', label: 'Seed', show: bgIn('aurora', 'stars') },
    { k: 'tex', t: 'texture', label: 'Texture', prefix: 'block/', show: bgIn('texture') },
    { k: 'tileSize', t: 'range', label: 'Tile size', min: 8, max: 200, step: 1, show: bgIn('texture') },
    { k: 'size', t: 'range', label: 'Square size', min: 8, max: 200, step: 1, show: bgIn('checker') },
    { k: 'scrollX', t: 'range', label: 'Scroll X per loop', min: -8, max: 8, step: 1, show: bgIn('texture', 'checker') },
    { k: 'scrollY', t: 'range', label: 'Scroll Y per loop', min: -8, max: 8, step: 1, show: bgIn('texture', 'checker') },
    { k: 'src', t: 'image', label: 'Image', show: bgIn('image') },
    { k: 'kenburns', t: 'range', label: 'Slow zoom', min: 0, max: 0.5, step: 0.01, show: bgIn('image') },
    { k: 'kbCycles', t: 'range', label: 'Zoom pulses per loop', min: 1, max: 4, step: 1, show: l => l.kind === 'image' && l.kenburns > 0 },
    { t: 'heading', label: 'Finish' },
    { k: 'darken', t: 'range', label: 'Darken', min: 0, max: 1, step: 0.01 },
    { k: 'vignette', t: 'range', label: 'Vignette', min: 0, max: 1, step: 0.01 },
    { k: 'tintColor', t: 'color', label: 'Tint color' },
    { k: 'tintAmount', t: 'range', label: 'Tint amount', min: 0, max: 1, step: 0.01 },
    { k: 'blur', t: 'range', label: 'Blur', min: 0, max: 20, step: 1, show: bgIn('image', 'texture') },
    { k: 'pixelate', t: 'range', label: 'Pixelate', min: 1, max: 16, step: 1 },
  ],
  draw(ctx, l, st, E) {
    const W = E.w, H = E.h;
    const body = BODY[l.kind] || BODY.aurora;
    const px = clamp(Math.round(l.pixelate || 1), 1, 16);
    const bl = l.kind === 'image' || l.kind === 'texture' ? clamp(l.blur || 0, 0, 20) : 0;
    if (px > 1 || bl > 0) {
      const sw = Math.ceil(W / px), sh = Math.ceil(H / px);
      const cv = scratch('bgbody', sw, sh);
      const x = cv.getContext('2d');
      x.save();
      x.scale(sw / W, sh / H);
      body(x, l, E, W, H);
      x.restore();
      const m = Math.ceil(bl * 2);
      ctx.save();
      if (bl > 0) addFilter(ctx, `blur(${bl}px)`);
      ctx.imageSmoothingEnabled = px === 1;
      ctx.drawImage(cv, -m, -m, W + m * 2, H + m * 2);
      ctx.restore();
    } else body(ctx, l, E, W, H);
    overlays(ctx, l, W, H);
  },
};

const SP = {
  leaf: ['...ccl', '..cccl', '.ccdcc', 'ccdcc.', 'cdcc..', 'd.....'],
  petal: ['.ccc.', 'ccccl', 'cccll', '.ccl.', '..c..'],
  s1: ['c'],
  s2: ['cc', 'cc'],
  flake: ['c.c.c', '.ccc.', 'ccccc', '.ccc.', 'c.c.c'],
  flake2: ['.c.c.', '..c..', 'ccccc', '..c..', '.c.c.'],
  sp1: ['W'],
  sp3: ['.c.', 'cWc', '.c.'],
  sp5: ['..c..', '..c..', 'ccWcc', '..c..', '..c..'],
  heart: ['.KK.KK.', 'KRRKRRK', 'KRWRRRK', 'KRRRRRK', '.KRRRK.', '..KRK..', '...K...'],
  orb4: ['.cc.', 'clWc', 'cllc', '.cc.'],
  orb6: ['..cc..', '.cllc.', 'clWWlc', 'clWllc', '.cllc.', '..cc..'],
  note: ['...KKK.', '...KccK', '...Kc.K', '...Kc..', '.KKKc..', 'KcccK..', 'KcccK..', '.KKK...'],
  bubble: ['..ccc..', '.cfffc.', 'cfWfffc', 'cfffffc', 'cfffffc', '.cfffc.', '..ccc..'],
};

const SP_PAL = {
  heart: { K: '#3a0000', R: '#ff1313', W: '#ffffff' },
  note: { K: '#1a1a1a' },
  bubble: { f: 'rgba(170,220,255,0.22)' },
};

const GLYPHS = [
  'xxx../x.x../xxxxx/..x.x/..xxx', 'x...x/xx.xx/x.x.x/x...x/xxxxx', '.xxx./x...x/x.x.x/x.xx./.x..x',
  'xxxx./x..x./xxxx./x..x./xxxxx', '..x../.xxx./x.x.x/.xxx./..x..', 'x.x.x/xxxxx/..x../xxxxx/x.x.x',
  'xx.../.xxx./...xx/.xx../xx.xx', 'x.xxx/xxx.x/x.x../xxxxx/..x.x', '.x.x./xxxxx/.x.x./x.x.x/xxxxx',
  'xxxxx/x...x/x.xxx/x.x../xxx..', '..xx./.x..x/xxxxx/x..x./.xx..', 'x..xx/xxx.x/.x.x./x.xxx/xx..x',
];

GLYPHS.forEach((g, i) => { SP['g' + i] = g.split('/').map(r => r.replace(/x/g, 'c')); });

const spriteCache = new Map();

function spr(id, col, sz) {
  col = col || '#ffffff';
  const key = `${id}|${col}|${sz}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const rows = SP[id];
  const pal = Object.assign({ c: col, l: mix(col, '#ffffff', 0.5), d: mix(col, '#000000', 0.35), W: '#ffffff' }, SP_PAL[id]);
  c = makeCanvas(rows[0].length * sz, rows.length * sz);
  const x = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '.') continue;
      x.fillStyle = pal[row[i]];
      x.fillRect(i * sz, y * sz, sz, sz);
    }
  });
  lim(spriteCache, 800);
  spriteCache.set(key, c);
  return c;
}

const PCOLS = {
  confetti: ['#ff3b3b', '#ffd84a', '#3bff6a', '#3bb4ff', '#b63bff', '#ff4fa3'],
};

const NAT = {
  leaves: { dir: 'down', spd: 55, sway: 30, wind: 0.25, cols: ['#4f9d2f', '#6dbb3a', '#8fcf4a', '#c9a227'] },
  cherry: { dir: 'down', spd: 40, sway: 36, wind: 0.3, cols: ['#ffb7d5', '#ff94bd', '#ffd6e8', '#ffffff'] },
  snow: { dir: 'down', spd: 45, sway: 14, wind: 0.1, cols: ['#ffffff', '#e8f4ff'] },
  sparkle: { dir: 'none', spd: 0, sway: 5, glow: 1, cols: ['#ffffff', '#fff1b0', '#c8ecff'] },
  stars: { dir: 'none', spd: 0, sway: 0, cols: ['#ffffff', '#cfe3ff', '#fff1c9'] },
  embers: { dir: 'up', spd: 70, sway: 22, wind: 0.1, glow: 1, cols: ['#ff7a1a', '#ffb02e', '#ffe066', '#ff4d0d'] },
  hearts: { dir: 'up', spd: 40, sway: 18, cols: ['#ff1313'] },
  xp: { dir: 'up', spd: 26, sway: 14, glow: 1, cols: ['#80ff20'] },
  notes: { dir: 'up', spd: 45, sway: 18, cols: ['#ffffff'] },
  bubbles: { dir: 'up', spd: 50, sway: 14, cols: ['#bfe8ff'] },
  rain: { dir: 'down', spd: 600, sway: 0, wind: 0.12, cols: ['#a9c8ff'] },
  confetti: { dir: 'down', spd: 110, sway: 24, wind: 0.05, cols: PCOLS.confetti },
  enchant: { dir: 'to', spd: 70, sway: 0, glow: 1, cols: ['#bfe4ff', '#ffffff', '#9fc8ff'] },
  dust: { dir: 'up', spd: 10, sway: 20, cols: ['#ffffff', '#ffe9c0'] },
  fireflies: { dir: 'none', spd: 0, sway: 70, glow: 1, cols: ['#d7ff4a', '#b8ff3a', '#fff27a'] },
  custom: { dir: 'down', spd: 45, sway: 20, cols: ['#ffffff'] },
};

const PARTICLE_KINDS = [
  ['sparkle', 'Sparkles'], ['leaves', 'Leaves'], ['cherry', 'Cherry petals'], ['snow', 'Snow'], ['stars', 'Twinkling stars'],
  ['embers', 'Embers'], ['hearts', 'Hearts'], ['xp', 'XP orbs'], ['notes', 'Music notes'], ['bubbles', 'Bubbles'],
  ['rain', 'Rain'], ['confetti', 'Confetti'], ['enchant', 'Enchanting glyphs'], ['dust', 'Dust motes'],
  ['fireflies', 'Fireflies'], ['custom', 'Custom texture or image'],
];

const pcache = new Map();

function gen(l, E, spec, dir, sz) {
  const key = [l.kind, l.seed, l.count, E.loop, E.w, E.h, l.speed, dir, l.ax, l.ay, l.aw, l.ah, sz, l.tx, l.ty].join('|');
  let out = pcache.get(key);
  if (out) return out;
  out = [];
  const n = clamp(Math.round(l.count), 0, 800);
  const W = E.w, H = E.h;
  const AX = l.ax * W, AY = l.ay * H, AW = Math.max(1, l.aw * W), AH = Math.max(1, l.ah * H);
  const m = 12 * sz + (l.kind === 'rain' ? 40 : 0);
  const sec = E.loop / 1000;
  for (let i = 0; i < n; i++) {
    const r = rng((l.seed | 0) * 1009 + i * 7 + 1);
    const P = {
      bx: r(), by: r(), s0: r(), rv: r(), v: r(), ci: Math.floor(r() * 997), sc: 1 + Math.floor(r() * 3), sc2: 1 + Math.floor(r() * 3),
      sp: r(), sp2: r(), sa: r(), spin: (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2)), tw: 1 + Math.floor(r() * 3), tp: r(),
      tc: 1 + Math.floor(r() * 2), hue: r(), vi: Math.floor(r() * 12), k: 1,
    };
    const pps = spec.spd * (l.speed || 1) * (0.65 + 0.7 * P.rv);
    let len = 1;
    if (dir === 'to') len = Math.max(80, Math.hypot(l.tx * W - (AX + P.bx * AW), l.ty * H - (AY + P.by * AH)));
    else if (dir === 'down' || dir === 'up') len = AH + 2 * m;
    else if (dir === 'left' || dir === 'right') len = AW + 2 * m;
    if (dir !== 'none') P.k = Math.max(1, Math.round(sec * pps / len));
    out.push(P);
  }
  lim(pcache, 40);
  pcache.set(key, out);
  return out;
}

const L = { img: null, a: 1, rot: 0, sx: 1, sy: 1, hc: null };

function look(kind, P, c) {
  const { sz, ph, col, u } = c;
  const w = 0.5 - 0.5 * Math.cos(TAU * (P.tw * ph + P.tp));
  L.a = 1; L.rot = 0; L.sx = 1; L.sy = 1; L.hc = col; L.img = null;
  switch (kind) {
    case 'leaves':
    case 'cherry':
      L.img = spr(kind === 'leaves' ? 'leaf' : 'petal', col, sz);
      L.rot = Math.floor(frac(P.sp + P.spin * ph) * 4) * Math.PI / 2;
      L.sx = Math.cos(TAU * (P.tw * ph + P.tp)) >= 0 ? 1 : -1;
      break;
    case 'snow':
      L.img = spr(P.v < 0.45 ? 's1' : P.v < 0.8 ? 's2' : P.v < 0.92 ? 'flake2' : 'flake', col, sz);
      L.a = 0.9;
      break;
    case 'sparkle': {
      const stage = w < 0.12 ? 0 : w < 0.4 ? 1 : w < 0.75 ? 2 : 3;
      if (stage) L.img = spr(['sp1', 'sp3', 'sp5'][stage - 1], col, sz);
      L.a = 0.55 + 0.15 * stage;
      break;
    }
    case 'stars':
      L.img = spr(P.v > 0.88 && w > 0.6 ? 'sp3' : 's1', col, sz);
      L.a = 0.25 + 0.75 * w;
      break;
    case 'embers':
      L.img = spr(P.v < 0.6 ? 's1' : 's2', col, sz);
      L.a = (1 - u * 0.7) * (0.7 + 0.3 * w);
      break;
    case 'hearts':
      L.img = spr('heart', null, sz);
      L.a = 0.95;
      L.hc = '#ff3030';
      break;
    case 'xp': {
      const t = Math.round((0.5 - 0.5 * Math.cos(TAU * (P.tc * ph + P.tp))) * 5 + 1e-6) / 5;
      L.hc = mix('#80ff20', '#ffff40', t);
      L.img = spr(P.v < 0.5 ? 'orb4' : 'orb6', L.hc, sz);
      L.a = 0.95;
      break;
    }
    case 'notes':
      L.hc = hsl(Math.round(P.hue * 24) / 24 * 360, 0.9, 0.55);
      L.img = spr('note', L.hc, sz);
      break;
    case 'bubbles':
      L.img = spr('bubble', col, sz);
      L.a = 0.85;
      break;
    case 'dust':
      L.img = spr('s2', col, sz);
      L.a = 0.15 + 0.35 * w;
      break;
    case 'enchant':
      L.img = spr('g' + P.vi, col, sz);
      break;
  }
}

function customImage(l, E, sz) {
  if (l.src) {
    const img = assetImage(E.doc, l.src);
    if (!img) return null;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    return { img, w: sz * 8, h: sz * 8 * ih / Math.max(1, iw), smooth: true };
  }
  const t = texture(l.tex || 'item/diamond', 0);
  if (!t) return null;
  const sc = Math.max(1, Math.round(sz / 2));
  return { img: t, w: t.width * sc, h: t.height * sc, smooth: false };
}

const dirIn = (...k) => l => k.includes(l.direction);

export const particles = {
  type: 'particles',
  label: 'Particles',
  full: true,
  defaults() {
    return {
      kind: 'sparkle', count: 40, size: 3, speed: 1, direction: 'auto', wind: 0, ax: 0, ay: 0, aw: 1, ah: 1,
      colors: [], seed: 1, fade: true, glow: false, tex: 'item/diamond', src: '', tx: 0.5, ty: 0.5,
    };
  },
  schema: [
    { k: 'kind', t: 'select', label: 'Kind', opts: PARTICLE_KINDS },
    { k: 'count', t: 'range', label: 'Amount', min: 1, max: 400, step: 1 },
    { k: 'size', t: 'range', label: 'Pixel size', min: 1, max: 12, step: 1 },
    { k: 'speed', t: 'range', label: 'Speed', min: 0.25, max: 4, step: 0.05 },
    { k: 'direction', t: 'select', label: 'Direction', opts: [['auto', 'Natural'], ['down', 'Down'], ['up', 'Up'], ['left', 'Left'], ['right', 'Right'], ['none', 'Stay in place']], show: l => l.kind !== 'enchant' },
    { k: 'wind', t: 'range', label: 'Wind', min: -1, max: 1, step: 0.05, show: l => l.kind !== 'enchant' },
    { k: 'colors', t: 'colors', label: 'Colors (empty for natural)', show: l => !['hearts', 'custom'].includes(l.kind) },
    { k: 'tx', t: 'range', label: 'Target X', min: 0, max: 1, step: 0.01, show: l => l.kind === 'enchant' },
    { k: 'ty', t: 'range', label: 'Target Y', min: 0, max: 1, step: 0.01, show: l => l.kind === 'enchant' },
    { k: 'tex', t: 'texture', label: 'Texture', prefix: 'item/', show: l => l.kind === 'custom' && !l.src },
    { k: 'src', t: 'image', label: 'Uploaded image', show: l => l.kind === 'custom' },
    { k: 'fade', t: 'check', label: 'Fade near edges' },
    { k: 'glow', t: 'check', label: 'Glow' },
    { k: 'seed', t: 'number', label: 'Seed' },
    { t: 'heading', label: 'Area' },
    { k: 'ax', t: 'range', label: 'Left', min: 0, max: 1, step: 0.01 },
    { k: 'ay', t: 'range', label: 'Top', min: 0, max: 1, step: 0.01 },
    { k: 'aw', t: 'range', label: 'Width', min: 0.05, max: 1, step: 0.01 },
    { k: 'ah', t: 'range', label: 'Height', min: 0.05, max: 1, step: 0.01 },
  ],
  draw(ctx, l, st, E) {
    const kind = NAT[l.kind] ? l.kind : 'sparkle';
    const spec = NAT[kind];
    const dir = kind === 'enchant' ? 'to' : l.direction && l.direction !== 'auto' ? l.direction : spec.dir;
    const sz = Math.max(1, Math.round(l.size || 3));
    const W = E.w, H = E.h, ph = E.phase;
    const AX = l.ax * W, AY = l.ay * H, AW = Math.max(1, l.aw * W), AH = Math.max(1, l.ah * H);
    const P = gen(Object.assign({}, l, { kind }), E, spec, dir, sz);
    const cols = l.colors && l.colors.length && !['hearts', 'custom'].includes(kind) ? l.colors : spec.cols;
    const wind = (l.wind || 0) + (spec.wind || 0);
    const m = 12 * sz + (kind === 'rain' ? 40 : 0);
    const glow = !!l.glow || !!spec.glow;
    const vert = dir === 'down' || dir === 'up', rev = dir === 'up' || dir === 'left';
    const custom = kind === 'custom' ? customImage(l, E, sz) : null;
    if (kind === 'custom' && !custom) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const col = cols[p.ci % cols.length];
      const sway = Math.sin(TAU * (p.sc * ph + p.sp)) * spec.sway * (0.4 + 0.6 * p.sa);
      let x, y, u = 0.5;
      if (dir === 'none') {
        x = AX + p.bx * AW + sway;
        y = AY + p.by * AH + Math.sin(TAU * (p.sc2 * ph + p.sp2)) * spec.sway * 0.8;
      } else if (dir === 'to') {
        u = frac(p.s0 + ph * p.k);
        const e = u * u * (3 - 2 * u);
        const sx = AX + p.bx * AW, sy = AY + p.by * AH;
        x = sx + (l.tx * W - sx) * e;
        y = sy + (l.ty * H - sy) * e;
      } else {
        u = frac(p.s0 + ph * p.k);
        const lenA = (vert ? AH : AW) + 2 * m, ext = vert ? AW : AH, start = vert ? AX : AY;
        const along = (rev ? 1 - u : u) * lenA - m + (vert ? AY : AX);
        const v0 = start + p.bx * ext + wind * u * lenA * 0.4;
        const v = start - m + pmod(v0 - start + m, ext + 2 * m) + sway;
        x = vert ? v : along;
        y = vert ? along : v;
      }
      let a = 1;
      if (kind === 'enchant') a = clamp(Math.min(u / 0.2, (1 - u) / 0.35), 0, 1);
      else if (l.fade && dir !== 'none') a = clamp(Math.min(u, 1 - u) / 0.12, 0, 1);
      if (a <= 0.003) continue;
      const w2 = 0.5 - 0.5 * Math.cos(TAU * (p.tw * ph + p.tp));
      if (kind === 'rain') {
        const dx = wind * 0.4, n = Math.hypot(dx, 1), len = sz * (6 + p.v * 6);
        ctx.globalAlpha = a * 0.55;
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, sz * 0.6);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dx / n * len, y - len / n);
        ctx.stroke();
        continue;
      }
      if (kind === 'confetti') {
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(TAU * (p.spin * ph + p.sp));
        ctx.scale(1, Math.cos(TAU * (p.tw * ph + p.tp)));
        ctx.globalAlpha = a;
        ctx.fillStyle = col;
        const cw = sz * (1.8 + p.v * 1.2);
        ctx.fillRect(-cw / 2, -sz * 0.7, cw, sz * 1.4);
        ctx.restore();
        continue;
      }
      if (kind === 'fireflies') {
        const b = Math.pow(Math.max(0, Math.sin(TAU * (p.tw * ph + p.tp))), 2) * 0.9 + 0.1;
        const r = sz * 7;
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * b;
        ctx.drawImage(halo(col, r), -r, -r);
        ctx.fillStyle = mix(col, '#ffffff', 0.5);
        ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
        ctx.restore();
        continue;
      }
      let img, rot = 0, sx = 1, sy = 1, hc = col;
      if (kind === 'custom') {
        img = custom.img;
        a *= 1;
      } else {
        look(kind, p, { sz, ph, col, u });
        img = L.img;
        a *= L.a; rot = L.rot; sx = L.sx; sy = L.sy; hc = L.hc;
      }
      if (!img || a <= 0.003) continue;
      const iw = custom ? custom.w : img.width, ih = custom ? custom.h : img.height;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (glow) {
        const hr = Math.max(iw, ih) * 1.5 + 6;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.7;
        const hi = halo(hc, hr);
        ctx.drawImage(hi, -hi.width / 2, -hi.height / 2);
      }
      ctx.globalAlpha = a;
      if (rot) ctx.rotate(rot);
      if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
      if (custom) ctx.imageSmoothingEnabled = custom.smooth;
      ctx.drawImage(img, -(iw >> 1), -(ih >> 1), iw, ih);
      ctx.restore();
      if (w2 < -1) break;
    }
    ctx.restore();
  },
};

function perimLen(w, h, r) {
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
}

function perimPoint(d, x, y, w, h, r) {
  r = Math.max(0, r);
  const a = Math.PI / 2 * r, sw = w - 2 * r, sh = h - 2 * r, P = 2 * sw + 2 * sh + 4 * a;
  d = pmod(d, P);
  let t;
  if (d < sw) return [x + r + d, y];
  d -= sw;
  if (d < a) { t = d / r; return [x + w - r + Math.sin(t) * r, y + r - Math.cos(t) * r]; }
  d -= a;
  if (d < sh) return [x + w, y + r + d];
  d -= sh;
  if (d < a) { t = d / r; return [x + w - r + Math.cos(t) * r, y + h - r + Math.sin(t) * r]; }
  d -= a;
  if (d < sw) return [x + w - r - d, y + h];
  d -= sw;
  if (d < a) { t = d / r; return [x + r - Math.sin(t) * r, y + h - r + Math.cos(t) * r]; }
  d -= a;
  if (d < sh) return [x, y + h - r - d];
  d -= sh;
  t = d / r;
  return [x + r - Math.cos(t) * r, y + r - Math.sin(t) * r];
}

function ring(ctx, X, Y, cols, rows, px, o, thick, tl, br, notch) {
  for (let t = 0; t < thick; t++) {
    const k = o + t, c = cols - 2 * k, r = rows - 2 * k;
    if (c < 2 || r < 2) break;
    const n = notch && t === 0 && o === 0 ? 1 : 0;
    ctx.fillStyle = tl;
    ctx.fillRect(X + (k + n) * px, Y + k * px, (c - 2 * n) * px, px);
    ctx.fillRect(X + k * px, Y + (k + 1) * px, px, (r - 2) * px);
    ctx.fillStyle = br;
    ctx.fillRect(X + (k + n) * px, Y + (rows - k - 1) * px, (c - 2 * n) * px, px);
    ctx.fillRect(X + (cols - k - 1) * px, Y + (k + 1) * px, px, (r - 2) * px);
  }
}

function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

const STYLE_OPTS = [
  ['gradient', 'Gradient'], ['solid', 'Solid'], ['double', 'Double line'], ['rgb', 'RGB cycle'], ['chase', 'Marching dashes'],
  ['glow', 'Inner glow'], ['pixel', 'Minecraft pixel frame'], ['panel', 'Minecraft panel frame'], ['corners', 'Corner brackets'], ['lights', 'Marquee lights'],
];

const bdIn = (...k) => l => k.includes(l.style);

export const border = {
  type: 'border',
  label: 'Border',
  full: true,
  defaults() {
    return {
      style: 'gradient', width: 6, color: '#ffd84a', color2: '#7a5200', colors: ['#ff3b3b', '#ffd84a', '#3bff6a', '#3bb4ff', '#b63bff'],
      radius: 0, inset: 0, cycles: 1, px: 4, cornerLen: 40,
    };
  },
  schema: [
    { k: 'style', t: 'select', label: 'Style', opts: STYLE_OPTS },
    { k: 'width', t: 'range', label: 'Thickness', min: 1, max: 60, step: 1 },
    { k: 'color', t: 'color', label: 'Color', show: bdIn('solid', 'double', 'chase', 'glow', 'pixel', 'corners') },
    { k: 'color2', t: 'color', label: 'Second color', show: bdIn('double', 'chase', 'pixel') },
    { k: 'colors', t: 'colors', label: 'Colors', show: bdIn('gradient', 'lights') },
    { k: 'radius', t: 'range', label: 'Corner radius', min: 0, max: 200, step: 1, show: l => !bdIn('pixel', 'panel')(l) },
    { k: 'inset', t: 'range', label: 'Inset', min: 0, max: 100, step: 1 },
    { k: 'cycles', t: 'range', label: 'Cycles per loop', min: 0, max: 8, step: 1, show: bdIn('gradient', 'rgb', 'chase', 'glow', 'lights') },
    { k: 'px', t: 'range', label: 'Pixel size', min: 1, max: 16, step: 1, show: bdIn('pixel', 'panel') },
    { k: 'cornerLen', t: 'range', label: 'Bracket length', min: 10, max: 400, step: 1, show: bdIn('corners') },
  ],
  draw(ctx, l, st, E) {
    const W = E.w, H = E.h, ph = E.phase;
    const wd = Math.max(1, l.width), ins = Math.max(0, l.inset || 0);
    const cyc = Math.max(0, Math.round(l.cycles || 0));
    const corner = E.doc.corner || 0;
    const style = l.style;
    ctx.save();
    if (style === 'pixel' || style === 'panel') {
      const px = Math.max(1, Math.round(l.px || 4));
      const iu = Math.round(ins / px);
      const cols = Math.floor(W / px) - iu * 2, rows = Math.floor(H / px) - iu * 2;
      const X = Math.floor((W - cols * px) / 2), Y = Math.floor((H - rows * px) / 2);
      const n = Math.max(1, Math.round(wd / px));
      ctx.imageSmoothingEnabled = false;
      if (style === 'pixel') {
        ring(ctx, X, Y, cols, rows, px, 0, 1, '#000000', '#000000', true);
        ring(ctx, X, Y, cols, rows, px, 1, n, l.color, l.color2, false);
        ring(ctx, X, Y, cols, rows, px, 1 + n, 1, 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.35)', false);
      } else {
        ring(ctx, X, Y, cols, rows, px, 0, 1, '#000000', '#000000', true);
        ring(ctx, X, Y, cols, rows, px, 1, 1, '#ffffff', '#555555', false);
        ring(ctx, X, Y, cols, rows, px, 2, n, '#c6c6c6', '#c6c6c6', false);
        ring(ctx, X, Y, cols, rows, px, 2 + n, 1, '#555555', '#ffffff', false);
      }
      ctx.restore();
      return;
    }
    const bx = ins + wd / 2, bw = W - bx * 2, bh = H - bx * 2;
    const rc = corner > 0 ? Math.max(0, corner - ins - wd / 2) : clamp(l.radius || 0, 0, Math.min(bw, bh) / 2);
    ctx.lineJoin = rc > 0 ? 'round' : 'miter';
    ctx.lineWidth = wd;
    if (style === 'solid') {
      rrPath(ctx, bx, bx, bw, bh, rc);
      ctx.strokeStyle = l.color;
      ctx.stroke();
    } else if (style === 'double') {
      const lw = wd * 0.35;
      ctx.lineWidth = lw;
      rrPath(ctx, ins + lw / 2, ins + lw / 2, W - ins * 2 - lw, H - ins * 2 - lw, Math.max(0, rc + wd / 2 - lw / 2));
      ctx.strokeStyle = l.color;
      ctx.stroke();
      const o = ins + wd - lw / 2;
      rrPath(ctx, o, o, W - o * 2, H - o * 2, Math.max(0, rc - wd / 2 + lw / 2));
      ctx.strokeStyle = l.color2;
      ctx.stroke();
    } else if (style === 'gradient' || style === 'rgb') {
      const a0 = TAU * cyc * ph;
      const stops = style === 'rgb' ? Array.from({ length: 12 }, (_, i) => hsl(i * 30, 1, 0.55)) : (l.colors && l.colors.length ? l.colors : ['#ffffff']);
      const g = ctx.createConicGradient(a0, W / 2, H / 2);
      stops.forEach((c, i) => g.addColorStop(i / stops.length, c));
      g.addColorStop(1, stops[0]);
      rrPath(ctx, bx, bx, bw, bh, rc);
      ctx.strokeStyle = g;
      ctx.stroke();
    } else if (style === 'chase') {
      const P = perimLen(bw, bh, Math.min(rc, bw / 2, bh / 2));
      const nd = Math.max(4, Math.round(P / Math.max(12, wd * 4)));
      const period = P / nd, c = Math.max(1, cyc);
      rrPath(ctx, bx, bx, bw, bh, rc);
      ctx.setLineDash([period * 0.5, period * 0.5]);
      ctx.lineDashOffset = -ph * c * period;
      ctx.strokeStyle = l.color;
      ctx.stroke();
      ctx.lineDashOffset = -ph * c * period - period / 2;
      ctx.strokeStyle = l.color2;
      ctx.stroke();
    } else if (style === 'glow') {
      const a = 0.65 + 0.35 * Math.sin(TAU * cyc * ph);
      const g = wd * 5, r = corner > 0 ? Math.max(0, corner - ins) : l.radius || 0;
      rrPath(ctx, ins, ins, W - ins * 2, H - ins * 2, r);
      ctx.clip();
      ctx.globalAlpha = clamp(a, 0, 1);
      const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const gr = ctx.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, l.color);
        gr.addColorStop(1, rgba(l.color, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(rx, ry, rw, rh);
      };
      edge(0, ins, 0, ins + g, 0, ins, W, g);
      edge(0, H - ins, 0, H - ins - g, 0, H - ins - g, W, g);
      edge(ins, 0, ins + g, 0, ins, 0, g, H);
      edge(W - ins, 0, W - ins - g, 0, W - ins - g, 0, g, H);
    } else if (style === 'corners') {
      const len = Math.min(l.cornerLen || 40, bw / 2, bh / 2);
      ctx.strokeStyle = l.color;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      const x0 = bx, y0 = bx, x1 = bx + bw, y1 = bx + bh;
      ctx.moveTo(x0, y0 + len); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0);
      ctx.moveTo(x1 - len, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + len);
      ctx.moveTo(x1, y1 - len); ctx.lineTo(x1, y1); ctx.lineTo(x1 - len, y1);
      ctx.moveTo(x0 + len, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - len);
      ctx.stroke();
    } else if (style === 'lights') {
      const off = ins + wd * 0.9, lw = W - off * 2, lh = H - off * 2;
      const r = Math.min(corner > 0 ? Math.max(0, corner - off) : l.radius || 0, lw / 2, lh / 2);
      const P = perimLen(lw, lh, r);
      const c = l.colors && l.colors.length ? l.colors : ['#ffd84a'];
      const nc = c.length, step = 2 * nc;
      const n = Math.max(step, Math.round(P / Math.max(10, wd * 3.2) / step) * step);
      const sec = E.loop / 1000;
      const total = Math.max(1, cyc) * step * Math.max(1, Math.round(sec * 6 / (step * Math.max(1, cyc))));
      const shift = Math.floor(ph * total);
      rrPath(ctx, off, off, lw, lh, r);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = wd * 1.5;
      ctx.stroke();
      const rb = Math.max(2.5, wd * 0.55);
      for (let i = 0; i < n; i++) {
        const idx = pmod(i - shift, step);
        const col = c[idx % nc], lit = idx % 2 === 0;
        const [x, y] = perimPoint(i * P / n, off, off, lw, lh, r);
        ctx.fillStyle = lit ? col : mix(col, '#000000', 0.65);
        ctx.beginPath();
        ctx.arc(x, y, rb, 0, TAU);
        ctx.fill();
        if (lit) {
          const hr = rb * 3.2, hi = halo(col, hr);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.8;
          ctx.drawImage(hi, x - hi.width / 2, y - hi.height / 2);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.arc(x, y, rb * 0.4, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  },
};
