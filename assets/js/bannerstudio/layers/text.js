import { makeCanvas } from '../assets.js';
import { assetFontFamily } from '../model.js';
import { hash, ease } from '../anim.js';

const TAU = Math.PI * 2;
export const MC_NATIVE = 8;

export const FONTS = [
  ['minecraft', 'Minecraft', 'Minecraft'],
  ['Lilita One', 'Lilita One', 'Lilita One'],
  ['Luckiest Guy', 'Luckiest Guy', 'Luckiest Guy'],
  ['Bungee', 'Bungee', 'Bungee'],
  ['Titan One', 'Titan One', 'Titan One'],
  ['Russo One', 'Russo One', 'Russo One'],
  ['Bebas Neue', 'Bebas Neue', 'Bebas Neue'],
  ['Press Start 2P', 'Press Start 2P', 'Press Start 2P'],
  ['Silkscreen', 'Silkscreen', 'Silkscreen'],
  ['Pixelify Sans', 'Pixelify Sans', 'Pixelify Sans'],
  ['Fredoka', 'Fredoka', 'Fredoka'],
  ['Cinzel Decorative', 'Cinzel Decorative', 'Cinzel Decorative'],
  ['Inter', 'Inter (clean)', 'Inter'],
  ['custom', 'Uploaded font', null],
];

const MC_COLORS = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
};
const SCRAMBLE = 'ABCDEFGHJKLMNOPQRSTUVWXYZ0123456789#$%&@?';

const layoutCache = new Map();
const spriteCache = new Map();
const loading = new Set();
let fontsHooked = false;

function hookFonts() {
  if (fontsHooked || typeof document === 'undefined' || !document.fonts) return;
  fontsHooked = true;
  document.fonts.addEventListener('loadingdone', () => { layoutCache.clear(); spriteCache.clear(); });
}

function family(layer, doc) {
  if (layer.font === 'custom') return (layer.fontAsset && assetFontFamily(doc, layer.fontAsset)) || 'sans-serif';
  const f = FONTS.find(x => x[0] === layer.font);
  return f ? f[2] : 'Minecraft';
}

function isPixel(layer) {
  return layer.font === 'minecraft' && layer.pixel !== false;
}

function fontString(layer, doc, px) {
  const fam = family(layer, doc);
  const s = `${layer.italic && !isPixel(layer) ? 'italic ' : ''}${layer.bold && !isPixel(layer) ? '700 ' : '400 '}${px}px "${fam}", sans-serif`;
  if (typeof document !== 'undefined' && document.fonts && !loading.has(s)) {
    loading.add(s);
    hookFonts();
    document.fonts.load(s).then(() => { layoutCache.clear(); spriteCache.clear(); }).catch(() => {});
  }
  return s;
}

function lighten(hex, k) {
  const n = parseInt((hex || '#ffffff').slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function mixHex(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

function stopsColor(stops, t) {
  if (stops.length === 1) return stops[0];
  const p = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p));
  return mixHex(stops[i], stops[i + 1], p - i);
}

function parse(line, codes) {
  const out = [];
  let st = { color: null, bold: false, italic: false, under: false, strike: false, obf: false };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (codes && (c === '&' || c === '§') && i + 1 < line.length) {
      if (line[i + 1] === '#' && /^[0-9a-fA-F]{6}$/.test(line.slice(i + 2, i + 8))) {
        st = { ...st, color: '#' + line.slice(i + 2, i + 8).toLowerCase(), obf: false, bold: false, italic: false, under: false, strike: false };
        i += 7;
        continue;
      }
      const k = line[i + 1].toLowerCase();
      if (MC_COLORS[k]) { st = { color: MC_COLORS[k], bold: false, italic: false, under: false, strike: false, obf: false }; i++; continue; }
      if (k === 'l') { st = { ...st, bold: true }; i++; continue; }
      if (k === 'o') { st = { ...st, italic: true }; i++; continue; }
      if (k === 'n') { st = { ...st, under: true }; i++; continue; }
      if (k === 'm') { st = { ...st, strike: true }; i++; continue; }
      if (k === 'k') { st = { ...st, obf: true }; i++; continue; }
      if (k === 'r') { st = { color: null, bold: false, italic: false, under: false, strike: false, obf: false }; i++; continue; }
    }
    out.push({ ch: c, ...st });
  }
  return out;
}

