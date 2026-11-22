const HASH_BITS = 14;
const HASH_SIZE = 1 << HASH_BITS;
const SIMILAR_DISTANCE = 24;
const DITHER_MODES = ['none', 'bayer', 'floyd'];

class ByteSink {
  constructor(capacity = 1024) {
    this.bytes = new Uint8Array(capacity);
    this.length = 0;
  }

  reserve(extra) {
    const need = this.length + extra;
    if (need <= this.bytes.length) return;
    let capacity = this.bytes.length * 2;
    while (capacity < need) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  byte(value) {
    if (this.length === this.bytes.length) this.reserve(1);
    this.bytes[this.length++] = value;
  }

  u16le(value) {
    this.byte(value & 255);
    this.byte((value >> 8) & 255);
  }

  u24le(value) {
    this.u16le(value & 0xffff);
    this.byte((value >> 16) & 255);
  }

  u32le(value) {
    this.u16le(value & 0xffff);
    this.u16le((value >>> 16) & 0xffff);
  }

  u32be(value) {
    this.byte((value >>> 24) & 255);
    this.byte((value >>> 16) & 255);
    this.byte((value >>> 8) & 255);
    this.byte(value & 255);
  }

  ascii(text) {
    for (let i = 0; i < text.length; i++) this.byte(text.charCodeAt(i));
  }

  write(bytes) {
    this.reserve(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  result() {
    return this.bytes.slice(0, this.length);
  }
}

function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function checkFrames(frames) {
  if (!frames || !frames.length) throw new Error('At least one frame is required');
  const { width, height } = frames[0];
  if (!(width > 0 && height > 0)) throw new RangeError('Frame size must be positive');
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (frame.width !== width || frame.height !== height || frame.data.length !== width * height * 4) {
      throw new Error(`Frame ${i} does not match the size of frame 0`);
    }
  }
  return { width, height };
}

function asUint32(data) {
  const count = data.length >> 2;
  if (data.byteOffset % 4 === 0) return new Uint32Array(data.buffer, data.byteOffset, count);
  return new Uint32Array(new Uint8Array(data).buffer, 0, count);
}

function diffRect(current, previous, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if (current[row + x] !== previous[row + x]) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first < 0) continue;
    if (first < minX) minX = first;
    if (last > maxX) maxX = last;
    if (y < minY) minY = y;
    maxY = y;
  }
  if (maxX < 0) return null;
  return { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
}

function scanUnique(regions, limit, cutAlpha) {
  const seen = new Uint8Array(1 << 21);
  const keys = [];
  for (const region of regions) {
    const { data, width } = region;
    for (let y = region.y0; y < region.y1; y++) {
      let p = (y * width + region.x0) * 4;
      for (let x = region.x0; x < region.x1; x++, p += 4) {
        if (cutAlpha && data[p + 3] < 128) continue;
        const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
        const mask = 1 << (key & 7);
        if (seen[key >> 3] & mask) continue;
        seen[key >> 3] |= mask;
        if (keys.length === limit) return null;
        keys.push(key);
      }
    }
  }
  return keys;
}

function buildHistogram(regions, cutAlpha) {
  let total = 0;
  for (const region of regions) total += (region.x1 - region.x0) * (region.y1 - region.y0);
  let stride = Math.max(1, Math.ceil(total / 8000000));
  if (stride > 1 && stride % 2 === 0) stride++;
  const counts = new Uint32Array(32768);
  const sumR = new Uint32Array(32768);
  const sumG = new Uint32Array(32768);
  const sumB = new Uint32Array(32768);
  let countdown = 1;
  for (const region of regions) {
    const { data, width } = region;
    for (let y = region.y0; y < region.y1; y++) {
      let p = (y * width + region.x0) * 4;
      for (let x = region.x0; x < region.x1; x++, p += 4) {
        if (--countdown > 0) continue;
        countdown = stride;
        if (cutAlpha && data[p + 3] < 128) continue;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const bin = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        counts[bin]++;
        sumR[bin] += r;
        sumG[bin] += g;
        sumB[bin] += b;
      }
    }
  }
  return { counts, sumR, sumG, sumB };
}

function quantizeHistogram(histogram, target) {
  const { counts } = histogram;
  const meanR = new Float64Array(32768);
  const meanG = new Float64Array(32768);
  const meanB = new Float64Array(32768);
  const used = [];
  for (let bin = 0; bin < 32768; bin++) {
    const count = counts[bin];
    if (!count) continue;
    meanR[bin] = histogram.sumR[bin] / count;
    meanG[bin] = histogram.sumG[bin] / count;
    meanB[bin] = histogram.sumB[bin] / count;
    used.push(bin);
  }
  if (!used.length) return { rgb: new Uint8Array(3), count: 1 };
  const channels = [meanR, meanG, meanB];
  const order = Int32Array.from(used);

  const measure = (start, end) => {
    let weight = 0;
    const sums = [0, 0, 0];
    const squares = [0, 0, 0];
    for (let k = start; k < end; k++) {
      const bin = order[k];
      const count = counts[bin];
      weight += count;
      for (let c = 0; c < 3; c++) {
        const value = channels[c][bin];
        sums[c] += count * value;
        squares[c] += count * value * value;
      }
    }
    let sse = 0;
    let axis = 0;
    let widest = -1;
    for (let c = 0; c < 3; c++) {
      const spread = squares[c] - (sums[c] * sums[c]) / weight;
      sse += spread;
      if (spread > widest) {
        widest = spread;
        axis = c;
      }
    }
    return { start, end, sse, axis };
  };

  const split = box => {
    const values = channels[box.axis];
    order.subarray(box.start, box.end).sort((a, b) => values[a] - values[b]);
    let totalW = 0;
    let totalS = 0;
    let totalQ = 0;
    for (let k = box.start; k < box.end; k++) {
      const bin = order[k];
      const count = counts[bin];
      totalW += count;
      totalS += count * values[bin];
      totalQ += count * values[bin] * values[bin];
    }
    let leftW = 0;
    let leftS = 0;
    let leftQ = 0;
    let bestCost = Infinity;
    let bestAt = box.start + 1;
    for (let k = box.start; k < box.end - 1; k++) {
      const bin = order[k];
      const count = counts[bin];
      leftW += count;
      leftS += count * values[bin];
      leftQ += count * values[bin] * values[bin];
      const rightW = totalW - leftW;
      const rightS = totalS - leftS;
      const cost = leftQ - (leftS * leftS) / leftW + (totalQ - leftQ) - (rightS * rightS) / rightW;
      if (cost < bestCost) {
        bestCost = cost;
        bestAt = k + 1;
      }
    }
    return [measure(box.start, bestAt), measure(bestAt, box.end)];
  };

  const boxes = [measure(0, order.length)];
  while (boxes.length < target) {
    let pick = -1;
    let most = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].end - boxes[i].start >= 2 && boxes[i].sse > most) {
        most = boxes[i].sse;
        pick = i;
      }
    }
    if (pick < 0) break;
    const [low, high] = split(boxes[pick]);
    boxes[pick] = low;
    boxes.push(high);
  }

  const size = boxes.length;
  const centers = new Float64Array(size * 3);
  boxes.forEach((box, i) => {
    let weight = 0;
    for (let k = box.start; k < box.end; k++) {
      const bin = order[k];
      const count = counts[bin];
      weight += count;
      centers[i * 3] += count * meanR[bin];
      centers[i * 3 + 1] += count * meanG[bin];
      centers[i * 3 + 2] += count * meanB[bin];
    }
    centers[i * 3] /= weight;
    centers[i * 3 + 1] /= weight;
    centers[i * 3 + 2] /= weight;
  });

  for (let pass = 0; pass < 2; pass++) {
    const accum = new Float64Array(size * 3);
    const weights = new Float64Array(size);
    for (const bin of used) {
      const r = meanR[bin];
      const g = meanG[bin];
      const b = meanB[bin];
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < size; i++) {
        const dr = centers[i * 3] - r;
        const dg = centers[i * 3 + 1] - g;
        const db = centers[i * 3 + 2] - b;
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      const count = counts[bin];
      weights[best] += count;
      accum[best * 3] += count * r;
      accum[best * 3 + 1] += count * g;
      accum[best * 3 + 2] += count * b;
    }
    for (let i = 0; i < size; i++) {
      if (!weights[i]) continue;
      centers[i * 3] = accum[i * 3] / weights[i];
      centers[i * 3 + 1] = accum[i * 3 + 1] / weights[i];
      centers[i * 3 + 2] = accum[i * 3 + 2] / weights[i];
    }
  }

  const rgb = new Uint8Array(size * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = Math.round(centers[i]);
  return { rgb, count: size };
}

