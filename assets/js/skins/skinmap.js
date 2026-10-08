export const SIZE = 64;
export const PARTS = ['head', 'torso', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
export const LAYERS = ['body', 'outer'];
export const FACES = ['top', 'bottom', 'right', 'front', 'left', 'back'];

const BOXES = {
  head: { w: 8, h: 8, d: 8 },
  torso: { w: 8, h: 12, d: 4 },
  rightArm: { w: 4, h: 12, d: 4 },
  leftArm: { w: 4, h: 12, d: 4 },
  rightLeg: { w: 4, h: 12, d: 4 },
  leftLeg: { w: 4, h: 12, d: 4 }
};

const ORIGINS = {
  head: { body: { u: 0, v: 0 }, outer: { u: 32, v: 0 } },
  torso: { body: { u: 16, v: 16 }, outer: { u: 16, v: 32 } },
  rightArm: { body: { u: 40, v: 16 }, outer: { u: 40, v: 32 } },
  leftArm: { body: { u: 32, v: 48 }, outer: { u: 48, v: 48 } },
  rightLeg: { body: { u: 0, v: 16 }, outer: { u: 0, v: 32 } },
  leftLeg: { body: { u: 16, v: 48 }, outer: { u: 0, v: 48 } }
};

const MIRROR_PART = {
  head: 'head',
  torso: 'torso',
  rightArm: 'leftArm',
  leftArm: 'rightArm',
  rightLeg: 'leftLeg',
  leftLeg: 'rightLeg'
};

const MIRROR_FACE = {
  top: 'top',
  bottom: 'bottom',
  front: 'front',
  back: 'back',
  right: 'left',
  left: 'right'
};

const cache = {};

function assertModel(model) {
  if (model !== 'classic' && model !== 'slim') throw new RangeError(`unknown model: ${model}`);
}

function assertPart(part) {
  if (!BOXES[part]) throw new RangeError(`unknown part: ${part}`);
}

export function partBox(part, model) {
  assertPart(part);
  assertModel(model);
  const box = BOXES[part];
  const isArm = part === 'rightArm' || part === 'leftArm';
  return { w: isArm && model === 'slim' ? 3 : box.w, h: box.h, d: box.d };
}

export function partOrigin(part, layer) {
  assertPart(part);
  if (!ORIGINS[part][layer]) throw new RangeError(`unknown layer: ${layer}`);
  return { ...ORIGINS[part][layer] };
}

export function faceRect(part, layer, face, model) {
  const { w, h, d } = partBox(part, model);
  const { u, v } = partOrigin(part, layer);
  switch (face) {
    case 'top': return { x: u + d, y: v, w, h: d };
    case 'bottom': return { x: u + d + w, y: v, w, h: d };
    case 'right': return { x: u, y: v + d, w: d, h };
    case 'front': return { x: u + d, y: v + d, w, h };
    case 'left': return { x: u + d + w, y: v + d, w: d, h };
    case 'back': return { x: u + d + w + d, y: v + d, w, h };
    default: throw new RangeError(`unknown face: ${face}`);
  }
}

function build(model) {
  const list = [];
  for (const part of PARTS) {
    for (const layer of LAYERS) {
      for (const face of FACES) {
        list.push({ part, layer, face, ...faceRect(part, layer, face, model) });
      }
    }
  }
  const grid = new Array(SIZE * SIZE).fill(null);
  for (const f of list) {
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) grid[y * SIZE + x] = f;
    }
  }
  return { list, grid };
}

function entry(model) {
  assertModel(model);
  if (!cache[model]) cache[model] = build(model);
  return cache[model];
}

export function faces(model) {
  return entry(model).list.map(f => ({ ...f }));
}

export function faceAt(x, y, model) {
  const { grid } = entry(model);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  const f = grid[y * SIZE + x];
  if (!f) return null;
  return { ...f, fx: x - f.x, fy: y - f.y };
}

export function mirrorOf(x, y, model) {
  const hit = faceAt(x, y, model);
  if (!hit) return null;
  const target = faceRect(MIRROR_PART[hit.part], hit.layer, MIRROR_FACE[hit.face], model);
  return { x: target.x + (hit.w - 1 - hit.fx), y: target.y + hit.fy };
}

export function partRegion(part, layer, model) {
  return FACES.map(face => ({ face, ...faceRect(part, layer, face, model) }));
}

export function mirrorPart(part) {
  assertPart(part);
  return MIRROR_PART[part];
}
