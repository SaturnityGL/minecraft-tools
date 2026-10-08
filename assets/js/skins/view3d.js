import * as THREE from '../lib/three.module.min.js';
import { SIZE, PARTS, LAYERS, FACES, partBox, faceRect, faceAt } from './skinmap.js';

const CENTERS = {
  head: [0, 28, 0],
  torso: [0, 18, 0],
  rightArm: [-6, 18, 0],
  leftArm: [6, 18, 0],
  rightLeg: [-2, 6, 0],
  leftLeg: [2, 6, 0]
};

const SLIM_ARM_X = { rightArm: -5.5, leftArm: 5.5 };

const PIVOTS = {
  head: [0, 24, 0],
  torso: [0, 12, 0],
  rightArm: [-6, 22, 0],
  leftArm: [6, 22, 0],
  rightLeg: [-2, 12, 0],
  leftLeg: [2, 12, 0]
};
const UPPER_PIVOT = [0, 12, 0];
const UPPER_PARTS = ['head', 'torso', 'rightArm', 'leftArm'];

export const POSES = {
  stand: {},
  walk: { rightArm: [0.5, 0, 0], leftArm: [-0.5, 0, 0], rightLeg: [-0.5, 0, 0], leftLeg: [0.5, 0, 0] },
  run: { rightArm: [1, 0, 0], leftArm: [-1, 0, 0], rightLeg: [-0.9, 0, 0], leftLeg: [0.9, 0, 0] },
  sneak: {
    upper: [0.45, 0, 0],
    head: [-0.45, 0, 0],
    rightArm: [-0.25, 0, 0],
    leftArm: [-0.25, 0, 0],
    rightLeg: [-0.12, 0, 0],
    leftLeg: [-0.12, 0, 0]
  },
  armsOut: { rightArm: [0, 0, -1.4], leftArm: [0, 0, 1.4] }
};

const FACE_AXES = {
  front: { n: [0, 0, 1], o: [-1, 1, 1], ex: [1, 0, 0], ey: [0, -1, 0] },
  back: { n: [0, 0, -1], o: [1, 1, -1], ex: [-1, 0, 0], ey: [0, -1, 0] },
  right: { n: [-1, 0, 0], o: [-1, 1, -1], ex: [0, 0, 1], ey: [0, -1, 0] },
  left: { n: [1, 0, 0], o: [1, 1, 1], ex: [0, 0, -1], ey: [0, -1, 0] },
  top: { n: [0, 1, 0], o: [-1, 1, -1], ex: [1, 0, 0], ey: [0, 0, 1] },
  bottom: { n: [0, -1, 0], o: [-1, -1, -1], ex: [1, 0, 0], ey: [0, 0, 1] }
};

const TARGET = new THREE.Vector3(0, 16, 0);
const DEFAULT_THETA = -0.55;
const DEFAULT_PHI = 1.25;
const DEFAULT_DIST = 78;
const MIN_DIST = 22;
const MAX_DIST = 170;
const MIN_PHI = 0.15;
const MAX_PHI = Math.PI - 0.15;
const BACKDROPS = { dark: 0x17130d, light: 0xe9e3d5 };
const GRID_CELL = 32;
const GRID_LINE = 2;

function partCenter(part, model) {
  const c = CENTERS[part].slice();
  if (model === 'slim' && SLIM_ARM_X[part] !== undefined) c[0] = SLIM_ARM_X[part];
  return c;
}

function partPivot(part, model) {
  const p = PIVOTS[part].slice();
  if (model === 'slim' && SLIM_ARM_X[part] !== undefined) p[0] = SLIM_ARM_X[part];
  return p;
}

function quadGeometry(part, layer, face, model, inflate, lift, uvs) {
  const { w, h, d } = partBox(part, model);
  const rect = faceRect(part, layer, face, model);
  const ax = FACE_AXES[face];
  const c = partCenter(part, model);
  const half = [w / 2 + inflate, h / 2 + inflate, d / 2 + inflate];
  const o = [0, 1, 2].map(i => c[i] + ax.o[i] * half[i] + ax.n[i] * lift);
  const W = rect.w + inflate * 2;
  const H = rect.h + inflate * 2;
  const p0 = o;
  const p1 = [0, 1, 2].map(i => p0[i] + ax.ex[i] * W);
  const p2 = [0, 1, 2].map(i => p1[i] + ax.ey[i] * H);
  const p3 = [0, 1, 2].map(i => p0[i] + ax.ey[i] * H);
  const ex = ax.ex;
  const ey = ax.ey;
  const cross = [
    ex[1] * ey[2] - ex[2] * ey[1],
    ex[2] * ey[0] - ex[0] * ey[2],
    ex[0] * ey[1] - ex[1] * ey[0]
  ];
  const facing = cross[0] * ax.n[0] + cross[1] * ax.n[1] + cross[2] * ax.n[2] > 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p3], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([...ax.n, ...ax.n, ...ax.n, ...ax.n], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs(rect), 2));
  geo.setIndex(facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  const pivot = partPivot(part, model);
  geo.translate(-pivot[0], -pivot[1], -pivot[2]);
  return { geo, rect };
}