function makePalette(regions, colors, cutAlpha, reserveDiff) {
  const unique = scanUnique(regions, colors - (cutAlpha ? 1 : 0), cutAlpha);
  if (unique) {
    const count = Math.max(1, unique.length);
    const rgb = new Uint8Array(count * 3);
    unique.forEach((key, i) => {
      rgb[i * 3] = key >> 16;
      rgb[i * 3 + 1] = (key >> 8) & 255;
      rgb[i * 3 + 2] = key & 255;
    });
    const spare = cutAlpha || (reserveDiff && count < colors);
    return { rgb, count, exact: true, transparentIndex: spare ? count : -1 };
  }
  const reserve = cutAlpha || reserveDiff;
  const quantized = quantizeHistogram(buildHistogram(regions, cutAlpha), reserve ? colors - 1 : colors);
  return { ...quantized, exact: false, transparentIndex: reserve ? quantized.count : -1 };
}

function tableBits(entries) {
  let bits = 1;
  while ((1 << bits) < entries) bits++;
  return bits;
}

function writePalette(sink, palette, bits) {
  const table = new Uint8Array((1 << bits) * 3);
  table.set(palette.rgb.subarray(0, palette.count * 3));
  sink.write(table);
}

class Mapper {
  constructor() {
    this.cache = new Int16Array(1 << 24);
    this.rgb = null;
    this.count = 0;
  }

