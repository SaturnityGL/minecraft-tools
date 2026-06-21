// Dense palette-backed 3D block grid.
//
// Storage shape:
//   palette: string[]            // index 0 is reserved for empty/air (palette[0] = '')
//   data:    Uint16Array         // size width*height*depth, indexed YZX flat
//
// Each cell costs exactly 2 bytes regardless of how full the build is. The palette
// holds one entry per unique block state string (e.g. "minecraft:oak_log[axis=y]").
// Supports up to 65,535 unique states; real schematics rarely exceed a few thousand.
//
// Public API matches the previous Map-backed implementation:
//   set(x,y,z,state), get(x,y,z), entries(), countBlocks(),
//   uniqueStates(), stateCounts(), blockNameCounts()
//
// palette + paletteIndex are also exposed for future merge code: combining two grids
// becomes "union the palettes, remap one side's indices, blit the data".

export class BlockGrid {
  constructor(width, height, depth) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.palette = [''];
    this.paletteIndex = new Map();
    this.data = new Uint16Array(width * height * depth);
    this.filledCount = 0;
  }

  _flat(x, y, z) {
    return (y * this.depth + z) * this.width + x;
  }

  _internPalette(state) {
    const existing = this.paletteIndex.get(state);
    if (existing !== undefined) return existing;
    if (this.palette.length >= 65536) {
      throw new Error('This schematic uses more than 65,535 unique block states, past what the viewer can index.');
    }
    const idx = this.palette.length;
    this.palette.push(state);
    this.paletteIndex.set(state, idx);
    return idx;
  }

  set(x, y, z, state) {
    if (state === 'minecraft:air' || state === 'air' || state === '') return;
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) return;
    const flat = this._flat(x, y, z);
    const prev = this.data[flat];
    const next = this._internPalette(state);
    if (prev === next) return;
    if (prev === 0) this.filledCount++;
    this.data[flat] = next;
  }

  get(x, y, z) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) return undefined;
    const p = this.data[this._flat(x, y, z)];
    return p === 0 ? undefined : this.palette[p];
  }

  *entries() {
    const { width, height, depth, data, palette } = this;
    for (let y = 0; y < height; y++) {
      const yBase = y * depth * width;
      for (let z = 0; z < depth; z++) {
        const rowBase = yBase + z * width;
        for (let x = 0; x < width; x++) {
          const p = data[rowBase + x];
          if (p !== 0) yield [x, y, z, palette[p]];
        }
      }
    }
  }

  countBlocks() {
    return this.filledCount;
  }

  // Per-palette-index count, used by stateCounts/blockNameCounts/uniqueStates.
  // Single pass over the data buffer; bounded-size palette accumulator.
  _paletteCounts() {
    const counts = new Uint32Array(this.palette.length);
    const data = this.data;
    for (let i = 0; i < data.length; i++) {
      counts[data[i]]++;
    }
    return counts;
  }

  uniqueStates() {
    const used = new Set();
    const counts = this._paletteCounts();
    for (let p = 1; p < this.palette.length; p++) {
      if (counts[p] > 0) used.add(this.palette[p]);
    }
    return used;
  }

  stateCounts() {
    const counts = this._paletteCounts();
    const out = new Map();
    for (let p = 1; p < this.palette.length; p++) {
      if (counts[p] > 0) out.set(this.palette[p], counts[p]);
    }
    return out;
  }

  // Merge all block state variants into a single block name entry. Strips the
  // "minecraft:" namespace and everything after the first "[" (state properties).
  blockNameCounts() {
    const counts = this._paletteCounts();
    const out = new Map();
    for (let p = 1; p < this.palette.length; p++) {
      const c = counts[p];
      if (c === 0) continue;
      const state = this.palette[p];
      const noNs = state.startsWith('minecraft:') ? state.slice(10) : state;
      const bracket = noNs.indexOf('[');
      const name = bracket === -1 ? noNs : noNs.slice(0, bracket);
      out.set(name, (out.get(name) ?? 0) + c);
    }
    return out;
  }
}