function countText(s, p) {
  if (p >= 1) return s;
  return s.replace(/\d[\d,.]*/g, m => {
    const clean = m.replace(/,/g, '');
    const n = parseFloat(clean);
    if (!isFinite(n)) return m;
    const dec = (clean.split('.')[1] || '').length;
    const v = n * p;
    let r = dec ? v.toFixed(dec) : String(Math.floor(v));
    if (m.includes(',')) r = Number(r).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return r;
  });
}

let measureCtx = null;
function mctx() {
  if (!measureCtx) measureCtx = makeCanvas(4, 4).getContext('2d');
  return measureCtx;
}

function layout(layer, doc, text) {
  const pix = isPixel(layer);
  const key = [text, layer.font, layer.fontAsset, layer.size, layer.bold, layer.italic, layer.letterSpacing, layer.lineHeight, layer.align, layer.codes, pix].join('|');
  let L = layoutCache.get(key);
  if (L) return L;
  const m = mctx();
  const k = pix ? Math.max(1, Math.round(layer.size / MC_NATIVE)) : 1;
  const px = pix ? MC_NATIVE : layer.size;
  m.font = fontString(layer, doc, px);
  const sp = (layer.letterSpacing || 0);
  const lh = (layer.lineHeight || 1.15) * (pix ? MC_NATIVE * k * 1.25 : layer.size);
  const lines = String(text).split('\n').map(s => parse(s, layer.codes !== false));
  const chars = [];
  let maxW = 0;
  const lineW = [];
  for (let li = 0; li < lines.length; li++) {
    let x = 0;
    for (const c of lines[li]) {
      let adv;
      if (pix) adv = (Math.round(m.measureText(c.ch).width) + (c.bold ? 1 : 0)) * k;
      else adv = m.measureText(c.ch).width;
      chars.push({ ...c, line: li, x, adv });
      x += adv + sp;
    }
    if (lines[li].length) x -= sp;
    lineW.push(x);
    maxW = Math.max(maxW, x);
  }
  for (const c of chars) {
    const off = layer.align === 'left' ? 0 : layer.align === 'right' ? maxW - lineW[c.line] : (maxW - lineW[c.line]) / 2;
    c.x += off;
    if (pix) c.x = Math.round(c.x / k) * k;
    c.y = c.line * lh;
  }
  const h = lines.length * lh - (pix ? MC_NATIVE * k * 0.25 * (layer.lineHeight || 1.15) : (layer.lineHeight - 1) * layer.size);
  L = { chars, w: Math.max(1, maxW), h: Math.max(1, h), k, pix, lh, lines: lines.length, font: m.font };
  if (layoutCache.size > 400) layoutCache.clear();
  layoutCache.set(key, L);
  return L;
}

const metricsCache = new Map();
function mcMetrics(fontStr) {
  let r = metricsCache.get(fontStr);
  if (r) return r;
  const m = mctx();
  m.font = fontStr;
  const top = Math.ceil(m.measureText('M').actualBoundingBoxAscent || MC_NATIVE * 0.875);
  const bot = Math.ceil(m.measureText('gjpqy,;').actualBoundingBoxDescent || MC_NATIVE * 0.25);
  const by = top + 1;
  r = { by, h: Math.max(by + Math.max(bot, 0) + 2, Math.round(MC_NATIVE * 1.75)) };
  if (typeof document !== 'undefined' && document.fonts && document.fonts.check(fontStr)) metricsCache.set(fontStr, r);
  return r;
}

