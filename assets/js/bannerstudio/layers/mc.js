import { blockModel, texture, textureFrames, hasTexture, playerModel, skinLooksSlim, defaultSkin, fetchSkin, makeCanvas, prettyName } from '../assets.js';
import { drawModel } from '../render3d.js';
import { assetImage, notifyAsset } from '../model.js';

const FRAME_MS = 100;

function frameFn(E, speed) {
  return (tex) => {
    const F = textureFrames(tex);
    if (F <= 1) return 0;
    const sp = speed || 1;
    const cycles = Math.max(1, Math.round(E.loop / (F * FRAME_MS / sp)));
    return Math.floor(E.phase * cycles * F) % F;
  };
}

const block = {
  type: 'block',
  label: '3D block',
  defaults(doc) {
    return {
      name: 'Grass Block',
      block: 'grass_block',
      size: Math.round(Math.min(doc.h * 0.55, doc.w * 0.3)),
      yaw: 45,
      pitch: 30,
      light: 1,
      animSpeed: 1,
    };
  },
  schema: [
    { k: 'block', t: 'block', label: 'Block' },
    { k: 'size', t: 'range', label: 'Size', min: 8, max: 800, step: 1 },
    { k: 'yaw', t: 'range', label: 'Turn', min: -180, max: 180, step: 1 },
    { k: 'pitch', t: 'range', label: 'Tilt', min: -90, max: 90, step: 1 },
    { k: 'light', t: 'range', label: 'Side shading', min: 0, max: 1, step: 0.05 },
    { k: 'animSpeed', t: 'range', label: 'Texture animation speed', min: 0.25, max: 4, step: 0.25 },
    { t: 'note', label: 'Add the Turn motion to spin it. Animated blocks like magma, sea lanterns and portals loop by themselves.' },
  ],
  bounds(layer) {
    return { w: layer.size * 1.05, h: layer.size * 1.05 };
  },
  draw(ctx, layer, st, E) {
    const m = blockModel(layer.block);
    if (!m) {
      missing(ctx, layer.size);
      return;
    }
    drawModel(ctx, m, {
      size: layer.size,
      yaw: layer.yaw + (st.yaw || 0),
      pitch: Math.max(-90, Math.min(90, layer.pitch + (st.pitch || 0))),
      light: layer.light,
      frame: frameFn(E, layer.animSpeed),
    });
  },
};

function missing(ctx, size) {
  const s = size * 0.6;
  ctx.fillStyle = '#f800f8';
  ctx.fillRect(-s / 2, -s / 2, s / 2, s / 2);
  ctx.fillRect(0, 0, s / 2, s / 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, -s / 2, s / 2, s / 2);
  ctx.fillRect(-s / 2, 0, s / 2, s / 2);
}

const itemModels = new Map();

function spriteModel(img, key) {
  let m = itemModels.get(key);
  if (m) return m;
  const W = img.width, H = img.height;
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  let data;
  try {
    data = x.getImageData(0, 0, W, H).data;
  } catch (e) {
    return null;
  }
  const solid = (px, py) => px >= 0 && py >= 0 && px < W && py < H && data[(py * W + px) * 4 + 3] > 24;
  const k = 16 / Math.max(W, H);
  const ox = (16 - W * k) / 2, oy = (16 - H * k) / 2;
  const z0 = 8 - 0.5, z1 = 8 + 0.5;
  const X = px => ox + px * k;
  const Y = py => 16 - (oy + py * k);
  const els = [];
  els.push({
    from: [ox, 16 - oy - H * k, z0], to: [ox + W * k, 16 - oy, z1], rotation: null, shade: true,
    faces: { south: { img: c, uvp: [0, 0, W, H], rotation: 0, tint: 0 }, north: { img: c, uvp: [W, 0, 0, H], rotation: 0, tint: 0 } },
  });
  for (let px = 0; px < W; px++) {
    for (const [face, dx] of [['west', -1], ['east', 1]]) {
      let py = 0;
      while (py < H) {
        if (solid(px, py) && !solid(px + dx, py)) {
          let e = py;
          while (e + 1 < H && solid(px, e + 1) && !solid(px + dx, e + 1)) e++;
          const xx = face === 'west' ? X(px) : X(px + 1);
          els.push({
            from: [xx, Y(e + 1), z0], to: [xx, Y(py), z1], rotation: null, shade: true,
            faces: { [face]: { img: c, uvp: [px, py, px + 1, e + 1], rotation: 0, tint: 0 } }, edge: true,
          });
          py = e + 1;
        } else py++;
      }
    }
  }
  for (let py = 0; py < H; py++) {
    for (const [face, dy] of [['up', -1], ['down', 1]]) {
      let px = 0;
      while (px < W) {
        if (solid(px, py) && !solid(px, py + dy)) {
          let e = px;
          while (e + 1 < W && solid(e + 1, py) && !solid(e + 1, py + dy)) e++;
          const yy = face === 'up' ? Y(py) : Y(py + 1);
          els.push({
            from: [X(px), yy, z0], to: [X(e + 1), yy, z1], rotation: null, shade: true,
            faces: { [face]: { img: c, uvp: [px, py, e + 1, py + 1], rotation: 0, tint: 0 } }, edge: true,
          });
          px = e + 1;
        } else px++;
      }
    }
  }
  m = { elements: els, kind: 'item', center: [8, 8, 8], extent: 16 };
  if (itemModels.size > 300) itemModels.clear();
  itemModels.set(key, m);
  return m;
}

