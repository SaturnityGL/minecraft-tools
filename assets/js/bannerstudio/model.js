import { TYPES } from './layers/index.js';

export const PRESETS = [
  { id: 'serverlist', label: 'Server list banner', w: 468, h: 60, note: 'The classic size most Minecraft server list sites ask for.' },
  { id: 'leaderboard', label: 'Wide server banner', w: 728, h: 90, note: 'Leaderboard size used by some server lists and forums.' },
  { id: 'discord-banner', label: 'Discord server banner', w: 960, h: 540, note: 'Shown at the top of your channel list. Animated needs Boost level 3.' },
  { id: 'discord-profile', label: 'Discord profile banner', w: 680, h: 240, note: 'Animated profile banners need Nitro.' },
  { id: 'discord-splash', label: 'Discord invite splash', w: 1920, h: 1080, note: 'Background behind your invite link. Discord shows it as a still image.' },
  { id: 'x-header', label: 'X / Twitter header', w: 1500, h: 500, note: 'Profile header. X shows the first frame of a GIF.' },
  { id: 'youtube', label: 'YouTube banner', w: 2048, h: 1152, note: 'Keep text inside the middle 1235x338 safe area.' },
  { id: 'sig', label: 'Forum signature', w: 500, h: 150, note: 'Fits most forum signature limits.' },
  { id: 'twitch', label: 'Twitch panel', w: 320, h: 160, note: 'About section panel.' },
  { id: 'square', label: 'Square post', w: 512, h: 512, note: 'Socials, Discord announcements, store art.' },
  { id: 'icon', label: 'Server icon', w: 64, h: 64, note: 'server-icon.png is 64x64 and must be a still PNG.' },
];

export const FPS_OPTIONS = [
  [10, '10 fps (smallest file)'], [20, '20 fps (Minecraft tick rate)'], [25, '25 fps (smooth)'], [50, '50 fps (silky, big file)'],
];

export const BLENDS = [
  ['source-over', 'Normal'], ['screen', 'Screen'], ['lighter', 'Add (glow)'], ['multiply', 'Multiply'], ['overlay', 'Overlay'],
  ['soft-light', 'Soft light'], ['color-dodge', 'Color dodge'], ['difference', 'Difference'], ['hue', 'Hue'], ['color', 'Color'], ['luminosity', 'Luminosity'],
];

export const FX = [
  ['outline', 'Outline', { color: '#000000', width: 3 }],
  ['shadow', 'Drop shadow', { color: '#000000', dx: 4, dy: 4, blur: 0, opacity: 0.6 }],
  ['glow', 'Glow', { color: '#ffd84a', blur: 16, strength: 1, pulse: 0, cycles: 2 }],
  ['shine', 'Shine sweep', { color: '#ffffff', width: 40, angle: 20, cycles: 1, portion: 0.35, opacity: 0.85 }],
  ['glint', 'Enchant glint', { color: '#a35cff', strength: 0.55, cycles: 1, scale: 1 }],
  ['rgbsplit', 'RGB split', { amount: 3, jitter: 0, cycles: 4 }],
];

export const FX_FIELDS = {
  outline: [['color', 'color', 'Color'], ['width', 'range', 'Width', 1, 16, 1]],
  shadow: [['color', 'color', 'Color'], ['dx', 'range', 'Offset X', -30, 30, 1], ['dy', 'range', 'Offset Y', -30, 30, 1], ['blur', 'range', 'Blur', 0, 40, 1], ['opacity', 'range', 'Opacity', 0, 1, 0.05]],
  glow: [['color', 'color', 'Color'], ['blur', 'range', 'Size', 2, 60, 1], ['strength', 'range', 'Strength', 1, 4, 1], ['pulse', 'range', 'Pulse', 0, 1, 0.05], ['cycles', 'range', 'Pulses per loop', 1, 12, 1]],
  shine: [['color', 'color', 'Color'], ['width', 'range', 'Band width', 6, 200, 1], ['angle', 'range', 'Angle', -60, 60, 1], ['cycles', 'range', 'Sweeps per loop', 1, 8, 1], ['portion', 'range', 'Sweep speed', 0.1, 1, 0.05], ['opacity', 'range', 'Opacity', 0.1, 1, 0.05]],
  glint: [['color', 'color', 'Color'], ['strength', 'range', 'Strength', 0.1, 1.5, 0.05], ['cycles', 'range', 'Speed', 1, 8, 1], ['scale', 'range', 'Stripe size', 0.5, 4, 0.1]],
  rgbsplit: [['amount', 'range', 'Amount', 1, 20, 1], ['jitter', 'range', 'Jitter', 0, 1, 0.05], ['cycles', 'range', 'Jitter speed', 1, 24, 1]],
};

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function newDoc(presetId = 'discord-banner') {
  const p = PRESETS.find(x => x.id === presetId) || PRESETS[2];
  return {
    v: 1,
    name: 'Untitled banner',
    preset: p.id,
    w: p.w,
    h: p.h,
    fps: 25,
    bg: '#16141f',
    transparent: false,
    corner: 0,
    scenes: [{ id: uid(), name: 'Scene 1', dur: 3000 }],
    layers: [],
    assets: {},
  };
}