  setPalette(palette) {
    this.rgb = palette.rgb;
    this.count = palette.count;
    this.cache.fill(-1);
  }

  nearest(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    const hit = this.cache[key];
    if (hit >= 0) return hit;
    const rgb = this.rgb;
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0, j = 0; i < this.count; i++, j += 3) {
      const dr = rgb[j] - r;
      const dg = rgb[j + 1] - g;
      const db = rgb[j + 2] - b;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
        if (distance === 0) break;
      }
    }
    this.cache[key] = best;
    return best;
  }

  distance(index, r, g, b) {
    const dr = this.rgb[index * 3] - r;
    const dg = this.rgb[index * 3 + 1] - g;
    const db = this.rgb[index * 3 + 2] - b;
    return dr * dr + dg * dg + db * db;
  }
}

function bayerThresholds() {
  let matrix = [0];
  let size = 1;
  while (size < 8) {
    const next = size * 2;
    const grown = new Array(next * next);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const value = matrix[y * size + x] * 4;
        grown[y * next + x] = value;
        grown[y * next + x + size] = value + 2;
        grown[(y + size) * next + x] = value + 3;
        grown[(y + size) * next + x + size] = value + 1;
      }
    }
    matrix = grown;
    size = next;
  }
  return Float32Array.from(matrix, value => (value + 0.5) / 64 - 0.5);
}

const BAYER = bayerThresholds();

function clamp255(value) {
  return value < 0 ? 0 : value > 255 ? 255 : (value + 0.5) | 0;
}

