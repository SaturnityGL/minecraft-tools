const TAU = Math.PI * 2;

export const EASES = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: t => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outElastic: t => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
  outBounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export const EASE_OPTIONS = [
  ['outCubic', 'Smooth'], ['outBack', 'Overshoot'], ['outElastic', 'Elastic'], ['outBounce', 'Bounce'],
  ['inOutCubic', 'Ease in-out'], ['outQuad', 'Soft'], ['linear', 'Linear'], ['inCubic', 'Accelerate'], ['inBack', 'Anticipate'],
];

export const TRANSITIONS = [
  ['none', 'None'], ['fade', 'Fade'],
  ['slideLeft', 'Slide from right'], ['slideRight', 'Slide from left'], ['slideUp', 'Slide from below'], ['slideDown', 'Slide from above'],
  ['zoom', 'Zoom'], ['pop', 'Pop'], ['shrink', 'Shrink from big'], ['drop', 'Drop in'], ['flip', 'Flip'], ['spin', 'Spin'],
  ['wipeRight', 'Wipe right'], ['wipeLeft', 'Wipe left'], ['wipeDown', 'Wipe down'], ['wipeUp', 'Wipe up'], ['iris', 'Circle reveal'],
  ['blur', 'Blur'], ['glitch', 'Glitch'], ['typewriter', 'Typewriter (text)'], ['scramble', 'Scramble (text)'],
  ['charsUp', 'Letters rise (text)'], ['charsPop', 'Letters pop (text)'], ['countUp', 'Count up (numbers)'],
];

export const MOTIONS = [
  ['float', 'Float', { amp: 3, cycles: 2 }],
  ['sway', 'Sway', { amp: 6, cycles: 2 }],
  ['pulse', 'Pulse', { amp: 0.06, cycles: 2 }],
  ['spin', 'Spin', { cycles: 1 }],
  ['turn', '3D turn', { cycles: 1 }],
  ['rock', '3D rock', { amp: 25, cycles: 1 }],
  ['drift', 'Drift sideways', { amp: 6, cycles: 1 }],
  ['orbit', 'Orbit', { amp: 4, cycles: 1 }],
  ['shake', 'Shake', { amp: 1.5, cycles: 12 }],
  ['blink', 'Blink', { amp: 0.6, cycles: 2 }],
  ['hue', 'Hue cycle', { cycles: 1 }],
  ['heartbeat', 'Heartbeat', { amp: 0.1, cycles: 2 }],
  ['wave', 'Wavy letters (text)', { amp: 2, cycles: 2 }],
  ['jump', 'Jumping letters (text)', { amp: 3, cycles: 1 }],
  ['rainbow', 'Rainbow letters (text)', { cycles: 1 }],
  ['walk', 'Walk (player)', { amp: 30, cycles: 2 }],
  ['wave_arm', 'Wave hand (player)', { amp: 1, cycles: 2 }],
];

export function ease(name, t) {
  const f = EASES[name] || EASES.outCubic;
  return f(Math.max(0, Math.min(1, t)));
}

export function blankState() {
  return { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, alpha: 1, clip: null, blur: 0, chars: 1, scramble: 0, count: 1, charRise: null, glitch: 0, yaw: 0, pitch: 0, hue: 0, wave: null, jump: null, rainbow: null, pose: null };
}

function applyTransition(st, type, p, raw, layer, doc, entering) {
  const inv = 1 - p;
  const W = doc.w, H = doc.h;
  switch (type) {
    case 'fade': st.alpha *= p; break;
    case 'slideLeft': st.dx += inv * (entering ? 1 : -1) * W * 0.6; st.alpha *= Math.min(1, p * 3); break;
    case 'slideRight': st.dx -= inv * (entering ? 1 : -1) * W * 0.6; st.alpha *= Math.min(1, p * 3); break;
    case 'slideUp': st.dy += inv * (entering ? 1 : -1) * H * 0.9; st.alpha *= Math.min(1, p * 3); break;
    case 'slideDown': st.dy -= inv * (entering ? 1 : -1) * H * 0.9; st.alpha *= Math.min(1, p * 3); break;
    case 'zoom': st.sx *= p; st.sy *= p; st.alpha *= Math.min(1, p * 2); break;
    case 'pop': st.sx *= p; st.sy *= p; break;
    case 'shrink': st.sx *= 1 + inv * 2.5; st.sy *= 1 + inv * 2.5; st.alpha *= p; break;
    case 'drop': st.dy -= inv * H; break;
    case 'flip': st.sx *= Math.cos(inv * Math.PI / 2); break;
    case 'spin': st.rot += inv * 360 * (entering ? -1 : 1); st.sx *= p; st.sy *= p; break;
    case 'wipeRight': st.clip = { mode: 'right', p }; break;
    case 'wipeLeft': st.clip = { mode: 'left', p }; break;
    case 'wipeDown': st.clip = { mode: 'down', p }; break;
    case 'wipeUp': st.clip = { mode: 'up', p }; break;
    case 'iris': st.clip = { mode: 'iris', p }; break;
    case 'blur': st.blur += inv * 12; st.alpha *= p; break;
    case 'glitch': st.glitch = Math.max(st.glitch, inv); st.alpha *= raw < 0.15 ? (Math.floor(raw * 40) % 2) : 1; break;
    case 'typewriter': st.chars = Math.min(st.chars, raw); break;
    case 'scramble': st.scramble = Math.max(st.scramble, 1 - raw); break;
    case 'charsUp': st.charRise = { p: raw, mode: 'up', ease: layer }; break;
    case 'charsPop': st.charRise = { p: raw, mode: 'pop', ease: layer }; break;
    case 'countUp': st.count = Math.min(st.count, p); break;
  }
}