function mcMask(ch, bold, italic, fontStr) {
  const key = 'm|' + ch + '|' + bold + '|' + italic + '|' + fontStr;
  let c = spriteCache.get(key);
  if (c) return c;
  const N = MC_NATIVE;
  const met = mcMetrics(fontStr);
  const by = met.by;
  const W = N * 2 + 4, H = met.h;
  c = makeCanvas(W, H);
  const x = c.getContext('2d');
  x.font = fontStr;
  x.fillStyle = '#fff';
  x.textBaseline = 'alphabetic';
  if (italic) x.setTransform(1, 0, -0.25, 1, N * 0.3, 0);
  x.fillText(ch, 1, by);
  if (bold) x.fillText(ch, 2, by);
  const d = x.getImageData(0, 0, W, H);
  for (let i = 3; i < d.data.length; i += 4) {
    const a = d.data[i] >= 100 ? 255 : 0;
    d.data[i - 3] = d.data[i - 2] = d.data[i - 1] = 255;
    d.data[i] = a;
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.putImageData(d, 0, 0);
  spriteCache.set(key, c);
  return c;
}

function mcSprite(mask, kind, fill, extra) {
  const key = kind + '|' + (Array.isArray(fill) ? fill.join(',') : fill) + '|' + extra + '|' + spriteKeyOf(mask);
  let c = spriteCache.get(key);
  if (c) return c;
  const pad = kind === 'outline' ? extra : 0;
  c = makeCanvas(mask.width + pad * 2, mask.height + pad * 2);
  const x = c.getContext('2d');
  if (kind === 'outline') {
    for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
      if (dx * dx + dy * dy > pad * pad + pad) continue;
      x.drawImage(mask, pad + dx, pad + dy);
    }
  } else {
    x.drawImage(mask, 0, 0);
  }
  x.globalCompositeOperation = 'source-in';
  if (Array.isArray(fill)) {
    const top = Math.round(MC_NATIVE * 0.25), bot = Math.round(MC_NATIVE * 1.25);
    const g = x.createLinearGradient(0, top + pad, 0, bot + pad);
    fill.forEach((col, i) => g.addColorStop(i / Math.max(1, fill.length - 1), col));
    x.fillStyle = g;
  } else {
    x.fillStyle = fill;
  }
  x.fillRect(0, 0, c.width, c.height);
  if (spriteCache.size > 3000) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}

const maskIds = new WeakMap();
let maskSeq = 0;
function spriteKeyOf(m) {
  let id = maskIds.get(m);
  if (!id) { id = ++maskSeq; maskIds.set(m, id); }
  return id;
}

function padOf(layer) {
  let p = Math.max(layer.outline || 0, 0);
  if (layer.shadowMode && layer.shadowMode !== 'none') p = Math.max(p, (layer.shadowDist || 4) + (layer.shadowMode === 'soft' ? 10 : 0));
  p = Math.max(p, layer.extrude || 0);
  if (layer.bgMode && layer.bgMode !== 'none') p = Math.max(p, layer.bgPad || 12);
  return p;
}

function displayText(layer, st) {
  let s = String(layer.text ?? '');
  if (st && st.count < 1) s = countText(s, st.count);
  return s;
}

