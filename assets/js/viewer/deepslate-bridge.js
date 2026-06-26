import {
  Structure,
  StructureRenderer,
  TextureAtlas,
  BlockDefinition,
  BlockModel,
} from '../lib/deepslate.esm.js';
import { mat4, vec3 } from '../lib/gl-matrix.esm.js';

// Singleton resources cache — loaded once per page session
let cachedResources = null;
let resourceLoadPromise = null;

async function loadResources() {
  if (cachedResources) return cachedResources;
  if (resourceLoadPromise) return resourceLoadPromise;

  resourceLoadPromise = (async () => {
    const base = '/assets/deepslate-resources/';

    const [blockstatesJson, modelsJson, texturesJson, opaqueJson, atlasResponse] = await Promise.all([
      fetch(`${base}blockstates.json`).then((r) => r.json()),
      fetch(`${base}models.json`).then((r) => r.json()),
      fetch(`${base}textures.json`).then((r) => r.json()),
      fetch(`${base}opaque.json`).then((r) => r.json()),
      fetch(`${base}atlas.png`),
    ]);

    const atlasBlob = await atlasResponse.blob();
    const atlasBitmap = await createImageBitmap(atlasBlob);

    const canvas = document.createElement('canvas');
    canvas.width = atlasBitmap.width;
    canvas.height = atlasBitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(atlasBitmap, 0, 0);

    const atlasSize = Math.max(atlasBitmap.width, atlasBitmap.height);
    const atlasData = ctx.getImageData(0, 0, atlasBitmap.width, atlasBitmap.height);

    const idMap = {};
    for (const [id, coords] of Object.entries(texturesJson)) {
      const [u, v, du, dv] = coords;
      const dv2 = du !== dv && id.startsWith('block/') ? du : dv;
      idMap[`minecraft:${id}`] = [u / atlasSize, v / atlasSize, (u + du) / atlasSize, (v + dv2) / atlasSize];
    }

    const textureAtlas = new TextureAtlas(atlasData, idMap);

    const blockDefinitions = {};
    for (const [id, data] of Object.entries(blockstatesJson)) {
      blockDefinitions[`minecraft:${id}`] = BlockDefinition.fromJson(data);
    }

    const blockModels = {};
    for (const [id, data] of Object.entries(modelsJson)) {
      blockModels[`minecraft:${id}`] = BlockModel.fromJson(data);
    }
    for (const m of Object.values(blockModels)) {
      m.flatten({ getBlockModel: (id) => blockModels[id.toString()] ?? null });
    }

    const opaqueSet = new Set(opaqueJson);

    const resources = {
      getBlockDefinition(id) {
        return blockDefinitions[id.toString()] ?? null;
      },
      getBlockModel(id) {
        return blockModels[id.toString()] ?? null;
      },
      getTextureUV(id) {
        return textureAtlas.getTextureUV(id);
      },
      getTextureAtlas() {
        return textureAtlas.getTextureAtlas();
      },
      getBlockFlags(id) {
        const key = id.toString();
        return {
          opaque: opaqueSet.has(key),
          self_culling: opaqueSet.has(key),
          semi_transparent: false,
        };
      },
      getBlockProperties() {
        return null;
      },
      getDefaultBlockProperties() {
        return null;
      },
    };

    cachedResources = resources;
    return resources;
  })();

  return resourceLoadPromise;
}

// Build a Structure from the grid. If floorEnabled, plant a grass_block plane at y=0
// with padding around the structure footprint, and shift the real blocks up by 1.
function buildStructure(grid, yLimit, floorEnabled) {
  // Floor padding extends the grass plane slightly beyond the build footprint.
  // Capped at 6 so large structures don't quadruple the floor block count.
  const pad = floorEnabled ? Math.min(6, Math.max(2, Math.ceil(Math.max(grid.width, grid.depth) / 16))) : 0;
  const sizeX = grid.width + pad * 2;
  const sizeY = Math.min(grid.height, yLimit + 1) + (floorEnabled ? 1 : 0);
  const sizeZ = grid.depth + pad * 2;
  const yOffset = floorEnabled ? 1 : 0;

  const structure = new Structure([sizeX, sizeY, sizeZ]);

  if (floorEnabled) {
    for (let fx = 0; fx < sizeX; fx++) {
      for (let fz = 0; fz < sizeZ; fz++) {
        structure.addBlock([fx, 0, fz], 'minecraft:grass_block', { snowy: 'false' });
      }
    }
  }

  for (const [x, y, z, state] of grid.entries()) {
    if (y > yLimit) continue;
    const bracketIdx = state.indexOf('[');
    if (bracketIdx === -1) {
      structure.addBlock([x + pad, y + yOffset, z + pad], state);
    } else {
      const name = state.slice(0, bracketIdx);
      const propStr = state.slice(bracketIdx + 1, state.length - 1);
      const props = {};
      for (const pair of propStr.split(',')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx !== -1) {
          props[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
        }
      }
      structure.addBlock([x + pad, y + yOffset, z + pad], name, props);
    }
  }
  return structure;
}

