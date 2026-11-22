const BASE = '/assets/deepslate-resources/';

const TINTS = {
  grass: [145, 189, 89],
  foliage: [119, 171, 47],
  birch: [128, 167, 85],
  spruce: [97, 153, 97],
  water: [63, 118, 228],
  lily: [32, 128, 48],
};

let atlasImg = null;
let texMap = null;
let models = null;
let states = null;
let loading = null;
const texCache = new Map();
const shadeCache = new Map();
const modelCache = new Map();

export function loadCore() {
  if (!loading) {
    loading = (async () => {
      const [img, tex] = await Promise.all([
        loadImage(BASE + 'atlas.png'),
        fetch(BASE + 'textures.json').then(r => r.json()),
      ]);
      atlasImg = img;
      texMap = tex;
    })();
  }
  return loading;
}

let modelsLoading = null;
export function loadModels() {
  if (!modelsLoading) {
    modelsLoading = Promise.all([
      fetch(BASE + 'models.json').then(r => r.json()),
      fetch(BASE + 'blockstates.json').then(r => r.json()),
    ]).then(([m, s]) => { models = m; states = s; });
  }
  return modelsLoading;
}

export function ready() { return !!atlasImg; }
export function modelsReady() { return !!models; }

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function stripNs(name) {
  return name.startsWith('minecraft:') ? name.slice(10) : name;
}

export function hasTexture(name) {
  return !!(texMap && texMap[stripNs(name)]);
}

export function textureNames(prefix) {
  if (!texMap) return [];
  return Object.keys(texMap).filter(k => k.startsWith(prefix)).sort();
}

export function textureFrames(name) {
  const e = texMap && texMap[stripNs(name)];
  if (!e) return 1;
  return Math.max(1, Math.floor(e[3] / e[2]));
}

export function texture(name, frame = 0) {
  name = stripNs(name);
  const key = name + '#' + frame;
  let c = texCache.get(key);
  if (c) return c;
  const e = texMap && texMap[name];
  if (!e || !atlasImg) return null;
  const [u, v, w, h] = e;
  const frames = Math.max(1, Math.floor(h / w));
  const f = ((frame % frames) + frames) % frames;
  c = makeCanvas(w, w);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(atlasImg, u, v + f * w, w, w, 0, 0, w, w);
  texCache.set(key, c);
  return c;
}

export function tintFor(texName) {
  const n = stripNs(texName);
  if (n.includes('birch_leaves')) return TINTS.birch;
  if (n.includes('spruce_leaves')) return TINTS.spruce;
  if (n.includes('water')) return TINTS.water;
  if (n.includes('lily_pad')) return TINTS.lily;
  if (/leaves|vine/.test(n) && !/azalea|cherry|pale_oak|mangrove_leaves_x/.test(n)) return TINTS.foliage;
  if (/grass|fern|sugar_cane/.test(n)) return TINTS.grass;
  return null;
}

export function shaded(src, shade, tint, key) {
  const q = Math.round(shade * 32) / 32;
  const ck = key + '|' + q + '|' + (tint ? tint.join(',') : '');
  let c = shadeCache.get(ck);
  if (c) return c;
  c = makeCanvas(src.width, src.height);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  if (tint || q < 1) {
    const d = x.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    const tr = tint ? tint[0] / 255 : 1, tg = tint ? tint[1] / 255 : 1, tb = tint ? tint[2] / 255 : 1;
    for (let i = 0; i < p.length; i += 4) {
      p[i] = p[i] * tr * q;
      p[i + 1] = p[i + 1] * tg * q;
      p[i + 2] = p[i + 2] * tb * q;
    }
    x.putImageData(d, 0, 0);
  }
  if (shadeCache.size > 4000) shadeCache.clear();
  shadeCache.set(ck, c);
  return c;
}

function resolveModel(name, depth = 0) {
  name = stripNs(name);
  if (!name.includes('/')) name = 'block/' + name;
  const m = models && models[name];
  if (!m || depth > 12) return { elements: null, textures: {} };
  const parent = m.parent ? resolveModel(m.parent, depth + 1) : { elements: null, textures: {} };
  return {
    elements: m.elements || parent.elements,
    textures: Object.assign({}, parent.textures, m.textures || {}),
  };
}

function resolveRef(ref, textures) {
  let r = ref;
  for (let i = 0; i < 8 && r && r.startsWith('#'); i++) r = textures[r.slice(1)];
  return r ? stripNs(r) : null;
}