function mapFloyd(frame, rect, mapper, transparentIndex, cutAlpha, previous, out) {
  const { data, width } = frame;
  const { x0, y0, x1, y1 } = rect;
  const rectWidth = x1 - x0;
  const palette = mapper.rgb;
  const span = rectWidth + 2;
  let errorsNow = new Float32Array(span * 3);
  let errorsNext = new Float32Array(span * 3);
  for (let y = y0; y < y1; y++) {
    const forward = ((y - y0) & 1) === 0;
    const step = forward ? 1 : -1;
    for (let k = 0, x = forward ? x0 : x1 - 1; k < rectWidth; k++, x += step) {
      const p = (y * width + x) * 4;
      const o = (y - y0) * rectWidth + (x - x0);
      if (cutAlpha && data[p + 3] < 128) {
        out[o] = transparentIndex;
        continue;
      }
      const e = (x - x0 + 1) * 3;
      const r = clamp255(data[p] + errorsNow[e]);
      const g = clamp255(data[p + 1] + errorsNow[e + 1]);
      const b = clamp255(data[p + 2] + errorsNow[e + 2]);
      let index = mapper.nearest(r, g, b);
      if (
        previous &&
        previous.data[p] === data[p] &&
        previous.data[p + 1] === data[p + 1] &&
        previous.data[p + 2] === data[p + 2] &&
        previous.data[p + 3] === data[p + 3]
      ) {
        index = previous.indices[y * width + x];
      }
      out[o] = index;
      const dr = (r - palette[index * 3]) * 0.7;
      const dg = (g - palette[index * 3 + 1]) * 0.7;
      const db = (b - palette[index * 3 + 2]) * 0.7;
      const ahead = e + step * 3;
      const behind = e - step * 3;
      errorsNow[ahead] += dr * 0.4375;
      errorsNow[ahead + 1] += dg * 0.4375;
      errorsNow[ahead + 2] += db * 0.4375;
      errorsNext[behind] += dr * 0.1875;
      errorsNext[behind + 1] += dg * 0.1875;
      errorsNext[behind + 2] += db * 0.1875;
      errorsNext[e] += dr * 0.3125;
      errorsNext[e + 1] += dg * 0.3125;
      errorsNext[e + 2] += db * 0.3125;
      errorsNext[ahead] += dr * 0.0625;
      errorsNext[ahead + 1] += dg * 0.0625;
      errorsNext[ahead + 2] += db * 0.0625;
    }
    const swap = errorsNow;
    errorsNow = errorsNext;
    errorsNext = swap;
    errorsNext.fill(0);
  }
}

function mapPixels(frame, rect, mapper, mode, transparentIndex, cutAlpha, previous, out) {
  if (mode === 'floyd') {
    mapFloyd(frame, rect, mapper, transparentIndex, cutAlpha, previous, out);
    return;
  }
  const { data, width } = frame;
  const { x0, y0, x1, y1 } = rect;
  const rectWidth = x1 - x0;
  const amplitude = mode === 'bayer' ? (255 / Math.cbrt(mapper.count)) * 0.55 : 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * width + x) * 4;
      const o = (y - y0) * rectWidth + (x - x0);
      if (cutAlpha && data[p + 3] < 128) {
        out[o] = transparentIndex;
        continue;
      }
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      let index = mapper.nearest(r, g, b);
      if (amplitude && mapper.distance(index, r, g, b) > SIMILAR_DISTANCE) {
        const shift = BAYER[((y & 7) << 3) | (x & 7)] * amplitude;
        index = mapper.nearest(clamp255(r + shift), clamp255(g + shift), clamp255(b + shift));
      }
      out[o] = index;
    }
  }
}

function writeLzw(sink, pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const keys = new Int32Array(HASH_SIZE).fill(-1);
  const codes = new Int16Array(HASH_SIZE);
  const packed = new ByteSink(Math.max(64, pixels.length >> 1));
  let buffer = 0;
  let held = 0;
  let size = minCodeSize + 1;
  let next = endCode + 1;

  const emit = code => {
    buffer |= code << held;
    held += size;
    while (held >= 8) {
      packed.byte(buffer & 255);
      buffer >>>= 8;
      held -= 8;
    }
  };

  emit(clearCode);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const value = pixels[i];
    const key = (prefix << 8) | value;
    let slot = Math.imul(key, 2654435761) >>> (32 - HASH_BITS);
    while (keys[slot] !== -1 && keys[slot] !== key) slot = (slot + 1) & (HASH_SIZE - 1);
    if (keys[slot] === key) {
      prefix = codes[slot];
      continue;
    }
    emit(prefix);
    if (next < 4095) {
      keys[slot] = key;
      codes[slot] = next++;
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(clearCode);
      keys.fill(-1);
      size = minCodeSize + 1;
      next = endCode + 1;
    }
    prefix = value;
  }
  emit(prefix);
  if (next >= (1 << size) && size < 12) size++;
  emit(endCode);
  if (held > 0) packed.byte(buffer & 255);

  sink.byte(minCodeSize);
  for (let at = 0; at < packed.length; at += 255) {
    const length = Math.min(255, packed.length - at);
    sink.byte(length);
    sink.write(packed.bytes.subarray(at, at + length));
  }
  sink.byte(0);
}

