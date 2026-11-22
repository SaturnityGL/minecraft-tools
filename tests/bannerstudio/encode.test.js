import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodeGif, encodeApng } from '../../assets/js/bannerstudio/encode.js';

function lzwDecode(minCodeSize, bytes, pixelCount) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const out = new Uint8Array(pixelCount);
  let written = 0;
  let size = minCodeSize + 1;
  let next = endCode + 1;
  let previous = -1;
  let buffer = 0;
  let held = 0;
  let at = 0;

  const expand = code => {
    const chars = [];
    while (code >= clearCode) {
      chars.push(suffix[code]);
      code = prefix[code];
    }
    chars.push(code);
    return chars.reverse();
  };

  for (;;) {
    while (held < size) {
      assert.ok(at < bytes.length, 'LZW stream ended before the end code');
      buffer |= bytes[at++] << held;
      held += 8;
    }
    const code = buffer & ((1 << size) - 1);
    buffer >>>= size;
    held -= size;
    if (code === clearCode) {
      size = minCodeSize + 1;
      next = endCode + 1;
      previous = -1;
      continue;
    }
    if (code === endCode) break;
    let chars;
    if (previous === -1) {
      chars = [code];
    } else {
      assert.ok(code <= next, `invalid LZW code ${code} with table size ${next}`);
      const base = expand(previous);
      chars = code < next ? expand(code) : [...base, base[0]];
      if (next < 4096) {
        prefix[next] = previous;
        suffix[next] = chars[0];
        next++;
        if (next === 1 << size && size < 12) size++;
      }
    }
    for (const value of chars) out[written++] = value;
    previous = code;
  }
  assert.equal(written, pixelCount);
  return out;
}

function decodeGif(bytes) {
  const text = String.fromCharCode(...bytes.subarray(0, 6));
  assert.equal(text, 'GIF89a');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const flags = bytes[10];
  let at = 13;
  let globalPalette = null;
  if (flags & 0x80) {
    const entries = 1 << ((flags & 7) + 1);
    globalPalette = bytes.subarray(at, at + entries * 3);
    at += entries * 3;
  }
  const result = { width, height, globalPalette, loop: null, frames: [], blocks: [] };
  let canvas = new Uint8Array(width * height * 4);
  let control = null;
  let pendingDisposal = 0;
  let pendingRect = null;

  while (bytes[at] !== 0x3b) {
    const kind = bytes[at++];
    if (kind === 0x21) {
      const label = bytes[at++];
      if (label === 0xf9) {
        assert.equal(bytes[at], 4);
        const packed = bytes[at + 1];
        control = {
          disposal: (packed >> 2) & 7,
          transparent: packed & 1 ? bytes[at + 4] : -1,
          delay: view.getUint16(at + 2, true)
        };
        at += 6;
      } else {
        const name = String.fromCharCode(...bytes.subarray(at + 1, at + 1 + bytes[at]));
        at += 1 + bytes[at];
        result.blocks.push(name);
        while (bytes[at] !== 0) {
          if (name === 'NETSCAPE2.0' && bytes[at] === 3 && bytes[at + 1] === 1) {
            result.loop = view.getUint16(at + 2, true);
          }
          at += 1 + bytes[at];
        }
        at++;
      }
    } else if (kind === 0x2c) {
      const left = view.getUint16(at, true);
      const top = view.getUint16(at + 2, true);
      const w = view.getUint16(at + 4, true);
      const h = view.getUint16(at + 6, true);
      const packed = bytes[at + 8];
      at += 9;
      let palette = globalPalette;
      let localPalette = null;
      if (packed & 0x80) {
        const entries = 1 << ((packed & 7) + 1);
        localPalette = bytes.subarray(at, at + entries * 3);
        palette = localPalette;
        at += entries * 3;
      }
      const minCodeSize = bytes[at++];
      const chunks = [];
      while (bytes[at] !== 0) {
        chunks.push(bytes.subarray(at + 1, at + 1 + bytes[at]));
        at += 1 + bytes[at];
      }
      at++;
      const packedBytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        packedBytes.set(chunk, offset);
        offset += chunk.length;
      }
      const indices = lzwDecode(minCodeSize, packedBytes, w * h);

      if (pendingDisposal === 2 && pendingRect) {
        for (let y = pendingRect.y; y < pendingRect.y + pendingRect.h; y++) {
          canvas.fill(0, (y * width + pendingRect.x) * 4, (y * width + pendingRect.x + pendingRect.w) * 4);
        }
      }
      const transparent = control ? control.transparent : -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const index = indices[y * w + x];
          if (index === transparent) continue;
          assert.ok(index * 3 < palette.length, 'index outside the color table');
          const o = ((top + y) * width + left + x) * 4;
          canvas[o] = palette[index * 3];
          canvas[o + 1] = palette[index * 3 + 1];
          canvas[o + 2] = palette[index * 3 + 2];
          canvas[o + 3] = 255;
        }
      }
      result.frames.push({
        rect: { x: left, y: top, w, h },
        delay: control.delay,
        disposal: control.disposal,
        localPalette,
        rgba: canvas.slice()
      });
      pendingDisposal = control.disposal;
      pendingRect = { x: left, y: top, w, h };
      control = null;
    } else {
      assert.fail(`unexpected block 0x${kind.toString(16)}`);
    }
  }
  return result;
}