function rotateFacesY(elements, deg) {
  if (!deg) return elements;
  const turns = ((deg / 90) % 4 + 4) % 4;
  const map = { north: 'east', east: 'south', south: 'west', west: 'north' };
  return elements.map(el => {
    let from = el.from.slice(), to = el.to.slice();
    let faces = el.faces;
    for (let t = 0; t < turns; t++) {
      const nf = [16 - to[2], from[1], from[0]];
      const nt = [16 - from[2], to[1], to[0]];
      from = nf; to = nt;
      const f2 = {};
      for (const k in faces) f2[map[k] || k] = faces[k];
      faces = f2;
    }
    let rotation = el.rotation;
    if (rotation && turns) {
      let o = rotation.origin.slice(), axis = rotation.axis, angle = rotation.angle;
      for (let t = 0; t < turns; t++) {
        o = [16 - o[2], o[1], o[0]];
        if (axis === 'x') { axis = 'z'; angle = -angle; } else if (axis === 'z') { axis = 'x'; }
      }
      rotation = Object.assign({}, rotation, { origin: o, axis, angle });
    }
    return Object.assign({}, el, { from, to, faces, rotation });
  });
}

function pickVariant(def) {
  if (def.variants) {
    const keys = Object.keys(def.variants);
    const pref = keys.find(k => k === '') ||
      keys.find(k => /axis=y/.test(k)) ||
      keys.find(k => /facing=south/.test(k) && !/open=true|powered=true|lit=true/.test(k) && /half=bottom|half=lower|^facing=south$/.test(k)) ||
      keys.find(k => /facing=south/.test(k)) ||
      keys.find(k => /snowy=false/.test(k)) ||
      keys[0];
    let v = def.variants[pref];
    if (Array.isArray(v)) v = v[0];
    return [v];
  }
  if (def.multipart) {
    const out = [];
    for (const part of def.multipart) {
      if (!part.when) {
        const a = Array.isArray(part.apply) ? part.apply[0] : part.apply;
        out.push(a);
      }
    }
    if (!out.length) {
      const a = def.multipart[0].apply;
      out.push(Array.isArray(a) ? a[0] : a);
    }
    return out;
  }
  return [];
}

export function blockModel(id) {
  id = stripNs(id);
  if (modelCache.has(id)) return modelCache.get(id);
  let result = null;
  if (models) {
    const def = states && states[id];
    const parts = def ? pickVariant(def) : [{ model: 'block/' + id }];
    const elements = [];
    for (const p of parts) {
      if (!p || !p.model) continue;
      const r = resolveModel(p.model);
      if (!r.elements) continue;
      let els = r.elements.map(el => {
        const faces = {};
        for (const k in el.faces) {
          const f = el.faces[k];
          const tex = resolveRef(f.texture, r.textures);
          if (!tex) continue;
          faces[k] = { tex, uv: f.uv || null, rotation: f.rotation || 0, tint: f.tintindex !== undefined ? 1 : 0 };
        }
        return { from: el.from, to: el.to, rotation: el.rotation || null, shade: el.shade !== false, faces };
      });
      if (p.y) els = rotateFacesY(els, p.y);
      elements.push(...els);
    }
    if (elements.length) result = { elements, kind: 'block', center: [8, 8, 8], extent: 16 };
  }
  modelCache.set(id, result);
  return result;
}

export function blockIds() {
  if (!states) return [];
  return Object.keys(states).filter(id => {
    const m = blockModel(id);
    return m && m.elements.length;
  }).sort();
}

export function blockIcon(id) {
  const m = models && blockModel(id);
  if (!m) return null;
  for (const el of m.elements) {
    if (el.faces.south) return el.faces.south.tex;
    if (el.faces.north) return el.faces.north.tex;
  }
  const el = m.elements[0];
  const k = Object.keys(el.faces)[0];
  return k ? el.faces[k].tex : null;
}

