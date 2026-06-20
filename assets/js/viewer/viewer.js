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
  materialToggle: document.getElementById('material-toggle'),
  materialChevron: document.getElementById('material-chevron'),
  materialCount: document.getElementById('material-count'),
  materialList: document.getElementById('material-list'),
};

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

    // Material list
    const counts = grid.blockNameCounts();
    const sorted = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    els.materialCount.textContent = sorted.length.toLocaleString();
    els.materialList.innerHTML = sorted
      .map((m) => `
        <div class="material-row">
          <span class="material-name">${prettifyName(m.name)}</span>
          <span class="material-count">${m.count.toLocaleString()}</span>
        </div>
      `)
      .join('');

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