export function newLayer(doc, type, over = {}) {
  const T = TYPES[type];
  const base = {
    id: uid(),
    type,
    name: T.label,
    scene: null,
    hidden: false,
    locked: false,
    x: Math.round(doc.w / 2),
    y: Math.round(doc.h / 2),
    rot: 0,
    scale: 1,
    opacity: 1,
    blend: 'source-over',
    flipX: false,
    enter: { type: 'none', dur: 500, delay: 0, ease: 'outBack' },
    exit: { type: 'none', dur: 350, ease: 'inCubic' },
    motion: [],
    fx: [],
  };
  const l = Object.assign(base, T.defaults(doc), over);
  if (over.enter) l.enter = Object.assign({}, base.enter, over.enter);
  if (over.exit) l.exit = Object.assign({}, base.exit, over.exit);
  return l;
}

export function normalizeDoc(raw) {
  const d = Object.assign(newDoc(), raw);
  if (!Array.isArray(d.scenes) || !d.scenes.length) d.scenes = [{ id: uid(), name: 'Scene 1', dur: 3000 }];
  for (const s of d.scenes) {
    if (!s.id) s.id = uid();
    s.dur = Math.max(200, Math.min(60000, +s.dur || 3000));
  }
  const sceneIds = new Set(d.scenes.map(s => s.id));
  d.layers = (d.layers || []).filter(l => TYPES[l.type]).map(l => {
    const fresh = newLayer(d, l.type);
    const m = Object.assign(fresh, l);
    m.enter = Object.assign({}, fresh.enter, l.enter);
    m.exit = Object.assign({}, fresh.exit, l.exit);
    m.motion = Array.isArray(l.motion) ? l.motion : [];
    m.fx = Array.isArray(l.fx) ? l.fx : [];
    if (m.scene && !sceneIds.has(m.scene)) m.scene = null;
    if (!m.id) m.id = uid();
    return m;
  });
  d.assets = d.assets || {};
  d.w = Math.max(16, Math.min(4096, Math.round(+d.w || 960)));
  d.h = Math.max(16, Math.min(4096, Math.round(+d.h || 540)));
  d.fps = [10, 20, 25, 50].includes(+d.fps) ? +d.fps : 25;
  return d;
}

export function resizeDoc(doc, w, h) {
  const kx = w / doc.w, ky = h / doc.h, k = Math.min(kx, ky);
  for (const l of doc.layers) {
    if (TYPES[l.type].full) continue;
    l.x = Math.round(l.x * kx);
    l.y = Math.round(l.y * ky);
    l.scale = +(l.scale * k).toFixed(3);
  }
  doc.w = w;
  doc.h = h;
}

export function sceneStart(doc, sceneId) {
  let t = 0;
  for (const s of doc.scenes) {
    if (s.id === sceneId) return t;
    t += s.dur;
  }
  return 0;
}

const assetImgs = new Map();
const assetFonts = new Map();
let assetListener = null;

export function onAssetLoaded(fn) {
  assetListener = fn;
}

export function notifyAsset(id) {
  if (assetListener) assetListener(id);
}

export function assetImage(doc, id) {
  if (!id || !doc.assets[id]) return null;
  const a = doc.assets[id];
  const cached = assetImgs.get(id);
  if (cached && cached.src === a.data) return cached.img;
  if (cached && cached.loading === a.data) return null;
  const img = new Image();
  const rec = { loading: a.data, img: null, src: null };
  assetImgs.set(id, rec);
  img.onload = () => {
    rec.img = img;
    rec.src = a.data;
    rec.loading = null;
    if (assetListener) assetListener(id);
  };
  img.src = a.data;
  return null;
}

export function assetFontFamily(doc, id) {
  const a = doc.assets[id];
  if (!a) return null;
  const fam = 'bsfont-' + id;
  if (!assetFonts.has(id)) {
    assetFonts.set(id, 'loading');
    const ff = new FontFace(fam, `url(${a.data})`);
    ff.load().then(f => {
      document.fonts.add(f);
      assetFonts.set(id, 'ok');
      if (assetListener) assetListener(id);
    }).catch(() => assetFonts.set(id, 'bad'));
  }
  return fam;
}

export function addAsset(doc, kind, name, data) {
  for (const [id, a] of Object.entries(doc.assets)) if (a.data === data) return id;
  const id = uid();
  doc.assets[id] = { kind, name, data };
  return id;
}

export function pruneAssets(doc) {
  const used = new Set();
  const s = JSON.stringify(doc.layers);
  for (const id of Object.keys(doc.assets)) if (s.includes('"' + id + '"')) used.add(id);
  for (const id of Object.keys(doc.assets)) if (!used.has(id)) delete doc.assets[id];
}

export class History {
  constructor(limit = 120) {
    this.limit = limit;
    this.stack = [];
    this.i = -1;
  }
  reset(doc) {
    this.stack = [JSON.stringify(doc)];
    this.i = 0;
  }
  push(doc) {
    const s = JSON.stringify(doc);
    if (this.stack[this.i] === s) return false;
    this.stack.length = this.i + 1;
    this.stack.push(s);
    if (this.stack.length > this.limit) this.stack.shift();
    this.i = this.stack.length - 1;
    return true;
  }
  canUndo() { return this.i > 0; }
  canRedo() { return this.i < this.stack.length - 1; }
  undo() {
    if (!this.canUndo()) return null;
    this.i--;
    return JSON.parse(this.stack[this.i]);
  }
  redo() {
    if (!this.canRedo()) return null;
    this.i++;
    return JSON.parse(this.stack[this.i]);
  }
}