function writeGifFrame(sink, frame) {
  const { rect, pixels, delay, disposal, transparentIndex, palette, codeBits } = frame;
  sink.byte(0x21);
  sink.byte(0xf9);
  sink.byte(4);
  sink.byte((disposal << 2) | (transparentIndex >= 0 ? 1 : 0));
  sink.u16le(delay);
  sink.byte(transparentIndex >= 0 ? transparentIndex : 0);
  sink.byte(0);
  const bits = palette ? tableBits(palette.count + (transparentIndex >= 0 ? 1 : 0)) : 0;
  sink.byte(0x2c);
  sink.u16le(rect.x0);
  sink.u16le(rect.y0);
  sink.u16le(rect.x1 - rect.x0);
  sink.u16le(rect.y1 - rect.y0);
  sink.byte(palette ? 0x80 | (bits - 1) : 0);
  if (palette) writePalette(sink, palette, bits);
  writeLzw(sink, pixels, Math.max(2, palette ? bits : codeBits));
}

function cropIndices(indices, previous, width, rect, transparentIndex) {
  const rectWidth = rect.x1 - rect.x0;
  const pixels = new Uint8Array(rectWidth * (rect.y1 - rect.y0));
  const useSlot = transparentIndex >= 0;
  let o = 0;
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++, o++) {
      const at = y * width + x;
      pixels[o] = useSlot && indices[at] === previous[at] ? transparentIndex : indices[at];
    }
  }
  return pixels;
}

