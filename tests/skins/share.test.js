import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare } from '../../assets/js/skins/share.js';

const BROKEN = 'That share link is damaged or incomplete.';

function sample() {
  const px = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < px.length; i++) px[i] = (i * 7 + (i >> 5)) % 256;
  return px;
}

test('round trip keeps pixels and model', async () => {
  for (const model of ['classic', 'slim']) {
    const px = sample();
    const text = await encodeShare(px, model);
    assert.match(text, /^v1[cs][A-Za-z0-9_-]+$/);
    const out = await decodeShare(text);
    assert.equal(out.model, model);
    assert.deepEqual(Array.from(out.pixels), Array.from(px));
  }
});

test('empty skin compresses small and round trips', async () => {
  const px = new Uint8ClampedArray(64 * 64 * 4);
  const text = await encodeShare(px, 'classic');
  assert.ok(text.length < 200);
  const out = await decodeShare(text);
  assert.deepEqual(Array.from(out.pixels), Array.from(px));
});

test('encode ignores a subarray offset', async () => {
  const backing = new Uint8ClampedArray(64 * 64 * 4 + 8);
  const px = backing.subarray(8);
  px[0] = 77;
  const out = await decodeShare(await encodeShare(px, 'classic'));
  assert.equal(out.pixels[0], 77);
  assert.equal(out.pixels.length, 16384);
});

test('bad prefix rejects with the user-facing message', async () => {
  const good = await encodeShare(sample(), 'classic');
  for (const bad of ['', 'garbage', 'v2' + good.slice(2), 'v1x' + good.slice(3), good.slice(1)]) {
    await assert.rejects(decodeShare(bad), { message: BROKEN });
  }
});

test('bad base64 rejects', async () => {
  await assert.rejects(decodeShare('v1c!!!!'), { message: BROKEN });
  await assert.rejects(decodeShare('v1cA'), { message: BROKEN });
  await assert.rejects(decodeShare('v1c'), { message: BROKEN });
});

test('failed inflate rejects', async () => {
  await assert.rejects(decodeShare('v1c' + 'A'.repeat(64)), { message: BROKEN });
});

test('truncated input rejects', async () => {
  const good = await encodeShare(sample(), 'slim');
  await assert.rejects(decodeShare(good.slice(0, Math.floor(good.length / 2))), { message: BROKEN });
  await assert.rejects(decodeShare(good.slice(0, good.length - 8)), { message: BROKEN });
});

test('wrong length rejects', async () => {
  const stream = new Blob([new Uint8Array(100)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  const text = btoa(String.fromCharCode(...packed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await assert.rejects(decodeShare('v1c' + text), { message: BROKEN });
});

test('non-string rejects', async () => {
  await assert.rejects(decodeShare(null), { message: BROKEN });
});
