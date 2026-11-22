import { computeState, loopMs, hash } from './anim.js';
import { TYPES } from './layers/index.js';
import { makeCanvas } from './assets.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const pool = [];
let stripe = null;

function buf(i, w, h) {
  let c = pool[i];
  if (!c) c = pool[i] = makeCanvas(w, h);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.filter = 'none';
  x.shadowColor = 'transparent';
  x.shadowBlur = 0;
  x.shadowOffsetX = 0;
  x.shadowOffsetY = 0;
  x.imageSmoothingEnabled = true;
  x.clearRect(0, 0, w, h);
  return c;
}

function glintTile() {
  if (stripe) return stripe;
  stripe = makeCanvas(64, 64);
  const x = stripe.getContext('2d');
  const img = x.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let px = 0; px < 64; px++) {
      const u = ((px + y) % 64) / 64;
      const v = ((px * 2 - y + 128) % 64) / 64;
      const a = Math.pow(Math.max(0, Math.sin(u * TAU)), 6) * 0.9 + Math.pow(Math.max(0, Math.sin(v * TAU * 2)), 10) * 0.5;
      const i = (y * 64 + px) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return stripe;
}

export function env(doc, t) {
  const loop = loopMs(doc);
  const tt = ((t % loop) + loop) % loop;
  return { doc, t: tt, loop, phase: tt / loop, w: doc.w, h: doc.h, sec: tt / 1000, fps: doc.fps };
}

export function renderFrame(ctx, doc, t, opts = {}) {
  const E = env(doc, t);
  E.editor = !!opts.editor;
  const base = ctx.getTransform();
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.setTransform(base);
  if (doc.corner > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, doc.w, doc.h, doc.corner);
    ctx.clip();
  }
  if (!doc.transparent) {
    ctx.fillStyle = doc.bg || '#000';
    ctx.fillRect(0, 0, doc.w, doc.h);
  }
  for (const layer of doc.layers) {
    if (layer.hidden) continue;
    if (opts.solo && opts.solo !== layer.id) continue;
    const T = TYPES[layer.type];
    if (!T) continue;
    const st = computeState(doc, layer, E.t, { static: opts.static, globalTransitions: false });
    if (!st || st.alpha <= 0.001) continue;
    drawLayer(ctx, base, layer, T, st, E, cw, ch);
  }
  ctx.restore();
}

function localBox(layer, T, E) {
  if (T.full) return { x: 0, y: 0, w: E.w, h: E.h };
  const b = T.bounds(layer, E);
  return { x: -b.w / 2, y: -b.h / 2, w: b.w, h: b.h };
}

function paint(c, layer, T, st, E) {
  c.save();
  if (T.full) {
    c.translate(st.dx, st.dy);
    if (st.sx !== 1 || st.sy !== 1 || st.rot) {
      c.translate(E.w / 2, E.h / 2);
      c.rotate(st.rot * DEG);
      c.scale(st.sx, st.sy);
      c.translate(-E.w / 2, -E.h / 2);
    }
  } else {
    c.translate(layer.x + st.dx, layer.y + st.dy);
    c.rotate((layer.rot + st.rot) * DEG);
    c.scale(layer.scale * st.sx * (layer.flipX ? -1 : 1), layer.scale * st.sy);
  }
  const f = [];
  if (st.blur > 0.3) f.push(`blur(${st.blur.toFixed(1)}px)`);
  if (st.hue) f.push(`hue-rotate(${Math.round(st.hue % 360)}deg)`);
  if (f.length) c.filter = f.join(' ');
  if (st.clip) {
    const b = localBox(layer, T, E);
    const pad = T.full ? 0 : 40;
    const x0 = b.x - pad, y0 = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2;
    const p = Math.max(0, Math.min(1, st.clip.p));
    c.beginPath();
    switch (st.clip.mode) {
      case 'right': c.rect(x0, y0, w * p, h); break;
      case 'left': c.rect(x0 + w * (1 - p), y0, w * p, h); break;
      case 'down': c.rect(x0, y0, w, h * p); break;
      case 'up': c.rect(x0, y0 + h * (1 - p), w, h * p); break;
      case 'iris': c.arc(x0 + w / 2, y0 + h / 2, Math.max(0.01, p * Math.hypot(w, h) / 2), 0, TAU); break;
    }
    c.clip();
  }
  T.draw(c, layer, st, E);
  c.restore();
}

