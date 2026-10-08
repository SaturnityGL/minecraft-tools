import { SIZE } from './skinmap.js';

const LENGTH = SIZE * SIZE * 4;
const VERSION = 'v1';
const MODEL_CODES = { classic: 'c', slim: 's' };
const CODE_MODELS = { c: 'classic', s: 'slim' };
const BROKEN = 'That share link is damaged or incomplete.';
const CHUNK = 0x8000;
const MAX_BODY = 24000;

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeShare(pixels, model) {
  const code = MODEL_CODES[model];
  if (!code) throw new RangeError(`unknown model: ${model}`);
  if (pixels.length !== LENGTH) throw new RangeError(`pixels must have ${LENGTH} bytes`);
  const packed = await pipe(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length), new CompressionStream('deflate-raw'));
  return VERSION + code + toBase64Url(packed);
}

export async function decodeShare(str) {
  if (typeof str !== 'string') throw new Error(BROKEN);
  const head = str.slice(0, VERSION.length);
  const model = CODE_MODELS[str.charAt(VERSION.length)];
  const body = str.slice(VERSION.length + 1);
  if (head !== VERSION || !model || body.length > MAX_BODY || !/^[A-Za-z0-9_-]+$/.test(body)) throw new Error(BROKEN);
  let raw;
  try {
    raw = await pipe(fromBase64Url(body), new DecompressionStream('deflate-raw'));
  } catch {
    throw new Error(BROKEN);
  }
  if (raw.length !== LENGTH) throw new Error(BROKEN);
  return { pixels: new Uint8ClampedArray(raw), model };
}