function textureUvs(rect) {
  const u0 = rect.x / SIZE;
  const v0 = rect.y / SIZE;
  const u1 = (rect.x + rect.w) / SIZE;
  const v1 = (rect.y + rect.h) / SIZE;
  return [u0, v0, u1, v0, u1, v1, u0, v1];
}

function gridUvs(rect) {
  return [0, 0, rect.w, 0, rect.w, rect.h, 0, rect.h];
}

function makeGridTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = GRID_CELL;
  c.height = GRID_CELL;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(0, 0, GRID_LINE, GRID_CELL);
  ctx.fillRect(GRID_CELL - GRID_LINE, 0, GRID_LINE, GRID_CELL);
  ctx.fillRect(0, 0, GRID_CELL, GRID_LINE);
  ctx.fillRect(0, GRID_CELL - GRID_LINE, GRID_CELL, GRID_LINE);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

export function createView3D(canvas, { doc, state }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
  const root = new THREE.Group();
  scene.add(root);

  function wrap(pixels) {
    return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  }

  let lastPixels = doc.pixels;
  let lastVersion = -1;
  let preview = null;
  let highlight = null;
  let poseName = null;
  const texture = new THREE.DataTexture(wrap(doc.pixels), SIZE, SIZE, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const bodyMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
  const outerMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    alphaTest: 0.01,
    transparent: false
  });

  const gridTexture = makeGridTexture(renderer);
  const gridMaterials = {
    body: new THREE.MeshBasicMaterial({
      map: gridTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.FrontSide
    }),
    outer: new THREE.MeshBasicMaterial({
      map: gridTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide
    })
  };

  const highlightData = new Uint8Array(SIZE * SIZE * 4);
  const highlightTexture = new THREE.DataTexture(highlightData, SIZE, SIZE, THREE.RGBAFormat);
  highlightTexture.magFilter = THREE.NearestFilter;
  highlightTexture.minFilter = THREE.NearestFilter;
  highlightTexture.generateMipmaps = false;
  highlightTexture.flipY = false;
  highlightTexture.colorSpace = THREE.SRGBColorSpace;
  const highlightMaterial = new THREE.MeshBasicMaterial({
    map: highlightTexture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    side: THREE.DoubleSide
  });

  let entries = [];
  let pickable = [];
  let groups = {};

  function disposeMeshes() {
    for (const e of entries) {
      e.mesh.geometry.dispose();
      e.grid.geometry.dispose();
      e.mark.geometry.dispose();
    }
    root.clear();
    entries = [];
    pickable = [];
    groups = {};
  }

  function applyPose() {
    const pose = POSES[state.pose] || POSES.stand;
    for (const key of Object.keys(groups)) {
      const r = pose[key] || [0, 0, 0];
      groups[key].rotation.set(r[0], r[1], r[2]);
    }
    poseName = state.pose;
  }

  function rebuild() {
    disposeMeshes();
    const model = doc.model;
    const upper = new THREE.Group();
    upper.position.set(UPPER_PIVOT[0], UPPER_PIVOT[1], UPPER_PIVOT[2]);
    root.add(upper);
    groups.upper = upper;
    for (const part of PARTS) {
      const pivot = partPivot(part, model);
      const group = new THREE.Group();
      if (UPPER_PARTS.includes(part)) {
        group.position.set(pivot[0] - UPPER_PIVOT[0], pivot[1] - UPPER_PIVOT[1], pivot[2] - UPPER_PIVOT[2]);
        upper.add(group);
      } else {
        group.position.set(pivot[0], pivot[1], pivot[2]);
        root.add(group);
      }
      groups[part] = group;
      for (const layer of LAYERS) {
        const inflate = layer === 'outer' ? (part === 'head' ? 0.5 : 0.25) : 0;
        for (const face of FACES) {
          const main = quadGeometry(part, layer, face, model, inflate, 0, textureUvs);
          const mesh = new THREE.Mesh(main.geo, layer === 'outer' ? outerMaterial : bodyMaterial);
          mesh.userData = { part, layer, face, rect: main.rect };
          const overlay = quadGeometry(part, layer, face, model, inflate, 0.01, gridUvs);
          const grid = new THREE.Mesh(overlay.geo, gridMaterials[layer]);
          grid.renderOrder = 1;
          const marked = quadGeometry(part, layer, face, model, inflate, 0.02, textureUvs);
          const mark = new THREE.Mesh(marked.geo, highlightMaterial);
          mark.renderOrder = 2;
          group.add(mesh, grid, mark);
          entries.push({ mesh, grid, mark, part, layer });
          pickable.push(mesh);
        }
      }
    }
    applyPose();
  }

  function applyVisibility() {
    for (const e of entries) {
      const on = !!state.show[e.layer] && !!state.partVisible[e.part];
      e.mesh.visible = on;
      e.grid.visible = on && !!state.grid && !plain;
      e.mark.visible = on && !!highlight && !plain;
    }
  }

  let plain = false;
  let theta = DEFAULT_THETA;
  let phi = DEFAULT_PHI;
  let dist = DEFAULT_DIST;

  function updateCamera() {
    const sp = Math.sin(phi);
    camera.position.set(
      TARGET.x + dist * sp * Math.sin(theta),
      TARGET.y + dist * Math.cos(phi),
      TARGET.z + dist * sp * Math.cos(theta)
    );
    camera.lookAt(TARGET);
  }

  const orbit = {
    rotate(dx, dy) {
      theta -= dx * 0.01;
      phi = Math.min(MAX_PHI, Math.max(MIN_PHI, phi - dy * 0.01));
    },
    zoom(delta) {
      dist = Math.min(MAX_DIST, Math.max(MIN_DIST, dist * Math.exp(delta * 0.0015)));
    },
    reset() {
      theta = DEFAULT_THETA;
      phi = DEFAULT_PHI;
      dist = DEFAULT_DIST;
    },
    set(next) {
      if (Number.isFinite(next.theta)) theta = next.theta;
      if (Number.isFinite(next.phi)) phi = Math.min(MAX_PHI, Math.max(MIN_PHI, next.phi));
      if (Number.isFinite(next.dist)) dist = Math.min(MAX_DIST, Math.max(MIN_DIST, next.dist));
    }
  };

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    updateCamera();
    camera.updateMatrixWorld();
    root.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, camera);
    const layer = state.layer;
    const candidates = pickable.filter(m => {
      const u = m.userData;
      return u.layer === layer && !!state.show[layer] && !!state.partVisible[u.part];
    });
    const hits = raycaster.intersectObjects(candidates, false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    if (!hit.uv) return null;
    const r = hit.object.userData.rect;
    const x = Math.min(r.x + r.w - 1, Math.max(r.x, Math.floor(hit.uv.x * SIZE)));
    const y = Math.min(r.y + r.h - 1, Math.max(r.y, Math.floor(hit.uv.y * SIZE)));
    return { x, y, face: faceAt(x, y, doc.model) };
  }

  let clearKey = null;

  function render() {
    const source = preview || doc.pixels;
    if (source !== lastPixels) {
      lastPixels = source;
      texture.image.data = wrap(source);
      lastVersion = -1;
    }
    if (doc.version !== lastVersion) {
      lastVersion = doc.version;
      texture.needsUpdate = true;
    }
    if (clearKey !== state.backdrop) {
      clearKey = state.backdrop;
      renderer.setClearColor(BACKDROPS[state.backdrop] ?? BACKDROPS.dark, 1);
    }
    if (poseName !== state.pose) applyPose();
    applyVisibility();
    updateCamera();
    renderer.render(scene, camera);
  }

  function setPreview(pixels) {
    preview = pixels || null;
    lastVersion = -1;
  }

  function setHighlight(pixels) {
    highlight = pixels || null;
    if (highlight) {
      highlightData.set(highlight);
      highlightTexture.needsUpdate = true;
    }
  }

  function renderToBlob({ width = 512, height = 768 } = {}) {
    plain = true;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setClearColor(0x000000, 0);
    clearKey = null;
    if (poseName !== state.pose) applyPose();
    applyVisibility();
    updateCamera();
    renderer.render(scene, camera);
    const done = new Promise((resolve, reject) => {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The render could not be saved.'))), 'image/png');
    });
    plain = false;
    resize();
    render();
    return done;
  }

  rebuild();
  resize();

  return { render, pick, rebuild, resize, orbit, setPreview, setHighlight, renderToBlob };
}
