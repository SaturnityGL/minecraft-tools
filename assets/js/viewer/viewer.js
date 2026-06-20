// BlockForge Schematic Viewer - main entry
// Wires file upload (drag-drop + click) -> format detection -> parser -> 3D renderer.

import { createRenderer } from './deepslate-bridge.js';
import { detectFormat } from './formats/detect.js';
import * as liteParser from './formats/litematic.js';
import * as schemParser from './formats/schem.js';
import * as schematicParser from './formats/schematic.js';
import * as nbtParser from './formats/nbt.js';

const els = {
  dropzoneWrap: document.getElementById('dropzone-wrap'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  viewerStage: document.getElementById('viewer-stage'),
  canvasWrap: document.getElementById('canvas-wrap'),
  canvas: document.getElementById('viewer-canvas'),
  atmosphereOverlay: document.getElementById('atmosphere-overlay'),
  hudInfo: document.getElementById('hud-info'),
  overlayLoading: document.getElementById('overlay-loading'),
  overlayError: document.getElementById('overlay-error'),
  errorText: document.getElementById('error-text'),
  errorRetry: document.getElementById('error-retry'),
  fileName: document.getElementById('file-name'),
  fileStats: document.getElementById('file-stats'),
  newFileBtn: document.getElementById('new-file-btn'),
  ySlider: document.getElementById('y-slider'),
  yValue: document.getElementById('y-value'),
  sceneGrid: document.getElementById('scene-grid'),
  customColor: document.getElementById('custom-color'),
  floorToggle: document.getElementById('floor-toggle'),
  materialToggle: document.getElementById('material-toggle'),
  materialChevron: document.getElementById('material-chevron'),
  materialCount: document.getElementById('material-count'),
  materialList: document.getElementById('material-list'),
};

// Scene presets: clearColor is RGB 0-1 for the GL background; overlay is a CSS color
// applied multiplicatively over the canvas (or empty string = no overlay).
const SCENE_PRESETS = {
  default: { clearColor: [0.10, 0.08, 0.06], overlay: '' },
  day:     { clearColor: [0.53, 0.81, 0.92], overlay: '' },
  sunset:  { clearColor: [0.90, 0.51, 0.35], overlay: '#ffb182' },
  night:   { clearColor: [0.04, 0.06, 0.15], overlay: '#1a2a55' },
  cave:    { clearColor: [0.04, 0.03, 0.03], overlay: '#0a0907' },
  meadow:  { clearColor: [0.35, 0.55, 0.31], overlay: '' },
};

function hexToRgbUnit(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.10, 0.08, 0.06];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

function applyScene(name) {
  const preset = SCENE_PRESETS[name] ?? SCENE_PRESETS.default;
  renderer?.setClearColor(...preset.clearColor);
  if (preset.overlay) {
    els.atmosphereOverlay.style.background = preset.overlay;
    els.atmosphereOverlay.classList.add('is-on');
  } else {
    els.atmosphereOverlay.classList.remove('is-on');
  }
  // Sync the custom-color input to the preset so it doesn't lie
  const [r, g, b] = preset.clearColor;
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  els.customColor.value = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  els.sceneGrid.querySelectorAll('.scene-chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.scene === name);
  });
}

let renderer = null;
let resizeObserver = null;

function prettifyName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function showDropzone() {
  els.dropzoneWrap.hidden = false;
  els.viewerStage.hidden = true;
}

function showStage() {
  els.dropzoneWrap.hidden = true;
  els.viewerStage.hidden = false;
}

function showLoading() {
  els.overlayLoading.hidden = false;
  els.overlayError.hidden = true;
  els.hudInfo.hidden = true;
}

function showError(msg) {
  els.overlayLoading.hidden = true;
  els.overlayError.hidden = false;
  els.errorText.textContent = msg;
}

function hideOverlays() {
  els.overlayLoading.hidden = true;
  els.overlayError.hidden = true;
}

function resizeCanvas() {
  if (!els.canvas || !els.canvasWrap) return;
  const rect = els.canvasWrap.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    els.canvas.width = rect.width;
    els.canvas.height = rect.height;
    renderer?.notifyResized();
  }
}

async function parseFile(name, bytes) {
  const format = await detectFormat(name, bytes);
  switch (format) {
    case 'litematic': return liteParser.parse(bytes);
    case 'schem':     return schemParser.parse(bytes);
    case 'schematic': return schematicParser.parse(bytes);
    case 'nbt':       return nbtParser.parse(bytes);
  }
  throw new Error(`Unsupported format: ${format}`);
}