function screenBox(layer, T, st, E) {
  if (T.full) return { x: 0, y: 0, w: E.w, h: E.h };
  const b = T.bounds(layer, E);
  const s = Math.abs(layer.scale * st.sx);
  const w = b.w * s, h = b.h * Math.abs(layer.scale * st.sy);
  const r = (layer.rot + st.rot) * DEG;
  const cw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r));
  const chh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
  return { x: layer.x + st.dx - cw / 2, y: layer.y + st.dy - chh / 2, w: cw, h: chh };
}

function silhouette(src, color, cw, ch, slot) {
  const s = buf(slot, cw, ch);
  const x = s.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, cw, ch);
  return s;
}

function drawLayer(ctx, base, layer, T, st, E, cw, ch) {
  const fx = (layer.fx || []).filter(f => !f.off);
  const alpha = Math.max(0, Math.min(1, st.alpha * (layer.opacity ?? 1)));
  const blend = layer.blend || 'source-over';
  const direct = !fx.length && st.glitch <= 0 && (alpha >= 0.999 || T.simpleAlpha);
  if (direct) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = blend;
    paint(ctx, layer, T, st, E);
    ctx.restore();
    return;
  }
  const b = buf(0, cw, ch);
  const bx = b.getContext('2d');
  bx.setTransform(base);
  paint(bx, layer, T, st, E);
  bx.setTransform(1, 0, 0, 1, 0, 0);
  const k = base.a || 1;
  const box = screenBox(layer, T, st, E);
  for (const f of fx) {
    if (f.type === 'shine') {
      const cyc = Math.max(1, Math.round(f.cycles || 1));
      const local = (E.phase * cyc) % 1;
      const portion = Math.max(0.05, Math.min(1, f.portion ?? 0.35));
      if (local > portion) continue;
      const q = local / portion;
      const ang = (f.angle || 0) * DEG;
      const bw = (f.width || 40) * k;
      const span = (box.w + box.h * Math.abs(Math.tan(ang))) * k + bw * 2;
      const cx = (box.x) * k - bw + q * span;
      const cy = (box.y + box.h / 2) * k;
      bx.save();
      bx.globalCompositeOperation = 'source-atop';
      bx.globalAlpha = f.opacity ?? 0.85;
      bx.translate(cx, cy);
      bx.rotate(ang);
      const g = bx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, f.color || '#fff');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      bx.fillStyle = g;
      bx.fillRect(-bw / 2, -ch * 2, bw, ch * 4);
      bx.restore();
    } else if (f.type === 'glint') {
      const g = buf(3, cw, ch);
      const gx = g.getContext('2d');
      gx.drawImage(b, 0, 0);
      gx.globalCompositeOperation = 'source-in';
      const tile = glintTile();
      const pat = gx.createPattern(tile, 'repeat');
      const sc = (f.scale || 1) * k;
      const cyc = Math.max(1, Math.round(f.cycles || 1));
      const off = E.phase * cyc * 64;
      pat.setTransform(new DOMMatrix().scale(sc).translate(off, off * 0.5));
      gx.fillStyle = pat;
      gx.fillRect(0, 0, cw, ch);
      gx.globalCompositeOperation = 'multiply';
      gx.fillStyle = f.color || '#a35cff';
      gx.fillRect(0, 0, cw, ch);
      gx.globalCompositeOperation = 'destination-in';
      gx.drawImage(b, 0, 0);
      bx.save();
      bx.globalCompositeOperation = 'lighter';
      bx.globalAlpha = Math.min(1, f.strength ?? 0.55);
      bx.drawImage(g, 0, 0);
      if ((f.strength ?? 0.55) > 1) {
        bx.globalAlpha = (f.strength - 1);
        bx.drawImage(g, 0, 0);
      }
      bx.restore();
    }
  }
  let out = b;
  const behind = fx.filter(f => ['outline', 'shadow', 'glow', 'rgbsplit'].includes(f.type));
  if (behind.length) {
    let cur = b;
    let slot = 2;
    for (const f of behind) {
      const nxt = buf(slot, cw, ch);
      const nx = nxt.getContext('2d');
      if (f.type === 'outline') {
        const s = silhouette(cur, f.color || '#000', cw, ch, 1);
        const r = Math.max(1, f.width || 3) * k;
        const n = r <= 2 ? 8 : 16;
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU;
          nx.drawImage(s, Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r));
        }
        nx.drawImage(cur, 0, 0);
      } else if (f.type === 'shadow') {
        const s = silhouette(cur, f.color || '#000', cw, ch, 1);
        nx.save();
        nx.globalAlpha = f.opacity ?? 0.6;
        if (f.blur > 0) nx.filter = `blur(${f.blur * k}px)`;
        nx.drawImage(s, (f.dx || 0) * k, (f.dy || 0) * k);
        nx.restore();
        nx.drawImage(cur, 0, 0);
      } else if (f.type === 'glow') {
        const cyc = Math.max(1, Math.round(f.cycles || 2));
        const pulse = 1 - (f.pulse || 0) * (0.5 - 0.5 * Math.cos(E.phase * cyc * TAU));
        const s = silhouette(cur, f.color || '#ffd84a', cw, ch, 1);
        nx.save();
        nx.filter = `blur(${Math.max(1, (f.blur || 16) * k * (0.6 + 0.4 * pulse))}px)`;
        nx.globalAlpha = pulse;
        const n = Math.max(1, Math.round(f.strength || 1));
        for (let i = 0; i < n; i++) nx.drawImage(s, 0, 0);
        nx.restore();
        nx.drawImage(cur, 0, 0);
      } else if (f.type === 'rgbsplit') {
        const cyc = Math.max(1, Math.round(f.cycles || 4));
        const step = Math.floor(E.phase * cyc * 4);
        const j = (f.jitter || 0) * (hash(step) - 0.5) * 2;
        const a = Math.max(1, (f.amount || 3) * (1 + j)) * k;
        const r = silhouette(cur, '#ff2050', cw, ch, 1);
        nx.save();
        nx.globalAlpha = 0.75;
        nx.drawImage(r, -a, 0);
        nx.globalCompositeOperation = 'screen';
        const c2 = silhouette(cur, '#20e0ff', cw, ch, 1);
        nx.drawImage(c2, a, 0);
        nx.restore();
        nx.drawImage(cur, 0, 0);
      }
      cur = nxt;
      slot = slot === 2 ? 4 : 2;
    }
    out = cur;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = blend;
  if (st.glitch > 0.01) {
    const g = st.glitch;
    const slices = 10;
    const tick = Math.floor(E.t / 60);
    const sh = Math.ceil(ch / slices);
    for (let i = 0; i < slices; i++) {
      const r = hash(tick * 31 + i * 7);
      const off = (r - 0.5) * 2 * g * 40 * k * (r > 0.55 ? 1 : 0.15);
      ctx.drawImage(out, 0, i * sh, cw, sh, off, i * sh, cw, sh);
    }
    if (g > 0.2) {
      ctx.globalAlpha = alpha * g * 0.6;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(silhouette(out, '#ff0040', cw, ch, 1), -g * 6 * k, 0);
      ctx.drawImage(silhouette(out, '#00e5ff', cw, ch, 1), g * 6 * k, 0);
    }
  } else {
    ctx.drawImage(out, 0, 0);
  }
  ctx.restore();
}

export function layerCorners(doc, layer, t) {
  const T = TYPES[layer.type];
  if (!T || T.full) return null;
  const E = env(doc, t);
  const b = T.bounds(layer, E);
  const r = layer.rot * DEG, s = layer.scale;
  const c = Math.cos(r), sn = Math.sin(r);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([ux, uy]) => {
    const x = ux * b.w / 2 * s * (layer.flipX ? -1 : 1), y = uy * b.h / 2 * s;
    return [layer.x + x * c - y * sn, layer.y + x * sn + y * c];
  });
}

export function hitTest(doc, x, y, t) {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (l.hidden || l.locked) continue;
    const T = TYPES[l.type];
    if (!T || T.full) continue;
    const st = computeState(doc, l, t, { static: true });
    if (!st) continue;
    const E = env(doc, t);
    const b = T.bounds(l, E);
    const r = -l.rot * DEG;
    const dx = x - l.x, dy = y - l.y;
    const lx = (dx * Math.cos(r) - dy * Math.sin(r)) / l.scale;
    const ly = (dx * Math.sin(r) + dy * Math.cos(r)) / l.scale;
    if (Math.abs(lx) <= b.w / 2 + 2 && Math.abs(ly) <= b.h / 2 + 2) return l;
  }
  return null;
}
