import { SIZE, FACES, LAYERS, faceRect, mirrorPart } from './skinmap.js';
import { armSourceColumn } from './convert.js';

const MIRROR_FACE = {
  top: 'top',
  bottom: 'bottom',
  front: 'front',
  back: 'back',
  right: 'left',
  left: 'right'
};

const LIMBS = ['rightArm', 'leftArm', 'rightLeg', 'leftLeg'];

function oneStroke(doc, work) {
  if (doc.inStroke) doc.endStroke();
  doc.beginStroke();
  work();
  return doc.endStroke();
}

export function pushToOuter(doc, part) {
  return oneStroke(doc, () => {
    for (const face of FACES) {
      const from = faceRect(part, 'body', face, doc.model);
      const to = faceRect(part, 'outer', face, doc.model);
      for (let y = 0; y < from.h; y++) {
        for (let x = 0; x < from.w; x++) {
          doc.setPixel(to.x + x, to.y + y, doc.getPixel(from.x + x, from.y + y));
        }
      }
    }
  });
}

export function flattenToBody(doc, part) {
  return oneStroke(doc, () => {
    for (const face of FACES) {
      const body = faceRect(part, 'body', face, doc.model);
      const outer = faceRect(part, 'outer', face, doc.model);
      for (let y = 0; y < body.h; y++) {
        for (let x = 0; x < body.w; x++) {
          const b = doc.getPixel(body.x + x, body.y + y);
          const o = doc.getPixel(outer.x + x, outer.y + y);
          if (o[3] === 0 && b[3] === 0) continue;
          const oa = o[3] / 255;
          const ba = b[3] / 255;
          const outA = oa + ba * (1 - oa);
          const mix = i => Math.round((o[i] * oa + b[i] * ba * (1 - oa)) / outA);
          doc.setPixel(body.x + x, body.y + y, [mix(0), mix(1), mix(2), 255]);
          doc.setPixel(outer.x + x, outer.y + y, [0, 0, 0, 0]);
        }
      }
    }
  });
}

export function extractPart(pixels, part, layers, model) {
  const piece = { part, model, layers: {} };
  for (const layer of LAYERS) {
    if (!layers.includes(layer)) continue;
    const faces = {};
    for (const face of FACES) {
      const r = faceRect(part, layer, face, model);
      const data = new Uint8ClampedArray(r.w * r.h * 4);
      for (let y = 0; y < r.h; y++) {
        const start = ((r.y + y) * SIZE + r.x) * 4;
        data.set(pixels.subarray(start, start + r.w * 4), y * r.w * 4);
      }
      faces[face] = data;
    }
    piece.layers[layer] = faces;
  }
  return piece;
}

function flipColumns(data, w, h) {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      out.set(data.subarray(s, s + 4), (y * w + (w - 1 - x)) * 4);
    }
  }
  return out;
}

export function applyPart(doc, piece, targetPart, { layers } = {}) {
  const mirrored = targetPart !== piece.part && targetPart === mirrorPart(piece.part);
  if (targetPart !== piece.part && !mirrored) throw new RangeError(`cannot apply ${piece.part} to ${targetPart}`);
  const wanted = layers || Object.keys(piece.layers);
  return oneStroke(doc, () => {
    for (const layer of LAYERS) {
      if (!wanted.includes(layer) || !piece.layers[layer]) continue;
      for (const face of FACES) {
        const srcFace = mirrored ? MIRROR_FACE[face] : face;
        const srcRect = faceRect(piece.part, layer, srcFace, piece.model);
        let data = piece.layers[layer][srcFace];
        if (mirrored) data = flipColumns(data, srcRect.w, srcRect.h);
        const dst = faceRect(targetPart, layer, face, doc.model);
        for (let y = 0; y < dst.h; y++) {
          for (let x = 0; x < dst.w; x++) {
            const sx = armSourceColumn(targetPart, face, srcRect.w, dst.w, x);
            const s = (y * srcRect.w + sx) * 4;
            doc.setPixel(dst.x + x, dst.y + y, [data[s], data[s + 1], data[s + 2], data[s + 3]]);
          }
        }
      }
    }
  });
}

export function copyLimbToOtherSide(doc, part) {
  if (!LIMBS.includes(part)) return false;
  const piece = extractPart(doc.pixels, part, LAYERS, doc.model);
  return applyPart(doc, piece, mirrorPart(part));
}