export async function encodeGif(frames, opts = {}, onProgress) {
  const { width, height } = checkFrames(frames);
  if (width > 65535 || height > 65535) throw new RangeError('GIF dimensions are limited to 65535');
  const colors = clampInt(opts.colors ?? 256, 2, 256);
  const delay = clampInt(opts.delayCs ?? 4, 0, 65535);
  const loop = clampInt(opts.loop ?? 0, 0, 65535);
  const dither = opts.dither ?? 'none';
  if (!DITHER_MODES.includes(dither)) throw new RangeError(`Unknown dither mode: ${dither}`);
  const cutAlpha = Boolean(opts.transparent);
  const local = opts.palette === 'local';
  const report = fraction => {
    if (onProgress) onProgress(Math.min(1, fraction));
  };

  const full = { x0: 0, y0: 0, x1: width, y1: height };
  const pixel = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const disposal = cutAlpha ? 2 : 1;
  const mapper = new Mapper();
  const sink = new ByteSink(1 << 16);
  report(0);

  let shared = null;
  if (!local) {
    const regions = frames.map(frame => ({ data: frame.data, width, ...full }));
    shared = makePalette(regions, colors, cutAlpha, true);
    mapper.setPalette(shared);
  }
  await yieldToBrowser();
  report(0.1);

  const sharedBits = shared ? tableBits(shared.count + (shared.transparentIndex >= 0 ? 1 : 0)) : 0;
  sink.ascii('GIF89a');
  sink.u16le(width);
  sink.u16le(height);
  sink.byte(shared ? 0x80 | 0x70 | (sharedBits - 1) : 0x70);
  sink.byte(0);
  sink.byte(0);
  if (shared) writePalette(sink, shared, sharedBits);
  sink.byte(0x21);
  sink.byte(0xff);
  sink.byte(11);
  sink.ascii('NETSCAPE2.0');
  sink.byte(3);
  sink.byte(1);
  sink.u16le(loop);
  sink.byte(0);

  let current = new Uint8Array(width * height);
  let previousIndices = null;
  let previousFrame = null;
  let previousRaw = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    let rect = full;
    let pixels;
    let palette = null;
    let transparentIndex;
    let codeBits = sharedBits;

    if (shared) {
      transparentIndex = shared.transparentIndex;
      const mode = shared.exact ? 'none' : dither;
      const previous = previousIndices ? { data: previousFrame.data, indices: previousIndices } : null;
      mapPixels(frame, full, mapper, mode, transparentIndex, cutAlpha, previous, current);
      if (previousIndices && !cutAlpha) {
        rect = diffRect(current, previousIndices, width, height) ?? pixel;
        pixels = cropIndices(current, previousIndices, width, rect, transparentIndex);
      } else {
        pixels = current;
      }
    } else {
      const raw = asUint32(frame.data);
      if (previousRaw && !cutAlpha) rect = diffRect(raw, previousRaw, width, height) ?? pixel;
      palette = makePalette([{ data: frame.data, width, ...rect }], colors, cutAlpha, false);
      transparentIndex = palette.transparentIndex;
      mapper.setPalette(palette);
      pixels = new Uint8Array((rect.x1 - rect.x0) * (rect.y1 - rect.y0));
      mapPixels(frame, rect, mapper, palette.exact ? 'none' : dither, transparentIndex, cutAlpha, null, pixels);
      previousRaw = raw;
    }

    writeGifFrame(sink, { rect, pixels, delay, disposal, transparentIndex, palette, codeBits });

    if (shared) {
      const spare = previousIndices ?? new Uint8Array(width * height);
      previousIndices = current;
      current = spare;
    }
    previousFrame = frame;
    report(0.1 + (0.9 * (i + 1)) / frames.length);
    await yieldToBrowser();
  }

  sink.byte(0x3b);
  return sink.result();
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function deflateStored(bytes) {
  const blocks = Math.max(1, Math.ceil(bytes.length / 65535));
  const sink = new ByteSink(bytes.length + blocks * 5 + 6);
  sink.byte(0x78);
  sink.byte(0x01);
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const length = Math.min(65535, bytes.length - start);
    sink.byte(b === blocks - 1 ? 1 : 0);
    sink.u16le(length);
    sink.u16le(~length & 0xffff);
    sink.write(bytes.subarray(start, start + length));
  }
  sink.u32be(adler32(bytes));
  return sink.result();
}

async function deflate(bytes) {
  if (typeof CompressionStream !== 'function') return deflateStored(bytes);
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const collected = new Response(stream.readable).arrayBuffer();
  await Promise.all([writer.write(bytes).then(() => writer.close()), collected]);
  return new Uint8Array(await collected);
}

function pngChunk(type, body) {
  const sink = new ByteSink(body.length + 12);
  sink.u32be(body.length);
  sink.ascii(type);
  sink.write(body);
  sink.u32be(crc32(sink.bytes.subarray(4, sink.length)));
  return sink.result();
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function filterImage(pixels, width, height) {
  const rowBytes = width * 4;
  const out = new Uint8Array(height * (rowBytes + 1));
  const zeros = new Uint8Array(rowBytes);
  const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(rowBytes));
  const costs = new Float64Array(5);
  const filtered = new Uint8Array(5);
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * rowBytes, (y + 1) * rowBytes);
    const above = y > 0 ? pixels.subarray((y - 1) * rowBytes, y * rowBytes) : zeros;
    costs.fill(0);
    for (let i = 0; i < rowBytes; i++) {
      const value = row[i];
      const a = i >= 4 ? row[i - 4] : 0;
      const b = above[i];
      const c = i >= 4 ? above[i - 4] : 0;
      filtered[0] = value;
      filtered[1] = value - a;
      filtered[2] = value - b;
      filtered[3] = value - ((a + b) >> 1);
      filtered[4] = value - paeth(a, b, c);
      for (let f = 0; f < 5; f++) {
        const byte = filtered[f];
        candidates[f][i] = byte;
        costs[f] += byte < 128 ? byte : 256 - byte;
      }
    }
    let best = 0;
    for (let f = 1; f < 5; f++) if (costs[f] < costs[best]) best = f;
    const at = y * (rowBytes + 1);
    out[at] = best;
    out.set(candidates[best], at + 1);
  }
  return out;
}

