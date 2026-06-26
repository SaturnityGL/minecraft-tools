import { createRenderer } from '../viewer/deepslate-bridge.js';
import { detectFormat } from '../viewer/formats/detect.js';
import * as liteParser from '../viewer/formats/litematic.js';
import * as schemParser from '../viewer/formats/schem.js';
import * as schematicParser from '../viewer/formats/schematic.js';
import * as nbtParser from '../viewer/formats/nbt.js';
import { mergeGrids } from './merge.js';
import { exportLitematic, exportSchemV2, triggerDownload } from './export.js';

const els = {
  dropzoneWrap: document.getElementById('dropzone-wrap'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input-merger'),
  addFileBtn: document.getElementById('add-file-btn'),
  schemList: document.getElementById('schem-list'),
  schemDropTarget: document.getElementById('schem-drop-target'),
  mergerStage: document.getElementById('merger-stage'),
  canvas: document.getElementById('merger-canvas'),
  canvasWrap: document.getElementById('canvas-wrap'),
  overlayMerging: document.getElementById('overlay-merging'),
  overlayError: document.getElementById('overlay-error'),
  errorText: document.getElementById('error-text'),
  bboxStats: document.getElementById('bbox-stats'),
  ySlider: document.getElementById('y-slider'),
  yValue: document.getElementById('y-value'),
  exportFmt: document.getElementById('export-fmt'),
  exportBtn: document.getElementById('export-btn'),
  materialToggle: document.getElementById('material-toggle'),
  materialChevron: document.getElementById('material-chevron'),
  materialCount: document.getElementById('material-count'),
  materialList: document.getElementById('material-list'),
};

let renderer = null;
let resizeObserver = null;
let mergedGrid = null;

const schemEntries = [];
let nextId = 1;

function showDropzone() {
  els.dropzoneWrap.hidden = false;
  els.mergerStage.hidden = true;
}

function showStage() {
  els.dropzoneWrap.hidden = true;
  els.mergerStage.hidden = false;
}

function showMerging() {
  els.overlayMerging.hidden = false;
  els.overlayError.hidden = true;
}

function hideOverlays() {
  els.overlayMerging.hidden = true;
  els.overlayError.hidden = true;
}

function showError(msg) {
  els.overlayMerging.hidden = true;
  els.overlayError.hidden = false;
  els.errorText.textContent = msg;
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
    case 'litematic': return { grid: await liteParser.parse(bytes), format: 'litematic' };
    case 'schem':     return { grid: await schemParser.parse(bytes), format: 'schem' };
    case 'schematic': return { grid: await schematicParser.parse(bytes), format: 'schematic' };
    case 'nbt':       return { grid: await nbtParser.parse(bytes), format: 'nbt' };
  }
  throw new Error(`Unsupported format: ${format}`);
}

function prettifyName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderSchemRow(entry) {
  const row = document.createElement('div');
  row.className = 'schem-row' + (entry.visible ? '' : ' is-hidden');
  row.dataset.id = entry.id;

  const { grid } = entry;
  const dims = `${grid.width} x ${grid.height} x ${grid.depth}`;
  const blocks = grid.countBlocks().toLocaleString();

  row.innerHTML = `
    <div class="schem-row-header">
      <span class="schem-name" title="${entry.name}">${entry.name}</span>
      <span class="schem-tag">${entry.format}</span>
      <button type="button" class="schem-vis-btn" title="Toggle visibility">${entry.visible ? '&#x1F441;' : '&#x1F6AB;'}</button>
      <button type="button" class="schem-rm-btn" title="Remove">&#x2715;</button>
    </div>
    <div class="schem-dims">${dims} | ${blocks} blocks</div>
    <div class="schem-offset-grid">
      <label>X <input type="number" class="offset-x" value="${entry.offsetX}" step="1"></label>
      <label>Y <input type="number" class="offset-y" value="${entry.offsetY}" step="1"></label>
      <label>Z <input type="number" class="offset-z" value="${entry.offsetZ}" step="1"></label>
    </div>
    <div class="schem-rot-row">
      Y-Rotation
      <select class="rot-y">
        <option value="0" ${entry.rotationY === 0 ? 'selected' : ''}>0 deg</option>
        <option value="90" ${entry.rotationY === 90 ? 'selected' : ''}>90 deg</option>
        <option value="180" ${entry.rotationY === 180 ? 'selected' : ''}>180 deg</option>
        <option value="270" ${entry.rotationY === 270 ? 'selected' : ''}>270 deg</option>
      </select>
    </div>
  `;

  row.querySelector('.schem-vis-btn').addEventListener('click', () => {
    entry.visible = !entry.visible;
    scheduleMerge();
    rebuildSchemList();
  });
  row.querySelector('.schem-rm-btn').addEventListener('click', () => {
    const idx = schemEntries.indexOf(entry);
    if (idx !== -1) schemEntries.splice(idx, 1);
    scheduleMerge();
    rebuildSchemList();
    if (schemEntries.length === 0) showDropzone();
  });
  row.querySelector('.offset-x').addEventListener('input', (e) => { entry.offsetX = parseInt(e.target.value, 10) || 0; scheduleMerge(); });
  row.querySelector('.offset-y').addEventListener('input', (e) => { entry.offsetY = parseInt(e.target.value, 10) || 0; scheduleMerge(); });
  row.querySelector('.offset-z').addEventListener('input', (e) => { entry.offsetZ = parseInt(e.target.value, 10) || 0; scheduleMerge(); });
  row.querySelector('.rot-y').addEventListener('change', (e) => { entry.rotationY = parseInt(e.target.value, 10); scheduleMerge(); });

  return row;
}

