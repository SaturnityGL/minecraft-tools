import { upgradeLegacy, detectModel } from './convert.js';
import { encodePng } from './png.js';

const UNREADABLE = 'That file is not an image I can read.';

function wrongSize(w, h) {
  return `That image is ${w}x${h}. Skins need to be 64x64 (or the old 64x32).`;
}

export async function importSkin(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } catch (err) {
    throw new Error(UNREADABLE);
  }
  try {
    const w = bitmap.width;
    const h = bitmap.height;
    if (w !== 64 || (h !== 64 && h !== 32)) throw new Error(wrongSize(w, h));
    const raw = readExact(bitmap, w, h) || readCanvas(bitmap, w, h);
    if (h === 32) return { pixels: upgradeLegacy(raw), model: 'classic' };
    return { pixels: raw, model: detectModel(raw) };
  } finally {
    bitmap.close();
  }
}

function readExact(bitmap, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
  if (!gl) return null;
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    const out = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    if (gl.getError() !== gl.NO_ERROR) return null;
    return new Uint8ClampedArray(out.buffer);
  } finally {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  }
}

function readCanvas(bitmap, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  return new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
}

export async function exportPng(pixels) {
  return new Blob([await encodePng(pixels, 64, 64)], { type: 'image/png' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