const text = {
  type: 'text',
  label: 'Text',
  defaults(doc) {
    return {
      text: 'My Server',
      font: 'minecraft',
      size: Math.max(16, Math.round(Math.min(doc.h * 0.22, doc.w * 0.09) / 8) * 8),
      bold: false,
      italic: false,
      pixel: true,
      codes: true,
      align: 'center',
      letterSpacing: 0,
      lineHeight: 1.15,
      fillMode: 'solid',
      color: '#ffffff',
      colors: ['#ffe14d', '#ff8a1f'],
      gradDir: 'vertical',
      outline: 0,
      outlineColor: '#000000',
      shadowMode: 'mc',
      shadowColor: '#3f3f3f',
      shadowDist: 0,
      extrude: 0,
      extrudeColor: '',
      bgMode: 'none',
      bgColor: '#000000',
      bgOpacity: 0.45,
      bgPad: 10,
      bgRadius: 8,
      cursor: false,
    };
  },
  schema: [
    { k: 'text', t: 'textarea', label: 'Text' },
    { t: 'note', label: 'Minecraft codes work: &a green, &6 gold, &l bold, &k scramble, &#ff8800 hex. New line with Enter.' },
    { k: 'font', t: 'font', label: 'Font', opts: FONTS.map(f => [f[0], f[1]]) },
    { k: 'fontAsset', t: 'font-upload', label: 'Font file', show: l => l.font === 'custom' },
    { k: 'size', t: 'range', label: 'Size', min: 8, max: 320, step: 1 },
    { k: 'pixel', t: 'check', label: 'Pixel perfect (snaps to Minecraft pixels)', show: l => l.font === 'minecraft' },
    { k: 'bold', t: 'check', label: 'Bold', show: l => !isPixel(l) },
    { k: 'italic', t: 'check', label: 'Italic', show: l => !isPixel(l) },
    { k: 'align', t: 'select', label: 'Align', opts: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
    { k: 'letterSpacing', t: 'range', label: 'Letter spacing', min: -10, max: 60, step: 1 },
    { k: 'lineHeight', t: 'range', label: 'Line height', min: 0.6, max: 2.5, step: 0.05 },
    { t: 'heading', label: 'Fill' },
    { k: 'fillMode', t: 'select', label: 'Fill', opts: [['solid', 'Solid'], ['gradient', 'Gradient'], ['rainbow', 'Rainbow']] },
    { k: 'color', t: 'color', label: 'Color', show: l => l.fillMode === 'solid' },
    { k: 'colors', t: 'colors', label: 'Gradient colors', show: l => l.fillMode === 'gradient' },
    { k: 'gradDir', t: 'select', label: 'Direction', opts: [['vertical', 'Top to bottom'], ['horizontal', 'Left to right (per letter)']], show: l => l.fillMode === 'gradient' },
    { t: 'heading', label: 'Outline and depth' },
    { k: 'outline', t: 'range', label: 'Outline', min: 0, max: 24, step: 1 },
    { k: 'outlineColor', t: 'color', label: 'Outline color', show: l => l.outline > 0 },
    { k: 'shadowMode', t: 'select', label: 'Shadow', opts: [['none', 'None'], ['mc', 'Minecraft'], ['hard', 'Hard'], ['soft', 'Soft'], ['long', 'Long']] },
    { k: 'shadowColor', t: 'color', label: 'Shadow color', show: l => l.shadowMode !== 'none' && l.shadowMode !== 'mc' },
    { k: 'shadowDist', t: 'range', label: 'Shadow distance (0 = auto)', min: 0, max: 40, step: 1, show: l => l.shadowMode !== 'none' },
    { k: 'extrude', t: 'range', label: '3D extrude', min: 0, max: 40, step: 1 },
    { k: 'extrudeColor', t: 'color', label: 'Extrude color', show: l => l.extrude > 0 },
    { t: 'heading', label: 'Background' },
    { k: 'bgMode', t: 'select', label: 'Background', opts: [['none', 'None'], ['box', 'Box'], ['pill', 'Pill'], ['tag', 'Name tag']] },
    { k: 'bgColor', t: 'color', label: 'Box color', show: l => l.bgMode !== 'none' },
    { k: 'bgOpacity', t: 'range', label: 'Box opacity', min: 0, max: 1, step: 0.05, show: l => l.bgMode !== 'none' },
    { k: 'bgPad', t: 'range', label: 'Box padding', min: 0, max: 80, step: 1, show: l => l.bgMode !== 'none' },
    { k: 'bgRadius', t: 'range', label: 'Box rounding', min: 0, max: 60, step: 1, show: l => l.bgMode === 'box' },
    { k: 'cursor', t: 'check', label: 'Blinking cursor (for typewriter)' },
  ],
  bounds(layer, E) {
    const L = layout(layer, E.doc, displayText(layer, null));
    const p = padOf(layer);
    return { w: L.w + p * 2, h: L.h + p * 2 };
  },
  draw(ctx, layer, st, E) {
    const L = layout(layer, E.doc, displayText(layer, st));
    const ox = -L.w / 2, oy = -L.h / 2;
    const n = L.chars.length;
    const sizeK = layer.size / 16;
    const tick = Math.floor(E.t / 60);
    if (layer.bgMode && layer.bgMode !== 'none') {
      const p = layer.bgPad ?? 10;
      ctx.save();
      ctx.globalAlpha *= layer.bgOpacity ?? 0.45;
      ctx.fillStyle = layer.bgColor || '#000';
      const r = layer.bgMode === 'pill' ? (L.h + p * 2) / 2 : layer.bgMode === 'tag' ? 0 : (layer.bgRadius || 0);
      ctx.beginPath();
      ctx.roundRect(ox - p, oy - p, L.w + p * 2, L.h + p * 2, r);
      ctx.fill();
      ctx.restore();
    }
    const visible = st.chars >= 1 ? n : Math.floor(st.chars * n + 1e-6);
    const items = [];
    for (let i = 0; i < n; i++) {
      const c = L.chars[i];
      if (i >= visible) break;
      if (c.ch === ' ') continue;
      let ch = c.ch;
      if (c.obf || (st.scramble > 0 && i / n >= 1 - st.scramble)) ch = SCRAMBLE[Math.floor(hash(tick * 131 + i * 17) * SCRAMBLE.length)];
      let dy = 0, sc = 1, a = 1;
      if (st.wave) dy += Math.sin(TAU * st.wave.phase - i * 0.55) * st.wave.amp * sizeK;
      if (st.jump) {
        const loc = ((st.jump.phase - i / Math.max(1, n) * 0.5) % 1 + 1) % 1;
        if (loc < 0.18) dy -= Math.sin(loc / 0.18 * Math.PI) * st.jump.amp * 2 * sizeK;
      }
      if (st.charRise) {
        const start = n > 1 ? i / (n - 1) * 0.55 : 0;
        const r = Math.max(0, Math.min(1, (st.charRise.p - start) / 0.45));
        if (st.charRise.mode === 'up') {
          const e = ease('outCubic', r);
          dy += (1 - e) * layer.size * 0.9;
          a = r;
        } else {
          sc = ease('outBack', r);
          a = Math.min(1, r * 3);
        }
      }
      if (a <= 0 || sc <= 0) continue;
      let color;
      if (c.color) color = c.color;
      else if (st.rainbow || layer.fillMode === 'rainbow') {
        const ph = st.rainbow ? st.rainbow.phase : 0;
        color = hsl(((i * 22 - ph * 360) % 360 + 360) % 360);
      } else if (layer.fillMode === 'gradient') {
        const cols = layer.colors && layer.colors.length ? layer.colors : ['#ffffff'];
        color = layer.gradDir === 'horizontal' ? stopsColor(cols, L.w > 1 ? (c.x + c.adv / 2) / L.w : 0) : cols;
      } else color = layer.color || '#fff';
      items.push({ c, ch, x: ox + c.x, y: oy + c.y, dy, sc, a, color, i });
    }
    if (L.pix) drawPixel(ctx, layer, L, items, E);
    else drawSmooth(ctx, layer, L, items, oy);
    if (layer.cursor && st.chars < 1.0001) {
      const blinks = Math.max(1, Math.round(E.loop / 1000 * 2));
      if (Math.floor(E.phase * blinks * 2) % 2 === 0) {
        const last = items[items.length - 1];
        const cx = last ? last.x + last.c.adv + 2 : ox;
        const cy = last ? last.y : oy;
        ctx.fillStyle = layer.fillMode === 'solid' ? layer.color : '#fff';
        const h = L.pix ? MC_NATIVE * L.k : layer.size;
        ctx.fillRect(cx, cy + h * 0.85, Math.max(2, h * 0.5), Math.max(2, h * 0.12));
      }
    }
  },
};

function hsl(h) {
  const s = 1, l = 0.62;
  const f = n => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function shadowOf(layer, color) {
  if (layer.shadowMode === 'mc') {
    const base = Array.isArray(color) ? color[color.length - 1] : color;
    return mixHex(base, '#000000', 0.75);
  }
  return layer.shadowColor || '#000';
}

function drawPixel(ctx, layer, L, items, E) {
  const k = L.k;
  const fontStr = L.font;
  ctx.imageSmoothingEnabled = false;
  const outN = layer.outline > 0 ? Math.max(1, Math.round(layer.outline / k)) : 0;
  const sd = layer.shadowMode && layer.shadowMode !== 'none' ? (layer.shadowDist ? Math.max(1, Math.round(layer.shadowDist / k)) : 1) : 0;
  const ext = layer.extrude > 0 ? Math.max(1, Math.round(layer.extrude / k)) : 0;
  const pass = (fn) => {
    for (const it of items) {
      const mask = mcMask(it.ch, it.c.bold, it.c.italic, fontStr);
      ctx.save();
      ctx.globalAlpha *= it.a;
      const cx = it.x + it.c.adv / 2, cy = it.y + MC_NATIVE * k * 0.6;
      ctx.translate(cx, cy + it.dy);
      if (it.sc !== 1) ctx.scale(it.sc, it.sc);
      ctx.translate(-cx, -cy);
      fn(it, mask);
      ctx.restore();
    }
  };
  const put = (spr, x, y, pad) => ctx.drawImage(spr, Math.round(x) - (1 + pad) * k, Math.round(y) - pad * k, spr.width * k, spr.height * k);
  if (ext) {
    pass((it, mask) => {
      const col = layer.extrudeColor || mixHex(Array.isArray(it.color) ? it.color[it.color.length - 1] : it.color, '#000000', 0.55);
      const spr = mcSprite(outN ? mcSprite(mask, 'outline', '#fff', outN) : mask, 'fill', col, 'x');
      for (let d = ext; d >= 1; d--) put(spr, it.x + d * k * 0.5, it.y + d * k, outN);
    });
  }
  if (sd && layer.shadowMode !== 'soft') {
    pass((it, mask) => {
      const col = shadowOf(layer, it.color);
      const src = outN ? mcSprite(mask, 'outline', '#fff', outN) : mask;
      const spr = mcSprite(src, 'fill', col, 's');
      if (layer.shadowMode === 'long') {
        const steps = Math.max(2, sd * 3);
        for (let d = steps; d >= 1; d--) put(spr, it.x + d * k, it.y + d * k, outN);
      } else {
        put(spr, it.x + sd * k, it.y + sd * k, outN);
      }
    });
  }
  if (sd && layer.shadowMode === 'soft') {
    ctx.save();
    ctx.shadowColor = layer.shadowColor || '#000';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = sd * k;
    ctx.shadowOffsetY = sd * k;
    pass((it, mask) => put(mcSprite(outN ? mcSprite(mask, 'outline', '#fff', outN) : mask, 'fill', '#000', 'sx'), it.x, it.y, outN));
    ctx.restore();
  }
  if (outN) pass((it, mask) => put(mcSprite(mask, 'outline', layer.outlineColor || '#000', outN), it.x, it.y, outN));
  pass((it, mask) => put(mcSprite(mask, 'fill', it.color, ''), it.x, it.y, 0));
  pass((it) => {
    if (!it.c.under && !it.c.strike) return;
    ctx.fillStyle = Array.isArray(it.color) ? it.color[0] : it.color;
    if (it.c.under) ctx.fillRect(it.x - k, it.y + MC_NATIVE * k * 1.0, it.c.adv + k, k);
    if (it.c.strike) ctx.fillRect(it.x - k, it.y + MC_NATIVE * k * 0.55, it.c.adv + k, k);
  });
}

function drawSmooth(ctx, layer, L, items, oy) {
  ctx.font = L.font;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const asc = layer.size * 0.82;
  const sd = layer.shadowMode && layer.shadowMode !== 'none' ? (layer.shadowDist || Math.max(2, Math.round(layer.size / 14))) : 0;
  const fillFor = (it) => {
    if (!Array.isArray(it.color)) return it.color;
    const g = ctx.createLinearGradient(0, it.y, 0, it.y + layer.size);
    it.color.forEach((c, i) => g.addColorStop(i / Math.max(1, it.color.length - 1), c));
    return g;
  };
  const pass = (fn) => {
    for (const it of items) {
      ctx.save();
      ctx.globalAlpha *= it.a;
      const cx = it.x + it.c.adv / 2, cy = it.y + layer.size * 0.5;
      ctx.translate(cx, cy + it.dy);
      if (it.sc !== 1) ctx.scale(it.sc, it.sc);
      ctx.translate(-cx, -cy);
      if (it.c.bold && !layer.bold) ctx.font = L.font.replace(/400/, '700');
      fn(it);
      ctx.restore();
    }
  };
  const ow = layer.outline || 0;
  if (layer.extrude > 0) {
    pass(it => {
      const col = layer.extrudeColor || mixHex(Array.isArray(it.color) ? it.color[it.color.length - 1] : it.color, '#000000', 0.55);
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.lineWidth = ow * 2;
      for (let d = layer.extrude; d >= 1; d--) {
        if (ow) ctx.strokeText(it.ch, it.x + d * 0.4, it.y + asc + d);
        ctx.fillText(it.ch, it.x + d * 0.4, it.y + asc + d);
      }
    });
  }
  if (sd) {
    pass(it => {
      const col = shadowOf(layer, it.color);
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.lineWidth = ow * 2;
      if (layer.shadowMode === 'soft') {
        ctx.shadowColor = col;
        ctx.shadowBlur = sd * 2.5;
        ctx.shadowOffsetX = sd * 0.6;
        ctx.shadowOffsetY = sd;
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.globalAlpha *= 1;
        ctx.fillStyle = col;
        if (ow) ctx.strokeText(it.ch, it.x, it.y + asc);
        ctx.fillText(it.ch, it.x, it.y + asc);
      } else if (layer.shadowMode === 'long') {
        for (let d = sd * 3; d >= 1; d--) {
          if (ow) ctx.strokeText(it.ch, it.x + d, it.y + asc + d);
          ctx.fillText(it.ch, it.x + d, it.y + asc + d);
        }
      } else {
        if (ow) ctx.strokeText(it.ch, it.x + sd, it.y + asc + sd);
        ctx.fillText(it.ch, it.x + sd, it.y + asc + sd);
      }
    });
  }
  if (ow) {
    pass(it => {
      ctx.strokeStyle = layer.outlineColor || '#000';
      ctx.lineWidth = ow * 2;
      ctx.strokeText(it.ch, it.x, it.y + asc);
    });
  }
  pass(it => {
    ctx.fillStyle = fillFor(it);
    ctx.fillText(it.ch, it.x, it.y + asc);
    if (it.c.under || it.c.strike) {
      const t = Math.max(1, layer.size / 14);
      if (it.c.under) ctx.fillRect(it.x, it.y + asc + t * 1.5, it.c.adv, t);
      if (it.c.strike) ctx.fillRect(it.x, it.y + asc * 0.62, it.c.adv, t);
    }
  });
}

export default text;