function pixelate(img, res, key) {
  const ck = 'px|' + key + '|' + res;
  let c = itemModels.get(ck);
  if (c) return c;
  const k = res / Math.max(img.width, img.height);
  c = makeCanvas(Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = k < 1;
  x.drawImage(img, 0, 0, c.width, c.height);
  itemModels.set(ck, c);
  return c;
}

function itemSource(layer, E) {
  if (layer.source === 'upload') {
    const img = assetImage(E.doc, layer.asset);
    if (!img) return null;
    const res = layer.res || 32;
    return { img: pixelate(img, res, layer.asset), key: 'up|' + layer.asset + '|' + res };
  }
  const name = layer.tex;
  if (!name || !hasTexture(name)) return null;
  const F = textureFrames(name);
  let f = 0;
  if (F > 1) {
    const cycles = Math.max(1, Math.round(E.loop / (F * FRAME_MS / (layer.animSpeed || 1))));
    f = Math.floor(E.phase * cycles * F) % F;
  }
  const img = texture(name, f);
  return img ? { img, key: name + '#' + f } : null;
}

const item = {
  type: 'item',
  label: 'Item',
  defaults(doc) {
    return {
      name: 'Diamond Sword',
      source: 'game',
      tex: 'item/diamond_sword',
      asset: null,
      res: 32,
      mode: '3d',
      size: Math.round(Math.min(doc.h * 0.5, doc.w * 0.3)),
      yaw: 0,
      pitch: 0,
      tilt: 0,
      light: 0.6,
      animSpeed: 1,
    };
  },
  schema: [
    { k: 'source', t: 'select', label: 'Source', opts: [['game', 'Minecraft item'], ['upload', 'My own image']] },
    { k: 'tex', t: 'texture', label: 'Item', prefix: 'item/', show: l => l.source !== 'upload' },
    { k: 'asset', t: 'image', label: 'Image', show: l => l.source === 'upload' },
    { k: 'res', t: 'select', label: 'Pixel size', opts: [[16, '16 px (vanilla)'], [32, '32 px'], [64, '64 px (detailed)']], show: l => l.source === 'upload' },
    { k: 'mode', t: 'select', label: 'Style', opts: [['3d', '3D (thick like in game)'], ['flat', 'Flat sprite']] },
    { k: 'size', t: 'range', label: 'Size', min: 8, max: 800, step: 1 },
    { k: 'tilt', t: 'range', label: 'Rotate in place', min: -180, max: 180, step: 1 },
    { k: 'yaw', t: 'range', label: 'Turn', min: -180, max: 180, step: 1 },
    { k: 'pitch', t: 'range', label: 'Tilt back', min: -80, max: 80, step: 1, show: l => l.mode === '3d' },
    { k: 'light', t: 'range', label: 'Edge shading', min: 0, max: 1, step: 0.05, show: l => l.mode === '3d' },
    { t: 'note', label: 'Add the Turn motion for the dropped-item spin.' },
  ],
  bounds(layer) {
    return { w: layer.size, h: layer.size };
  },
  draw(ctx, layer, st, E) {
    const src = itemSource(layer, E);
    if (!src) {
      if (layer.source !== 'upload') missing(ctx, layer.size);
      return;
    }
    const yaw = layer.yaw + (st.yaw || 0);
    const pitch = layer.pitch + (st.pitch || 0);
    ctx.save();
    if (layer.tilt) ctx.rotate(layer.tilt * Math.PI / 180);
    if (layer.mode === 'flat') {
      const c = Math.cos(yaw * Math.PI / 180);
      const k = layer.size / Math.max(src.img.width, src.img.height);
      ctx.imageSmoothingEnabled = false;
      ctx.scale(c, Math.cos(pitch * Math.PI / 180));
      ctx.drawImage(src.img, -src.img.width * k / 2, -src.img.height * k / 2, src.img.width * k, src.img.height * k);
    } else {
      const m = spriteModel(src.img, src.key);
      if (m) drawModel(ctx, m, { size: layer.size * 1.5, yaw, pitch, light: layer.light, skinKey: src.key });
    }
    ctx.restore();
  },
};

const skins = new Map();

function skinFor(layer, E) {
  if (layer.skinSource === 'upload') {
    const img = assetImage(E.doc, layer.skinAsset);
    if (!img) return null;
    const key = 'upl|' + layer.skinAsset;
    let c = skins.get(key);
    if (!c) {
      c = makeCanvas(64, img.height >= 64 ? 64 : 32);
      c.getContext('2d').drawImage(img, 0, 0, 64, c.height);
      skins.set(key, c);
    }
    return { img: c, key };
  }
  if (layer.skinSource === 'username' && layer.username && layer.username.trim()) {
    const name = layer.username.trim().toLowerCase();
    const key = 'usr|' + name;
    const rec = skins.get(key);
    if (rec instanceof HTMLCanvasElement) return { img: rec, key };
    if (!rec) {
      skins.set(key, 'loading');
      fetchSkin(name).then(c => { skins.set(key, c); notifyAsset(key); }).catch(() => { skins.set(key, 'error'); notifyAsset(key); });
    }
    if (rec === 'error') return { img: defaultSkinCached(), key: 'default', error: true };
    return null;
  }
  return { img: defaultSkinCached(), key: 'default' };
}

let defSkin = null;
function defaultSkinCached() {
  if (!defSkin) defSkin = defaultSkin();
  return defSkin;
}

export function skinStatus(layer) {
  if (layer.skinSource !== 'username' || !layer.username) return '';
  const rec = skins.get('usr|' + layer.username.trim().toLowerCase());
  if (rec === 'loading') return 'Loading skin...';
  if (rec === 'error') return 'Could not load that skin. Check the name, or upload the skin file.';
  if (rec) return 'Skin loaded.';
  return '';
}

const POSES = {
  stand: {},
  wave: { rArm: 180, rArmZ: -20 },
  point: { rArm: -90 },
  cheer: { rArm: 170, rArmZ: -25, lArm: 170, lArmZ: 25 },
  walk: { rArm: 30, lArm: -30, rLeg: -30, lLeg: 30 },
  hold: { rArm: -45 },
};

const head = {
  type: 'head',
  label: 'Player',
  defaults(doc) {
    return {
      name: 'Player',
      skinSource: 'username',
      username: 'Notch',
      skinAsset: null,
      view: 'bust',
      slim: 'auto',
      hat: true,
      pose: 'stand',
      size: Math.round(doc.h * 0.7),
      yaw: 25,
      pitch: 10,
      light: 0.6,
    };
  },
  schema: [
    { k: 'skinSource', t: 'select', label: 'Skin', opts: [['username', 'Java username'], ['upload', 'Upload skin file'], ['default', 'Default skin']] },
    { k: 'username', t: 'text', label: 'Username', show: l => l.skinSource === 'username', status: skinStatus },
    { k: 'skinAsset', t: 'image', label: 'Skin file (64x64 png)', show: l => l.skinSource === 'upload' },
    { k: 'view', t: 'select', label: 'Show', opts: [['head', 'Head'], ['bust', 'Head and shoulders'], ['body', 'Full body']] },
    { k: 'pose', t: 'select', label: 'Pose', opts: [['stand', 'Standing'], ['wave', 'Waving'], ['point', 'Pointing'], ['cheer', 'Cheering'], ['walk', 'Mid-step'], ['hold', 'Holding out']], show: l => l.view !== 'head' },
    { k: 'slim', t: 'select', label: 'Arms', opts: [['auto', 'Detect'], ['classic', 'Classic (4px)'], ['slim', 'Slim (3px)']], show: l => l.view !== 'head' },
    { k: 'hat', t: 'check', label: 'Show hat and jacket layer' },
    { k: 'size', t: 'range', label: 'Size', min: 8, max: 1000, step: 1 },
    { k: 'yaw', t: 'range', label: 'Turn', min: -180, max: 180, step: 1 },
    { k: 'pitch', t: 'range', label: 'Tilt', min: -60, max: 60, step: 1 },
    { k: 'light', t: 'range', label: 'Shading', min: 0, max: 1, step: 0.05 },
    { t: 'note', label: 'Add the Walk or Wave motion to animate the arms and legs.' },
  ],
  bounds(layer) {
    const r = layer.view === 'body' ? [0.62, 1.05] : layer.view === 'bust' ? [0.95, 1.0] : [1.05, 1.05];
    return { w: layer.size * r[0], h: layer.size * r[1] };
  },
  draw(ctx, layer, st, E) {
    const s = skinFor(layer, E);
    if (!s) {
      ctx.save();
      ctx.globalAlpha *= 0.35;
      ctx.fillStyle = '#888';
      const w = layer.size * 0.4;
      ctx.fillRect(-w / 2, -w / 2, w, w);
      ctx.restore();
      return;
    }
    const slim = layer.slim === 'slim' || (layer.slim === 'auto' && skinLooksSlimCached(s));
    const base = POSES[layer.pose] || {};
    const p = Object.assign({}, base);
    if (st.pose) for (const k in st.pose) p[k] = (p[k] || 0) + st.pose[k];
    const model = playerModel(s.img, { slim, hat: layer.hat, view: layer.view, pose: p });
    drawModel(ctx, model, {
      size: layer.size,
      yaw: layer.yaw + (st.yaw || 0),
      pitch: layer.pitch + (st.pitch || 0),
      light: layer.light,
      skinKey: s.key,
    });
  },
};

const slimCache = new Map();
function skinLooksSlimCached(s) {
  if (!slimCache.has(s.key)) slimCache.set(s.key, skinLooksSlim(s.img));
  return slimCache.get(s.key);
}

export function itemLabel(tex) {
  return prettyName(tex || '');
}

export { block, item, head };