export function layerWindow(doc, layer) {
  const loop = loopMs(doc);
  if (!layer.scene) return { start: 0, end: loop, global: true };
  let t = 0;
  for (const s of doc.scenes) {
    if (s.id === layer.scene) return { start: t, end: t + s.dur, global: false };
    t += s.dur;
  }
  return null;
}

export function loopMs(doc) {
  return Math.max(100, doc.scenes.reduce((a, s) => a + s.dur, 0));
}

export function frameCount(doc) {
  return Math.max(1, Math.round(loopMs(doc) / 1000 * doc.fps));
}

export function sceneAt(doc, t) {
  let acc = 0;
  for (let i = 0; i < doc.scenes.length; i++) {
    const s = doc.scenes[i];
    if (t < acc + s.dur) return { index: i, scene: s, start: acc, local: t - acc };
    acc += s.dur;
  }
  const last = doc.scenes.length - 1;
  return { index: last, scene: doc.scenes[last], start: acc - doc.scenes[last].dur, local: doc.scenes[last].dur };
}

export function computeState(doc, layer, t, opts) {
  const win = layerWindow(doc, layer);
  if (!win) return null;
  const loop = loopMs(doc);
  const st = blankState();
  const ignoreTransitions = opts && opts.static;
  if (!win.global) {
    if (t < win.start || t >= win.end) return null;
  }
  const local = t - win.start;
  const span = win.end - win.start;
  const en = layer.enter || {};
  const ex = layer.exit || {};
  if (!ignoreTransitions && !(win.global && !(opts && opts.globalTransitions))) {
    if (en.type && en.type !== 'none') {
      const d = Math.max(1, en.dur || 400);
      const raw = (local - (en.delay || 0)) / d;
      if (raw < 0) {
        if (!['typewriter', 'scramble', 'countUp', 'charsUp', 'charsPop'].includes(en.type)) return null;
      }
      const r = Math.max(0, Math.min(1, raw));
      if (r < 1 || ['typewriter', 'scramble', 'countUp', 'charsUp', 'charsPop'].includes(en.type)) {
        applyTransition(st, en.type, ease(en.ease || 'outCubic', r), r, en.ease || 'outCubic', doc, true);
      }
    }
    if (ex.type && ex.type !== 'none') {
      const d = Math.max(1, ex.dur || 300);
      const startOut = span - d;
      if (local > startOut) {
        const r = Math.max(0, Math.min(1, (local - startOut) / d));
        const eased = ease(ex.ease || 'inCubic', r);
        const p = 1 - eased;
        if (['typewriter'].includes(ex.type)) st.chars = Math.min(st.chars, 1 - r);
        else if (ex.type === 'scramble') st.scramble = Math.max(st.scramble, r);
        else if (['charsUp', 'charsPop', 'countUp'].includes(ex.type)) applyTransition(st, 'fade', p, 1 - r, null, doc, false);
        else applyTransition(st, ex.type, p, 1 - r, null, doc, false);
      }
    }
  }
  const phase = t / loop;
  for (const m of layer.motion || []) {
    if (m.off) continue;
    const cyc = Math.max(1, Math.round(m.cycles || 1));
    const off = (m.offset || 0);
    const a = TAU * (phase * cyc + off);
    const amp = m.amp ?? 1;
    switch (m.type) {
      case 'float': st.dy += Math.sin(a) * amp; break;
      case 'sway': st.rot += Math.sin(a) * amp; break;
      case 'pulse': { const k = 1 + Math.sin(a) * amp; st.sx *= k; st.sy *= k; break; }
      case 'spin': st.rot += (phase * cyc + off) * 360 * (m.reverse ? -1 : 1); break;
      case 'turn': st.yaw += (phase * cyc + off) * 360 * (m.reverse ? -1 : 1); break;
      case 'rock': st.yaw += Math.sin(a) * amp; break;
      case 'drift': st.dx += Math.sin(a) * amp; break;
      case 'orbit': st.dx += Math.cos(a) * amp; st.dy += Math.sin(a) * amp; break;
      case 'shake': {
        const k = Math.floor(phase * cyc * 4);
        st.dx += (hash(k * 2 + 1) - 0.5) * 2 * amp;
        st.dy += (hash(k * 2 + 7) - 0.5) * 2 * amp;
        break;
      }
      case 'blink': st.alpha *= 1 - amp * (0.5 - 0.5 * Math.cos(a)); break;
      case 'hue': st.hue += (phase * cyc) * 360; break;
      case 'heartbeat': {
        const f = (phase * cyc + off) % 1;
        const b = Math.exp(-Math.pow((f - 0.1) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((f - 0.28) / 0.05, 2));
        st.sx *= 1 + b * amp; st.sy *= 1 + b * amp;
        break;
      }
      case 'wave': st.wave = { phase: phase * cyc + off, amp }; break;
      case 'jump': st.jump = { phase: phase * cyc + off, amp }; break;
      case 'rainbow': st.rainbow = { phase: phase * cyc + off }; break;
      case 'walk': {
        const sw = Math.sin(a) * amp;
        st.pose = Object.assign(st.pose || {}, { rArm: sw, lArm: -sw, rLeg: -sw, lLeg: sw });
        break;
      }
      case 'wave_arm': {
        const sw = Math.sin(a) * 20 * amp;
        st.pose = Object.assign(st.pose || {}, { rArm: 180, rArmZ: -15 + sw });
        break;
      }
    }
  }
  return st;
}

export function hash(n) {
  let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
