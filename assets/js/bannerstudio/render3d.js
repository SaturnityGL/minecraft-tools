import { texture, shaded, tintFor } from './assets.js';

const DEG = Math.PI / 180;

function faceCorners(face, f, t) {
  switch (face) {
    case 'south': return [[f[0], t[1], t[2]], [t[0], t[1], t[2]], [f[0], f[1], t[2]]];
    case 'north': return [[t[0], t[1], f[2]], [f[0], t[1], f[2]], [t[0], f[1], f[2]]];
    case 'east': return [[t[0], t[1], t[2]], [t[0], t[1], f[2]], [t[0], f[1], t[2]]];
    case 'west': return [[f[0], t[1], f[2]], [f[0], t[1], t[2]], [f[0], f[1], f[2]]];
    case 'up': return [[f[0], t[1], f[2]], [t[0], t[1], f[2]], [f[0], t[1], t[2]]];
    case 'down': return [[f[0], f[1], t[2]], [t[0], f[1], t[2]], [f[0], f[1], f[2]]];
  }
  return null;
}

function defaultUv(face, f, t) {
  switch (face) {
    case 'down': return [f[0], 16 - t[2], t[0], 16 - f[2]];
    case 'up': return [f[0], f[2], t[0], t[2]];
    case 'north': return [16 - t[0], 16 - t[1], 16 - f[0], 16 - f[1]];
    case 'south': return [f[0], 16 - t[1], t[0], 16 - f[1]];
    case 'west': return [f[2], 16 - t[1], t[2], 16 - f[1]];
    case 'east': return [16 - t[2], 16 - t[1], 16 - f[2], 16 - f[1]];
  }
  return [0, 0, 16, 16];
}

function rotAxis(p, axis, ang, o) {
  if (!ang) return p;
  const c = Math.cos(ang), s = Math.sin(ang);
  const x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
  if (axis === 'x') return [x + o[0], y * c - z * s + o[1], y * s + z * c + o[2]];
  if (axis === 'y') return [x * c + z * s + o[0], y + o[1], -x * s + z * c + o[2]];
  return [x * c - y * s + o[0], x * s + y * c + o[1], z + o[2]];
}

function elementRot(p, r) {
  if (!r || !r.angle) return p;
  const ang = r.angle * DEG;
  let q = rotAxis(p, r.axis, ang, r.origin);
  if (r.rescale) {
    const k = 1 / Math.cos(Math.abs(ang) > 0 ? Math.min(Math.abs(ang), 45 * DEG) : 0);
    const o = r.origin;
    q = q.map((v, i) => (['x', 'y', 'z'][i] === r.axis ? v : o[i] + (v - o[i]) * k));
  }
  return q;
}

