import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodePng, crc32 } from '../../assets/js/skins/png.js';

function readChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const crc = view.getUint32(offset + 8 + length);
    chunks.push({ type, data, crc, crcInput: bytes.subarray(offset + 4, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('encodePng writes a valid RGBA PNG that decodes to the same bytes', async () => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 31 + (i >> 3)) % 256;
  const png = await encodePng(pixels, 64, 64);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = readChunks(png);
  assert.deepEqual(chunks.map(c => c.type), ['IHDR', 'IDAT', 'IEND']);
  for (const c of chunks) assert.equal(crc32(c.crcInput), c.crc);
  const header = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset, 13);
  assert.equal(header.getUint32(0), 64);
  assert.equal(header.getUint32(4), 64);
  assert.deepEqual([...chunks[0].data.subarray(8, 13)], [8, 6, 0, 0, 0]);
  const raw = inflateSync(chunks[1].data);
  assert.equal(raw.length, 64 * (64 * 4 + 1));
  for (let y = 0; y < 64; y++) {
    const row = raw.subarray(y * 257, (y + 1) * 257);
    assert.equal(row[0], 0);
    assert.deepEqual([...row.subarray(1)], [...pixels.subarray(y * 256, (y + 1) * 256)]);
  }
});

test('encodePng keeps partial alpha and color under zero alpha exactly', async () => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  pixels.set([200, 100, 50, 128], 0);
  pixels.set([10, 20, 30, 0], 4);
  pixels.set([255, 1, 2, 3], 8);
  const png = await encodePng(pixels, 64, 64);
  const raw = inflateSync(readChunks(png)[1].data);
  assert.deepEqual([...raw.subarray(1, 13)], [200, 100, 50, 128, 10, 20, 30, 0, 255, 1, 2, 3]);
});

test('encodePng rejects a buffer of the wrong length', async () => {
  await assert.rejects(encodePng(new Uint8ClampedArray(10), 64, 64), RangeError);
});