function rebuildSchemList() {
  els.schemList.innerHTML = '';
  for (const entry of schemEntries) {
    els.schemList.appendChild(renderSchemRow(entry));
  }
}

let mergeTimer = null;
function scheduleMerge() {
  if (mergeTimer) clearTimeout(mergeTimer);
  mergeTimer = setTimeout(() => runMerge(), 80);
}

const PREVIEW_VOLUME_LIMIT = 700_000;

async function runMerge() {
  if (schemEntries.length === 0) return;
  showMerging();

  await new Promise((r) => requestAnimationFrame(r));

  try {
    const grid = mergeGrids(schemEntries);
    mergedGrid = grid;

    const volume = grid.width * grid.height * grid.depth;
    const canPreview = volume <= PREVIEW_VOLUME_LIMIT;

    if (canPreview) {
      if (!renderer) {
        resizeCanvas();
        renderer = await createRenderer(els.canvas);
      }
      renderer.setGrid(grid);
    }

    els.ySlider.max = grid.height - 1;
    els.ySlider.value = grid.height - 1;
    els.yValue.textContent = grid.height - 1;

    els.bboxStats.innerHTML = `
      <div><strong>${grid.width.toLocaleString()} x ${grid.height.toLocaleString()} x ${grid.depth.toLocaleString()}</strong> (W x H x D)</div>
      <div>Volume: ${volume.toLocaleString()} cells</div>
      <div><strong>${grid.countBlocks().toLocaleString()}</strong> blocks placed</div>
      ${!canPreview ? `<div style="color:var(--color-text-muted);font-size:11px;margin-top:4px;">Preview disabled above ${PREVIEW_VOLUME_LIMIT.toLocaleString()} cells. Export still works.</div>` : ''}
    `;

    const counts = grid.blockNameCounts();
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    els.materialCount.textContent = entries.length.toLocaleString();
    els.materialList.innerHTML = entries.map(([name, count]) => `
      <div class="material-row">
        <span class="material-name">${prettifyName(name)}</span>
        <span class="material-count">${count.toLocaleString()}</span>
      </div>
    `).join('');

    els.exportBtn.disabled = false;
    hideOverlays();
  } catch (err) {
    console.error('[merger] merge failed:', err);
    showError(err instanceof Error ? err.message : String(err));
    els.exportBtn.disabled = true;
  }
}

async function loadFiles(files) {
  const arr = Array.from(files);
  if (arr.length === 0) return;

  showStage();
  showMerging();

  for (const file of arr) {
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const { grid, format } = await parseFile(file.name, bytes);
      schemEntries.push({
        id: nextId++,
        name: file.name,
        format,
        grid,
        offsetX: 0, offsetY: 0, offsetZ: 0,
        rotationY: 0,
        visible: true,
      });
    } catch (err) {
      console.error(`[merger] failed to load ${file.name}:`, err);
    }
  }

  rebuildSchemList();
  await runMerge();
}

els.fileInput.addEventListener('change', (e) => {
  if (e.target.files?.length) loadFiles(e.target.files);
  e.target.value = '';
});

['dragenter', 'dragover'].forEach((evt) => {
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    els.dropzone.classList.add('is-dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    els.dropzone.classList.remove('is-dragover');
  });
});
els.dropzone.addEventListener('drop', (e) => {
  const files = e.dataTransfer?.files;
  if (files?.length) loadFiles(files);
});

['dragenter', 'dragover'].forEach((evt) => {
  els.schemDropTarget.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    els.schemDropTarget.classList.add('is-dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  els.schemDropTarget.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    els.schemDropTarget.classList.remove('is-dragover');
  });
});
els.schemDropTarget.addEventListener('drop', (e) => {
  const files = e.dataTransfer?.files;
  if (files?.length) loadFiles(files);
});

els.addFileBtn.addEventListener('click', () => els.fileInput.click());

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  if (!els.mergerStage.hidden && e.dataTransfer?.files?.length) {
    e.preventDefault();
    loadFiles(e.dataTransfer.files);
  }
});

els.ySlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  els.yValue.textContent = val;
  renderer?.setYLimit(val);
});

els.materialToggle.addEventListener('click', () => {
  const open = !els.materialList.hidden;
  els.materialList.hidden = open;
  els.materialChevron.textContent = open ? '+' : '-';
  els.materialToggle.setAttribute('aria-expanded', String(!open));
});

els.exportBtn.addEventListener('click', () => {
  if (!mergedGrid) return;
  const fmt = els.exportFmt.value;
  try {
    if (fmt === 'litematic') {
      const bytes = exportLitematic(mergedGrid, 'merged');
      triggerDownload(bytes, 'merged.litematic');
    } else {
      const bytes = exportSchemV2(mergedGrid, 'merged');
      triggerDownload(bytes, 'merged.schem');
    }
  } catch (err) {
    alert(`Export failed: ${err instanceof Error ? err.message : err}`);
  }
});

resizeObserver = new ResizeObserver(() => resizeCanvas());
resizeObserver.observe(els.canvasWrap);
window.addEventListener('resize', resizeCanvas);