function viewMatrix(yaw, pitch, roll) {
  const cy = Math.cos(yaw * DEG), sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG), sp = Math.sin(pitch * DEG);
  const cr = Math.cos((roll || 0) * DEG), sr = Math.sin((roll || 0) * DEG);
  return p => {
    let x = p[0] * cy + p[2] * sy;
    let z = -p[0] * sy + p[2] * cy;
    let y = p[1];
    const y2 = y * cp - z * sp;
    const z2 = y * sp + z * cp;
    const x3 = x * cr - y2 * sr;
    const y3 = x * sr + y2 * cr;
    return [x3, y3, z2];
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function drawModel(ctx, model, opts) {
  if (!model) return;
  const size = opts.size || 64;
  const s = size / (model.extent * 1.5);
  const view = viewMatrix(opts.yaw ?? 45, opts.pitch ?? 30, opts.roll || 0);
  const light = opts.light ?? 1;
  const L = normalize([-0.35, 0.85, 0.55]);
  const frame = opts.frame || 0;
  const c = model.center;
  const quads = [];
  for (const el of model.elements) {
    const f = el.from, t = el.to;
    const flat = [0, 1, 2].some(i => Math.abs(t[i] - f[i]) < 0.001);
    for (const face in el.faces) {
      const fd = el.faces[face];
      let pts = faceCorners(face, f, t);
      if (!pts) continue;
      pts = pts.map(p => {
        let q = elementRot(p, el.rotation);
        if (el.pivot && (el.rotX || el.rotZ)) {
          if (el.rotX) q = rotAxis(q, 'x', el.rotX * DEG, el.pivot);
          if (el.rotZ) q = rotAxis(q, 'z', el.rotZ * DEG, el.pivot);
        }
        return view([q[0] - c[0], q[1] - c[1], q[2] - c[2]]);
      });
      const n = cross(sub(pts[2], pts[0]), sub(pts[1], pts[0]));
      const nl = Math.hypot(n[0], n[1], n[2]);
      if (nl < 1e-6) continue;
      const nn = [n[0] / nl, n[1] / nl, n[2] / nl];
      if (!flat && nn[2] <= 0.001) continue;
      let img, uv, fi = 0;
      if (fd.img) {
        img = fd.img;
        uv = fd.uvp.slice();
      } else {
        fi = typeof frame === 'function' ? frame(fd.tex) : frame;
        img = texture(fd.tex, fi);
        if (!img) continue;
        const k = img.width / 16;
        uv = (fd.uv || defaultUv(face, f, t)).map(v => v * k);
      }
      let shade = 1;
      if (el.shade !== false && light > 0) {
        const nv = nn[2] < 0 ? nn.map(v => -v) : nn;
        const d = Math.max(0, nv[0] * L[0] + nv[1] * L[1] + nv[2] * L[2]);
        shade = 1 - light * (1 - (0.42 + 0.58 * d));
      }
      const depth = (pts[0][2] + pts[1][2] + pts[2][2] + (pts[1][2] + pts[2][2] - pts[0][2])) / 4 + (el.overlay ? 0.01 : 0);
      quads.push({ pts, img, uv, rot: fd.rotation || 0, shade, tint: fd.tint ? (opts.tint || tintFor(fd.tex)) : null, key: fd.tex ? fd.tex + '#' + fi : ('img' + (opts.skinKey || '')), depth });
    }
  }
  quads.sort((a, b) => a.depth - b.depth);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const base = ctx.getTransform();
  for (const q of quads) drawQuad(ctx, base, q, s);
  ctx.setTransform(base);
  ctx.restore();
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function drawQuad(ctx, base, q, s) {
  const P = q.pts.map(p => [p[0] * s, -p[1] * s]);
  let A = P[0], B = P[1], C = P[2];
  let D = [B[0] + C[0] - A[0], B[1] + C[1] - A[1]];
  let [u1, v1, u2, v2] = q.uv;
  if (u2 < u1) { [A, B] = [B, A]; [C, D] = [D, C]; [u1, u2] = [u2, u1]; }
  if (v2 < v1) { [A, C] = [C, A]; [B, D] = [D, B]; [v1, v2] = [v2, v1]; }
  const r = ((q.rot % 360) + 360) % 360;
  if (r === 90) [A, B, C, D] = [B, D, A, C];
  else if (r === 180) [A, B, C, D] = [D, C, B, A];
  else if (r === 270) [A, B, C, D] = [C, A, D, B];
  const ux = B[0] - A[0], uy = B[1] - A[1], vx = C[0] - A[0], vy = C[1] - A[1];
  const area = Math.abs(ux * vy - uy * vx);
  if (area < 0.05) return;
  const lu = Math.hypot(ux, uy) || 1, lv = Math.hypot(vx, vy) || 1;
  const ku = 1 + 0.7 / lu, kv = 1 + 0.7 / lv;
  const ax = A[0] - ux * (ku - 1) / 2 - vx * (kv - 1) / 2;
  const ay = A[1] - uy * (ku - 1) / 2 - vy * (kv - 1) / 2;
  const sw = Math.max(0.0001, u2 - u1), sh = Math.max(0.0001, v2 - v1);
  const src = (q.shade < 0.999 || q.tint) ? shaded(q.img, q.shade, q.tint, q.key) : q.img;
  ctx.setTransform(base);
  ctx.transform(ux * ku / sw, uy * ku / sw, vx * kv / sh, vy * kv / sh, ax, ay);
  ctx.drawImage(src, u1, v1, sw, sh, 0, 0, sw, sh);
}