function cropRgba(data, width, rect) {
  const rectWidth = rect.x1 - rect.x0;
  const out = new Uint8Array(rectWidth * (rect.y1 - rect.y0) * 4);
  let o = 0;
  for (let y = rect.y0; y < rect.y1; y++) {
    const start = (y * width + rect.x0) * 4;
    out.set(data.subarray(start, start + rectWidth * 4), o);
    o += rectWidth * 4;
  }
  return out;
}

export async function encodeApng(frames, opts = {}, onProgress) {
  const { width, height } = checkFrames(frames);
  const delayMs = clampInt(opts.delayMs ?? 40, 0, 65535);
  const loop = clampInt(opts.loop ?? 0, 0, 0x7fffffff);
  const report = fraction => {
    if (onProgress) onProgress(Math.min(1, fraction));
  };
  const full = { x0: 0, y0: 0, x1: width, y1: height };
  const pixel = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const parts = [];
  report(0);

  const header = new ByteSink(13);
  header.u32be(width);
  header.u32be(height);
  for (const value of [8, 6, 0, 0, 0]) header.byte(value);
  const control = new ByteSink(8);
  control.u32be(frames.length);
  control.u32be(loop);
  parts.push(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10));
  parts.push(pngChunk('IHDR', header.result()));
  parts.push(pngChunk('acTL', control.result()));

  let sequence = 0;
  let previousRaw = null;
  for (let i = 0; i < frames.length; i++) {
    const { data } = frames[i];
    const raw = asUint32(data);
    const rect = previousRaw ? diffRect(raw, previousRaw, width, height) ?? pixel : full;
    const rectWidth = rect.x1 - rect.x0;
    const rectHeight = rect.y1 - rect.y0;
    const pixels = rect === full ? new Uint8Array(data.buffer, data.byteOffset, data.length) : cropRgba(data, width, rect);

    const frameControl = new ByteSink(26);
    frameControl.u32be(sequence++);
    frameControl.u32be(rectWidth);
    frameControl.u32be(rectHeight);
    frameControl.u32be(rect.x0);
    frameControl.u32be(rect.y0);
    frameControl.byte(delayMs >> 8);
    frameControl.byte(delayMs & 255);
    frameControl.byte(0x03);
    frameControl.byte(0xe8);
    frameControl.byte(0);
    frameControl.byte(0);
    parts.push(pngChunk('fcTL', frameControl.result()));

    const compressed = await deflate(filterImage(pixels, rectWidth, rectHeight));
    if (i === 0) {
      parts.push(pngChunk('IDAT', compressed));
    } else {
      const body = new ByteSink(compressed.length + 4);
      body.u32be(sequence++);
      body.write(compressed);
      parts.push(pngChunk('fdAT', body.result()));
    }
    previousRaw = raw;
    report((i + 1) / frames.length);
    await yieldToBrowser();
  }
  parts.push(pngChunk('IEND', new Uint8Array(0)));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function canEncodeWebp() {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

async function canvasToWebpBytes(canvas, quality) {
  let blob;
  if (typeof canvas.convertToBlob === 'function') {
    blob = await canvas.convertToBlob({ type: 'image/webp', quality });
  } else {
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
  }
  if (!blob || blob.type !== 'image/webp') return null;
  return new Uint8Array(await blob.arrayBuffer());
}

function fourCC(bytes, at) {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function parseWebp(bytes) {
  if (bytes.length < 20 || fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = { alpha: null, image: null, imageType: null };
  let at = 12;
  while (at + 8 <= bytes.length) {
    const type = fourCC(bytes, at);
    const size = view.getUint32(at + 4, true);
    const body = bytes.subarray(at + 8, at + 8 + size);
    if (type === 'ALPH') found.alpha = body;
    if (type === 'VP8 ' || type === 'VP8L') {
      found.image = body;
      found.imageType = type;
    }
    at += 8 + size + (size & 1);
  }
  return found.image ? found : null;
}

function riffChunk(sink, type, body) {
  sink.ascii(type);
  sink.u32le(body.length);
  sink.write(body);
  if (body.length & 1) sink.byte(0);
}

export async function encodeWebp(getFrameCanvas, count, opts = {}, onProgress) {
  if (!canEncodeWebp() && typeof OffscreenCanvas === 'undefined') return null;
  const delayMs = clampInt(opts.delayMs ?? 40, 0, 0xffffff);
  const loop = clampInt(opts.loop ?? 0, 0, 65535);
  const quality = Math.min(1, Math.max(0, opts.quality ?? 0.9));
  const [bgR, bgG, bgB, bgA] = opts.background ?? [0, 0, 0, 0];
  const report = fraction => {
    if (onProgress) onProgress(Math.min(1, fraction));
  };
  report(0);

  const encoded = [];
  let width = 0;
  let height = 0;
  let hasAlpha = false;
  for (let i = 0; i < count; i++) {
    const canvas = await getFrameCanvas(i);
    if (i === 0) {
      width = canvas.width;
      height = canvas.height;
    } else if (canvas.width !== width || canvas.height !== height) {
      throw new Error(`Frame ${i} does not match the size of frame 0`);
    }
    const bytes = await canvasToWebpBytes(canvas, quality);
    if (!bytes) return null;
    const parsed = parseWebp(bytes);
    if (!parsed) return null;
    if (parsed.alpha || parsed.imageType === 'VP8L') hasAlpha = true;
    encoded.push(parsed);
    report(((i + 1) / count) * 0.9);
    await yieldToBrowser();
  }
  if (!encoded.length) return null;

  const body = new ByteSink(1 << 16);
  body.ascii('WEBP');

  const extended = new ByteSink(10);
  extended.byte(0x02 | (hasAlpha ? 0x10 : 0));
  extended.byte(0);
  extended.byte(0);
  extended.byte(0);
  extended.u24le(width - 1);
  extended.u24le(height - 1);
  riffChunk(body, 'VP8X', extended.result());

  const animation = new ByteSink(6);
  animation.byte(bgB);
  animation.byte(bgG);
  animation.byte(bgR);
  animation.byte(bgA);
  animation.u16le(loop);
  riffChunk(body, 'ANIM', animation.result());

  for (const frame of encoded) {
    const payload = new ByteSink(frame.image.length + 64);
    payload.u24le(0);
    payload.u24le(0);
    payload.u24le(width - 1);
    payload.u24le(height - 1);
    payload.u24le(delayMs);
    payload.byte(0x02);
    if (frame.alpha) riffChunk(payload, 'ALPH', frame.alpha);
    riffChunk(payload, frame.imageType, frame.image);
    riffChunk(body, 'ANMF', payload.result());
  }

  const out = new ByteSink(body.length + 8);
  out.ascii('RIFF');
  out.u32le(body.length);
  out.write(body.bytes.subarray(0, body.length));
  report(1);
  return out.result();
}

const WEBM_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

export function webmMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return WEBM_TYPES.find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}

export async function recordWebm(canvas, drawFrame, count, fps, onProgress) {
  const mimeType = webmMimeType();
  if (!mimeType || typeof canvas.captureStream !== 'function') return null;
  let stream = canvas.captureStream(0);
  let track = stream.getVideoTracks()[0];
  if (!track || typeof track.requestFrame !== 'function') {
    stream = canvas.captureStream(fps);
    track = null;
  }
  const frameMs = 1000 / fps;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
  const chunks = [];
  recorder.ondataavailable = event => {
    if (event.data && event.data.size) chunks.push(event.data);
  };
  const finished = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = event => reject(event.error ?? new Error('MediaRecorder failed'));
  });

  if (onProgress) onProgress(0);
  recorder.start();
  try {
    for (let i = 0; i < count; i++) {
      await drawFrame(i);
      if (track) track.requestFrame();
      await wait(frameMs);
      if (onProgress) onProgress((i + 1) / count);
    }
    await wait(frameMs);
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    for (const streamTrack of stream.getTracks()) streamTrack.stop();
  }
  await finished;
  return new Blob(chunks, { type: recorder.mimeType || mimeType });
}

export function downloadBytes(bytes, filename, mime) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}
