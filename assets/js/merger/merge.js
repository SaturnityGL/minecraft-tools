import { BlockGrid } from '../viewer/blockgrid.js';

const MAX_VOLUME = 15_000_000;

function rotatedDims(W, D, rot) {
  return (rot === 90 || rot === 270) ? { rW: D, rD: W } : { rW: W, rD: D };
}

export function mergeGrids(sources) {
  const visible = sources.filter((s) => s.visible !== false);
  if (visible.length === 0) return new BlockGrid(1, 1, 1);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const src of visible) {
    const { grid, offsetX = 0, offsetY = 0, offsetZ = 0, rotationY = 0 } = src;
    const { rW, rD } = rotatedDims(grid.width, grid.depth, rotationY);
    if (offsetX < minX) minX = offsetX;
    if (offsetY < minY) minY = offsetY;
    if (offsetZ < minZ) minZ = offsetZ;
    if (offsetX + rW > maxX) maxX = offsetX + rW;
    if (offsetY + grid.height > maxY) maxY = offsetY + grid.height;
    if (offsetZ + rD > maxZ) maxZ = offsetZ + rD;
  }

  const cW = Math.max(1, maxX - minX);
  const cH = Math.max(1, maxY - minY);
  const cD = Math.max(1, maxZ - minZ);

  const volume = cW * cH * cD;
  if (volume > MAX_VOLUME) {
    throw new Error(
      `Combined bounding box is ${cW} x ${cH} x ${cD} = ${volume.toLocaleString()} cells, past the ${MAX_VOLUME.toLocaleString()} cell limit. Reduce offsets or load fewer schematics.`
    );
  }

  const dest = new BlockGrid(cW, cH, cD);

  for (const src of visible) {
    const { grid, offsetX = 0, offsetY = 0, offsetZ = 0, rotationY = 0 } = src;
    const { width: W, height: H, depth: D, data, palette } = grid;

    const remap = new Uint16Array(palette.length);
    for (let p = 1; p < palette.length; p++) {
      remap[p] = dest._internPalette(palette[p]);
    }

    const baseX = offsetX - minX;
    const baseY = offsetY - minY;
    const baseZ = offsetZ - minZ;

    for (let y = 0; y < H; y++) {
      const destY = baseY + y;
      if (destY < 0 || destY >= cH) continue;
      const yBase = y * D * W;
      for (let z = 0; z < D; z++) {
        const rowBase = yBase + z * W;
        for (let x = 0; x < W; x++) {
          const srcIdx = data[rowBase + x];
          if (srcIdx === 0) continue;

          let wx, wz;
          switch (rotationY) {
            case 90:  wx = z;           wz = W - 1 - x; break;
            case 180: wx = W - 1 - x;   wz = D - 1 - z; break;
            case 270: wx = D - 1 - z;   wz = x;         break;
            default:  wx = x;           wz = z;         break;
          }

          const destX = baseX + wx;
          const destZ = baseZ + wz;
          if (destX < 0 || destX >= cW || destZ < 0 || destZ >= cD) continue;

          const flat = (destY * cD + destZ) * cW + destX;
          const prev = dest.data[flat];
          if (prev === 0) dest.filledCount++;
          dest.data[flat] = remap[srcIdx];
        }
      }
    }
  }

  return dest;
}