function makeFrame(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = paint(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }
  return { data, width, height };
}

function rgbOnly(rgba) {
  const out = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    out[j] = rgba[i];
    out[j + 1] = rgba[i + 1];
    out[j + 2] = rgba[i + 2];
  }
  return out;
}

function pixelArtFrame(shift) {
  return makeFrame(40, 12, (x, y) => {
    const band = Math.floor(((x + shift) % 40) / 4);
    const stripe = y % 3;
    return [band * 25, 40 + stripe * 70, (band * 17 + stripe * 31) % 256];
  });
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('lossless path round-trips pixel art exactly in every mode', async () => {
  const frames = [pixelArtFrame(0), pixelArtFrame(5), pixelArtFrame(13)];
  const seen = new Set();
  for (const frame of frames) {
    for (let i = 0; i < frame.data.length; i += 4) seen.add((frame.data[i] << 16) | (frame.data[i + 1] << 8) | frame.data[i + 2]);
  }
  assert.ok(seen.size > 8 && seen.size <= 50, `fixture has ${seen.size} colors`);
  for (const palette of ['global', 'local']) {
    for (const dither of ['none', 'bayer', 'floyd']) {
      const gif = await encodeGif(frames, { delayCs: 4, loop: 0, dither, palette });
      const decoded = decodeGif(gif);
      assert.equal(decoded.frames.length, 3);
      frames.forEach((frame, i) => {
        assert.deepEqual(rgbOnly(decoded.frames[i].rgba), rgbOnly(frame.data), `${palette}/${dither} frame ${i}`);
      });
    }
  }
});

test('small changes are written as sub-rectangles and still composite exactly', async () => {
  const base = (x, y) => [(x % 16) * 16, (y % 8) * 30, 90];
  const frames = [0, 1, 2, 3].map(step =>
    makeFrame(64, 32, (x, y) => (x >= 20 + step && x < 26 + step && y >= 10 && y < 14 ? [255, 255, 0] : base(x, y)))
  );
  frames.push(frames[3]);
  for (const palette of ['global', 'local']) {
    const decoded = decodeGif(await encodeGif(frames, { palette }));
    assert.deepEqual(decoded.frames[0].rect, { x: 0, y: 0, w: 64, h: 32 });
    for (let i = 1; i < frames.length; i++) {
      const { rect } = decoded.frames[i];
      assert.ok(rect.w * rect.h < 64 * 32 / 4, `${palette} frame ${i} used ${rect.w}x${rect.h}`);
    }
    assert.deepEqual(decoded.frames[4].rect.w * decoded.frames[4].rect.h, 1);
    assert.ok(decoded.frames.slice(1).every(frame => frame.disposal === 1));
    frames.forEach((frame, i) => {
      assert.deepEqual(rgbOnly(decoded.frames[i].rgba), rgbOnly(frame.data), `${palette} frame ${i}`);
    });
  }
});

test('smooth gradients quantize within the color budget with low error', async () => {
  const frames = [0, 40].map(offset =>
    makeFrame(160, 90, (x, y) => {
      const u = (x + offset) / 199;
      const shade = 1 - (y / 89) * 0.3;
      return [
        Math.round((60 + 195 * u) * shade),
        Math.round((220 - 160 * Math.abs(u - 0.5) * 2) * shade),
        Math.round((255 - 200 * u) * shade)
      ];
    })
  );
  const run = async opts => {
    const decoded = decodeGif(await encodeGif(frames, { colors: 64, ...opts }));
    assert.ok(decoded.globalPalette.length / 3 <= 64);
    let total = 0;
    let used = new Set();
    frames.forEach((frame, i) => {
      const got = rgbOnly(decoded.frames[i].rgba);
      const want = rgbOnly(frame.data);
      for (let k = 0; k < want.length; k++) total += Math.abs(got[k] - want[k]);
      for (let k = 0; k < got.length; k += 3) used.add((got[k] << 16) | (got[k + 1] << 8) | got[k + 2]);
    });
    assert.ok(used.size <= 64, `${used.size} distinct output colors`);
    return total / (frames.length * 160 * 90 * 3);
  };
  const plain = await run({});
  assert.ok(plain < 6, `mean abs error ${plain}`);
  const ordered = await run({ dither: 'bayer' });
  const diffused = await run({ dither: 'floyd' });
  assert.ok(ordered < 16, `bayer error ${ordered}`);
  assert.ok(diffused < 16, `floyd error ${diffused}`);
});

test('loop extension and frame delays are encoded', async () => {
  const frames = [pixelArtFrame(0), pixelArtFrame(1)];
  const forever = decodeGif(await encodeGif(frames, { delayCs: 7, loop: 0 }));
  assert.ok(forever.blocks.includes('NETSCAPE2.0'));
  assert.equal(forever.loop, 0);
  assert.deepEqual(forever.frames.map(f => f.delay), [7, 7]);
  const thrice = decodeGif(await encodeGif(frames, { delayCs: 300, loop: 3, palette: 'local' }));
  assert.equal(thrice.loop, 3);
  assert.deepEqual(thrice.frames.map(f => f.delay), [300, 300]);
});

test('progress reports reach 1 and a plain yield keeps the event loop alive', async () => {
  const seenValues = [];
  await encodeGif([pixelArtFrame(0), pixelArtFrame(2)], {}, value => seenValues.push(value));
  assert.equal(seenValues[seenValues.length - 1], 1);
  assert.ok(seenValues.every((value, i) => i === 0 || value >= seenValues[i - 1]));
});

test('transparent mode keeps alpha cut-outs and restores to background', async () => {
  const frames = [0, 1, 2].map(step =>
    makeFrame(30, 20, (x, y) => ((x + step * 5) % 30 < 8 ? [0, 0, 0, 0] : [200, 30 + (y % 8) * 10, 60 + (x % 16) * 8]))
  );
  const decoded = decodeGif(await encodeGif(frames, { transparent: true }));
  assert.ok(decoded.frames.every(frame => frame.disposal === 2));
  frames.forEach((frame, i) => {
    for (let p = 0; p < frame.data.length; p += 4) {
      const cut = frame.data[p + 3] < 128;
      assert.equal(decoded.frames[i].rgba[p + 3], cut ? 0 : 255);
      if (!cut) {
        assert.deepEqual([...decoded.frames[i].rgba.subarray(p, p + 3)], [...frame.data.subarray(p, p + 3)]);
      }
    }
  });
});

test('LZW survives table resets, wide codes and tiny palettes', async () => {
  const random = seededRandom(1234);
  const colorTable = Array.from({ length: 256 }, () => [random() * 256 | 0, random() * 256 | 0, random() * 256 | 0]);
  const noisy = makeFrame(220, 160, () => colorTable[(random() * 256) | 0]);
  const decoded = decodeGif(await encodeGif([noisy], {}));
  assert.deepEqual(rgbOnly(decoded.frames[0].rgba), rgbOnly(noisy.data));

  for (let round = 0; round < 80; round++) {
    const w = 1 + ((random() * 90) | 0);
    const h = 1 + ((random() * 60) | 0);
    const paletteSize = 1 + ((random() * 255) | 0);
    const table = Array.from({ length: paletteSize }, () => [random() * 256 | 0, random() * 256 | 0, random() * 256 | 0]);
    const runs = random() < 0.5;
    const frame = makeFrame(w, h, (x, y) => table[runs ? ((x >> 2) + y) % paletteSize : (random() * paletteSize) | 0]);
    const result = decodeGif(await encodeGif([frame], { colors: 256, palette: round % 2 ? 'local' : 'global' }));
    assert.deepEqual(rgbOnly(result.frames[0].rgba), rgbOnly(frame.data), `round ${round} ${w}x${h} palette ${paletteSize}`);
  }
});

function readPngChunks(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let at = 8;
  while (at < bytes.length) {
    const length = view.getUint32(at);
    chunks.push({
      type: String.fromCharCode(...bytes.subarray(at + 4, at + 8)),
      data: bytes.subarray(at + 8, at + 8 + length),
      crc: view.getUint32(at + 8 + length),
      crcInput: bytes.subarray(at + 4, at + 8 + length)
    });
    at += 12 + length;
  }
  return chunks;
}

function crcOf(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function unfilter(raw, width, height) {
  const rowBytes = width * 4;
  const out = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (rowBytes + 1)];
    for (let i = 0; i < rowBytes; i++) {
      const value = raw[y * (rowBytes + 1) + 1 + i];
      const a = i >= 4 ? out[y * rowBytes + i - 4] : 0;
      const b = y > 0 ? out[(y - 1) * rowBytes + i] : 0;
      const c = i >= 4 && y > 0 ? out[(y - 1) * rowBytes + i - 4] : 0;
      let predictor = 0;
      if (type === 1) predictor = a;
      if (type === 2) predictor = b;
      if (type === 3) predictor = (a + b) >> 1;
      if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * rowBytes + i] = (value + predictor) & 255;
    }
  }
  return out;
}