export function prettyName(id) {
  const s = stripNs(id).replace(/^(block|item|entity)\//, '').split('/').pop();
  return s.split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

const BOX = (u, v, w, h, d) => ({
  up: [u + d, v, u + d + w, v + d],
  down: [u + d + w, v, u + d + w + w, v + d],
  west: [u, v + d, u + d, v + d + h],
  south: [u + d, v + d, u + d + w, v + d + h],
  east: [u + d + w, v + d, u + d + w + d, v + d + h],
  north: [u + d + w + d, v + d, u + d + w + d + w, v + d + h],
});

function skinBox(from, to, uvBox, inflate, skin, extra) {
  const f = from.map(v => v - inflate), t = to.map(v => v + inflate);
  const faces = {};
  for (const k in uvBox) faces[k] = { img: skin, uvp: uvBox[k], rotation: 0, tint: 0 };
  return Object.assign({ from: f, to: t, rotation: null, shade: true, faces }, extra || {});
}

export function playerModel(skin, opts) {
  const slim = !!opts.slim;
  const hat = opts.hat !== false;
  const legacy = skin.height === 32;
  const aw = slim ? 3 : 4;
  const parts = [];
  const pose = opts.pose || {};
  const add = (from, to, base, over, pivot, rotX, rotZ) => {
    const el = skinBox(from, to, BOX(...base), 0, skin, { pivot, rotX: rotX || 0, rotZ: rotZ || 0 });
    parts.push(el);
    if (hat && over && !legacy) parts.push(skinBox(from, to, BOX(...over), over[5] || 0.25, skin, { pivot, rotX: rotX || 0, rotZ: rotZ || 0, overlay: true }));
  };
  const view = opts.view || 'head';
  if (view === 'head') {
    parts.push(skinBox([-4, -4, -4], [4, 4, 4], BOX(0, 0, 8, 8, 8), 0, skin));
    if (hat) parts.push(Object.assign(skinBox([-4, -4, -4], [4, 4, 4], BOX(32, 0, 8, 8, 8), 0.5, skin), { overlay: true }));
    return { elements: parts, kind: 'skin', center: [0, 0, 0], extent: 9 };
  }
  const headRot = pose.head || 0;
  add([-4, 24, -4], [4, 32, 4], [0, 0, 8, 8, 8], [32, 0, 8, 8, 8, 0.5], [0, 24, 0], headRot, 0);
  add([-4, 12, -2], [4, 24, 2], [16, 16, 8, 12, 4], [16, 32, 8, 12, 4, 0.25], null, 0, 0);
  const rArm = [40, 16, aw, 12, 4];
  const lArm = legacy ? rArm : [32, 48, aw, 12, 4];
  add([-4 - aw, 12, -2], [-4, 24, 2], rArm, [40, 32, aw, 12, 4, 0.25], [-4 - aw / 2, 22, 0], pose.rArm || 0, pose.rArmZ || 0);
  add([4, 12, -2], [4 + aw, 24, 2], lArm, [48, 48, aw, 12, 4, 0.25], [4 + aw / 2, 22, 0], pose.lArm || 0, pose.lArmZ || 0);
  if (view === 'body') {
    const rLeg = [0, 16, 4, 12, 4];
    const lLeg = legacy ? rLeg : [16, 48, 4, 12, 4];
    add([-4, 0, -2], [0, 12, 2], rLeg, [0, 32, 4, 12, 4, 0.25], [-2, 12, 0], pose.rLeg || 0, 0);
    add([0, 0, -2], [4, 12, 2], lLeg, [0, 48, 4, 12, 4, 0.25], [2, 12, 0], pose.lLeg || 0, 0);
    return { elements: parts, kind: 'skin', center: [0, 16, 0], extent: 34 };
  }
  return { elements: parts, kind: 'skin', center: [0, 22, 0], extent: 22 };
}

export function skinLooksSlim(skin) {
  if (skin.height !== 64) return false;
  const c = makeCanvas(1, 1);
  const x = c.getContext('2d');
  x.drawImage(skin, 54, 20, 1, 1, 0, 0, 1, 1);
  return x.getImageData(0, 0, 1, 1).data[3] === 0;
}

export function defaultSkin() {
  const c = makeCanvas(64, 64);
  const x = c.getContext('2d');
  const fill = (col, r) => { x.fillStyle = col; x.fillRect(...r); };
  fill('#8a5a3c', [0, 0, 32, 16]);
  fill('#c08a6a', [0, 8, 32, 8]);
  fill('#7a4a2c', [8, 0, 8, 8]);
  fill('#5a3420', [8, 8, 8, 2]);
  fill('#ffffff', [9, 12, 2, 1]); fill('#ffffff', [13, 12, 2, 1]);
  fill('#4a3a8a', [10, 12, 1, 1]); fill('#4a3a8a', [14, 12, 1, 1]);
  fill('#7a4a3a', [11, 14, 2, 1]);
  fill('#2f8f6f', [16, 16, 24, 16]);
  fill('#2f8f6f', [32, 48, 16, 16]);
  fill('#c08a6a', [40, 16, 16, 16]);
  fill('#c08a6a', [32, 48, 16, 4]);
  fill('#2f8f6f', [40, 20, 16, 6]);
  fill('#2f8f6f', [32, 52, 16, 6]);
  fill('#3a3a7a', [0, 16, 16, 16]);
  fill('#3a3a7a', [16, 48, 16, 16]);
  fill('#4a4a4a', [0, 28, 16, 4]);
  fill('#4a4a4a', [16, 60, 16, 4]);
  return c;
}

export async function fetchSkin(username) {
  const name = encodeURIComponent(username.trim());
  const urls = [
    'https://mc-heads.net/skin/' + name,
    'https://minotar.net/skin/' + name,
  ];
  let lastErr = null;
  for (const u of urls) {
    try {
      const img = await loadImage(u);
      const c = makeCanvas(img.width, img.height);
      c.getContext('2d').drawImage(img, 0, 0);
      c.getContext('2d').getImageData(0, 0, 1, 1);
      return c;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Skin not found');
}
