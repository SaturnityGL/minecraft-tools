// Sparse 3D block representation, indexed as Map<"x,y,z", blockStateString>
// blockStateString is the canonical Minecraft form, e.g. "minecraft:stone" or "minecraft:oak_log[axis=y]"

export class BlockGrid {
  constructor(width, height, depth) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.blocks = new Map();
  }

  set(x, y, z, state) {
    if (state === 'minecraft:air' || state === 'air') return;
    this.blocks.set(`${x},${y},${z}`, state);
  }

  get(x, y, z) {
    return this.blocks.get(`${x},${y},${z}`);
  }

  *entries() {
    for (const [key, state] of this.blocks) {
      const parts = key.split(',');
      yield [parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10), state];
    }
  }

  countBlocks() {
    return this.blocks.size;
  }

  uniqueStates() {
    return new Set(this.blocks.values());
  }

  stateCounts() {
    const counts = new Map();
    for (const state of this.blocks.values()) {
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return counts;
  }

  // Merge all block state variants into a single block name entry.
  // "minecraft:iron_bars[north=true,...]" and "minecraft:iron_bars[east=true,...]" both
  // count toward "iron_bars". Strips namespace prefix.
  blockNameCounts() {
    const counts = new Map();
    for (const state of this.blocks.values()) {
      const noNs = state.startsWith('minecraft:') ? state.slice(10) : state;
      const bracket = noNs.indexOf('[');
      const name = bracket === -1 ? noNs : noNs.slice(0, bracket);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }
}