test('APNG has ordered chunks, increasing sequence numbers, valid CRCs and round-trips frames', async () => {
  const frames = [0, 1, 2, 3].map(step =>
    makeFrame(48, 20, (x, y) => (x >= 10 + step * 3 && x < 18 + step * 3 && y > 5 && y < 12 ? [250, 200, 20, 255] : [x * 5, y * 12, 120, x > 40 ? 128 : 255]))
  );
  frames.push(frames[3]);
  const apng = await encodeApng(frames, { delayMs: 60, loop: 0 });
  const chunks = readPngChunks(apng);
  for (const chunk of chunks) assert.equal(crcOf(chunk.crcInput), chunk.crc, `crc of ${chunk.type}`);

  const types = chunks.map(c => c.type);
  assert.equal(types[0], 'IHDR');
  assert.equal(types[types.length - 1], 'IEND');
  assert.ok(types.indexOf('acTL') < types.indexOf('IDAT'));
  assert.ok(types.indexOf('fcTL') < types.indexOf('IDAT'));
  assert.equal(types.filter(t => t === 'IDAT').length, 1);
  assert.equal(types.filter(t => t === 'fcTL').length, frames.length);
  assert.equal(types.filter(t => t === 'fdAT').length, frames.length - 1);

  const control = new DataView(chunks[types.indexOf('acTL')].data.buffer, chunks[types.indexOf('acTL')].data.byteOffset, 8);
  assert.equal(control.getUint32(0), frames.length);
  assert.equal(control.getUint32(4), 0);

  const sequences = [];
  const rects = [];
  for (const chunk of chunks) {
    const view = new DataView(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
    if (chunk.type === 'fcTL') {
      sequences.push(view.getUint32(0));
      rects.push({ w: view.getUint32(4), h: view.getUint32(8), x: view.getUint32(12), y: view.getUint32(16) });
      assert.equal(view.getUint16(20), 60);
      assert.equal(view.getUint16(22), 1000);
      assert.equal(chunk.data[24], 0);
      assert.equal(chunk.data[25], 0);
    }
    if (chunk.type === 'fdAT') sequences.push(view.getUint32(0));
  }
  sequences.forEach((value, i) => assert.equal(value, i));
  assert.deepEqual(rects[0], { w: 48, h: 20, x: 0, y: 0 });
  assert.ok(rects[1].w * rects[1].h < 48 * 20);
  assert.equal(rects[4].w * rects[4].h, 1);

  const first = unfilter(inflateSync(chunks[types.indexOf('IDAT')].data), 48, 20);
  assert.deepEqual([...first], [...frames[0].data]);

  const canvas = new Uint8Array(first);
  const fdats = chunks.filter(c => c.type === 'fdAT');
  for (let i = 1; i < frames.length; i++) {
    const { w, h, x, y } = rects[i];
    const part = unfilter(inflateSync(fdats[i - 1].data.subarray(4)), w, h);
    for (let row = 0; row < h; row++) {
      canvas.set(part.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * 48 + x) * 4);
    }
    assert.deepEqual([...canvas], [...frames[i].data], `apng frame ${i}`);
  }
});