async function loadFile(file) {
  showStage();
  showLoading();

  // Give the browser a tick to render the stage so the canvas wrap has dimensions
  await new Promise((r) => requestAnimationFrame(r));
  resizeCanvas();

  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const grid = await parseFile(file.name, bytes);

    if (grid.countBlocks() === 0) {
      throw new Error('No blocks found in this file. It may be empty or use a format the viewer does not understand yet.');
    }

    // Tear down any prior renderer
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }

    renderer = await createRenderer(els.canvas);
    renderer.setGrid(grid);

    // Re-apply current scene + floor state so a previously-chosen preset persists
    // across file loads.
    const activeChip = els.sceneGrid.querySelector('.scene-chip.is-active');
    if (activeChip) {
      applyScene(activeChip.dataset.scene);
    } else {
      // Custom color in effect
      const [r, g, b] = hexToRgbUnit(els.customColor.value);
      renderer.setClearColor(r, g, b);
    }
    renderer.setFloorEnabled(els.floorToggle.checked);

    // Populate sidebar
    els.fileName.textContent = file.name;
    els.fileStats.innerHTML = `
      <div><strong>${grid.width.toLocaleString()} &times; ${grid.height.toLocaleString()} &times; ${grid.depth.toLocaleString()}</strong> blocks (W x H x L)</div>
      <div><strong>${grid.countBlocks().toLocaleString()}</strong> total blocks placed</div>
    `;

    // Y-slider
    els.ySlider.min = 0;
    els.ySlider.max = grid.height - 1;
    els.ySlider.value = grid.height - 1;
    els.yValue.textContent = grid.height - 1;

    // Material list — split known from unmapped (legacy IDs that fell through)
    const counts = grid.blockNameCounts();
    const known = [];
    let unmappedTotal = 0;
    let unmappedDistinct = 0;
    for (const [name, count] of counts) {
      if (name.startsWith('unknown_')) {
        unmappedTotal += count;
        unmappedDistinct++;
      } else {
        known.push({ name, count });
      }
    }
    known.sort((a, b) => b.count - a.count);
    const visibleRowCount = known.length + (unmappedTotal > 0 ? 1 : 0);
    els.materialCount.textContent = visibleRowCount.toLocaleString();

    const knownHtml = known
      .map((m) => `
        <div class="material-row">
          <span class="material-name">${prettifyName(m.name)}</span>
          <span class="material-count">${m.count.toLocaleString()}</span>
        </div>
      `)
      .join('');

    const unmappedHtml = unmappedTotal > 0
      ? `
        <div class="material-row is-unmapped" title="Legacy block IDs that the .schematic parser could not map to modern names. Likely from a pre-1.13 schematic with uncommon blocks.">
          <span class="material-name">Unmapped (${unmappedDistinct} ID${unmappedDistinct === 1 ? '' : 's'})</span>
          <span class="material-count">${unmappedTotal.toLocaleString()}</span>
        </div>
      `
      : '';

    els.materialList.innerHTML = knownHtml + unmappedHtml;

    // HUD
    els.hudInfo.textContent = `${grid.width} x ${grid.height} x ${grid.depth} | ${grid.countBlocks().toLocaleString()} blocks`;
    els.hudInfo.hidden = false;

    hideOverlays();
  } catch (err) {
    console.error('[viewer] load failed:', err);
    showError(err instanceof Error ? err.message : String(err));
  }
}

// File input change
els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) loadFile(file);
});

// Drag and drop on the dropzone
['dragenter', 'dragover'].forEach((evt) => {
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.dropzone.classList.add('is-dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.dropzone.classList.remove('is-dragover');
  });
});
els.dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

// Also accept drops anywhere on the page once the viewer is loaded
['dragover', 'drop'].forEach((evt) => {
  window.addEventListener(evt, (e) => {
    e.preventDefault();
  });
});
window.addEventListener('drop', (e) => {
  if (els.viewerStage.hidden) return; // dropzone owns the initial state
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

// Y-slider
els.ySlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  els.yValue.textContent = val;
  renderer?.setYLimit(val);
});

// Scene preset chips
els.sceneGrid.addEventListener('click', (e) => {
  const chip = e.target.closest('.scene-chip');
  if (!chip) return;
  applyScene(chip.dataset.scene);
});

// Custom background color picker
els.customColor.addEventListener('input', (e) => {
  const [r, g, b] = hexToRgbUnit(e.target.value);
  renderer?.setClearColor(r, g, b);
  // Treat picking a custom color as leaving the preset behind
  els.atmosphereOverlay.classList.remove('is-on');
  els.sceneGrid.querySelectorAll('.scene-chip').forEach((c) => c.classList.remove('is-active'));
});

// Grass floor toggle
els.floorToggle.addEventListener('change', (e) => {
  renderer?.setFloorEnabled(e.target.checked);
});

// Material list toggle
els.materialToggle.addEventListener('click', () => {
  const open = !els.materialList.hidden;
  els.materialList.hidden = open;
  els.materialChevron.textContent = open ? '+' : '-';
  els.materialToggle.setAttribute('aria-expanded', String(!open));
});

// Open-another-file button
els.newFileBtn.addEventListener('click', () => {
  els.fileInput.value = '';
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  showDropzone();
});

// Error retry: jump back to dropzone so user can pick again
els.errorRetry.addEventListener('click', () => {
  els.fileInput.value = '';
  hideOverlays();
  showDropzone();
});

// Resize handling
resizeObserver = new ResizeObserver(() => resizeCanvas());
resizeObserver.observe(els.canvasWrap);
window.addEventListener('resize', resizeCanvas);