export class DeepslateRenderer {
  constructor(gl, resources, canvas) {
    this.gl = gl;
    this.canvas = canvas;
    this.grid = null;
    this.yLimit = Infinity;
    this.floorEnabled = false;
    this.clearColor = [0.53, 0.81, 0.92]; // day sky default
    this.pitch = 0.6;
    this.yaw = 0.5;
    this.cameraPos = vec3.fromValues(0, 0, 0);
    this.animFrameId = null;
    this.dirty = true;

    this.leftDragPos = null;
    this.pressedKeys = new Set();
    this.keyInterval = null;

    const emptyStructure = new Structure([1, 1, 1]);
    this.renderer = new StructureRenderer(gl, emptyStructure, resources, { chunkSize: 8 });

    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundBlur = () => this.pressedKeys.clear();

    canvas.addEventListener('mousedown', this.boundMouseDown);
    canvas.addEventListener('mousemove', this.boundMouseMove);
    canvas.addEventListener('mouseup', this.boundMouseUp);
    canvas.addEventListener('mouseleave', this.boundMouseUp);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundBlur);

    this.keyInterval = setInterval(() => {
      if (this.pressedKeys.size === 0) return;
      const keyMoves = {
        KeyW: [0, 0, 0.2],
        KeyS: [0, 0, -0.2],
        KeyA: [0.2, 0, 0],
        KeyD: [-0.2, 0, 0],
        ShiftLeft: [0, 0.2, 0],
        Space: [0, -0.2, 0],
      };
      let dx = 0, dy = 0, dz = 0;
      for (const key of this.pressedKeys) {
        const km = keyMoves[key];
        if (km) { dx += km[0]; dy += km[1]; dz += km[2]; }
      }
      this.move3d([dx, dy, dz], false);
      this.requestRender();
    }, 1000 / 60);

    this.startRenderLoop();
  }

  move3d(dir, relativeVertical = true) {
    const offset = vec3.fromValues(dir[0], dir[1], dir[2]);
    if (relativeVertical) {
      vec3.rotateX(offset, offset, vec3.fromValues(0, 0, 0), -this.pitch);
    }
    vec3.rotateY(offset, offset, vec3.fromValues(0, 0, 0), -this.yaw);
    vec3.add(this.cameraPos, this.cameraPos, offset);
  }

  onMouseDown(e) {
    if (e.button === 0) {
      e.preventDefault();
      this.leftDragPos = [e.clientX, e.clientY];
    }
  }

  onMouseMove(e) {
    if (this.leftDragPos) {
      const dx = e.clientX - this.leftDragPos[0];
      const dy = e.clientY - this.leftDragPos[1];
      this.yaw += dx / 200;
      this.pitch += dy / 200;
      this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
      this.leftDragPos = [e.clientX, e.clientY];
      this.requestRender();
    }
  }

  onMouseUp(e) {
    if (e.button === 0 || e.type === 'mouseleave') {
      this.leftDragPos = null;
    }
  }

  onWheel(e) {
    e.preventDefault();
    this.move3d([0, 0, -e.deltaY / 200], false);
    this.requestRender();
  }

  onKeyDown(e) {
    const keys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'Space'];
    if (keys.includes(e.code)) {
      e.preventDefault();
      this.pressedKeys.add(e.code);
    }
  }

  onKeyUp(e) {
    this.pressedKeys.delete(e.code);
  }

  requestRender() {
    this.dirty = true;
  }

  startRenderLoop() {
    const loop = () => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  render() {
    this.yaw = this.yaw % (Math.PI * 2);
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));

    const [r, g, b] = this.clearColor;
    this.gl.clearColor(r, g, b, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    const view = mat4.create();
    mat4.rotateX(view, view, this.pitch);
    mat4.rotateY(view, view, this.yaw);
    mat4.translate(view, view, this.cameraPos);

    this.renderer.drawStructure(view);
    this.renderer.drawGrid(view);
  }

  setClearColor(r, g, b) {
    this.clearColor = [r, g, b];
    this.requestRender();
  }

  setFloorEnabled(enabled) {
    if (this.floorEnabled === enabled) return;
    this.floorEnabled = enabled;

    // Re-center the camera so the structure stays framed when floor padding shifts it
    if (this.grid) {
      this.pitch = 0.6;
      this.yaw = 0.5;
      const cx = -this.grid.width / 2;
      const cy = -this.grid.height / 2;
      const cz = -Math.max(this.grid.width, this.grid.depth) * 1.2;
      vec3.set(this.cameraPos, cx, cy, cz);
    }

    this.rebuildStructure();
  }

  setGrid(grid) {
    this.grid = grid;
    this.yLimit = grid.height - 1;

    this.pitch = 0.6;
    this.yaw = 0.5;
    const cx = -grid.width / 2;
    const cy = -grid.height / 2;
    const cz = -Math.max(grid.width, grid.depth) * 1.2;
    vec3.set(this.cameraPos, cx, cy, cz);

    this.rebuildStructure();
  }

  setYLimit(y) {
    this.yLimit = y;
    this.rebuildStructure();
  }

  rebuildStructure() {
    if (!this.grid) return;
    const structure = buildStructure(this.grid, this.yLimit, this.floorEnabled);
    this.renderer.setStructure(structure);
    this.renderer.updateStructureBuffers();
    this.requestRender();
  }

  notifyResized() {
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.dirty = true;
  }

  dispose() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    if (this.keyInterval !== null) clearInterval(this.keyInterval);

    this.canvas.removeEventListener('mousedown', this.boundMouseDown);
    this.canvas.removeEventListener('mousemove', this.boundMouseMove);
    this.canvas.removeEventListener('mouseup', this.boundMouseUp);
    this.canvas.removeEventListener('mouseleave', this.boundMouseUp);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('blur', this.boundBlur);
  }
}

export async function createRenderer(canvas) {
  const resources = await loadResources();
  const gl = canvas.getContext('webgl');
  if (!gl) throw new Error('WebGL not supported');
  return new DeepslateRenderer(gl, resources, canvas);
}
