// ROM Builder entry - wires the UI to build.js and reuses the merger's
// renderer + export pipeline. Same conventions as merger.js so the page
// behaves predictably (drop file, see preview, configure, export).

import { createRenderer } from '../viewer/deepslate-bridge.js';
import { buildRom, DEFAULT_OPTIONS, MAX_ADDRESSES, MAX_INPUT_BYTES } from './build.js';
import { exportLitematic, exportSchemV2, triggerDownload } from '../merger/export.js';

const SCENE_PRESETS = {
  default: { clearColor: [0.10, 0.08, 0.06], overlay: '' },
  day:     { clearColor: [0.53, 0.81, 0.92], overlay: '' },
  sunset:  { clearColor: [0.90, 0.51, 0.35], overlay: '#ffb182' },
  night:   { clearColor: [0.04, 0.06, 0.15], overlay: '#1a2a55' },
  cave:    { clearColor: [0.04, 0.03, 0.03], overlay: '#0a0907' },
  meadow:  { clearColor: [0.35, 0.55, 0.31], overlay: '' },
};

const PREVIEW_VOLUME_LIMIT = 700_000;

const els = {
  dropzoneWrap: document.getElementById('dropzone-wrap'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input-rom'),
  stage: document.getElementById('rom-stage'),
  canvas: document.getElementById('rom-canvas'),
  canvasWrap: document.getElementById('canvas-wrap'),
  overlayBuilding: document.getElementById('overlay-building'),
  overlayError: document.getElementById('overlay-error'),
  errorText: document.getElementById('error-text'),
  fileName: document.getElementById('file-name'),
  changeFileBtn: document.getElementById('change-file-btn'),
  wordBits: document.getElementById('opt-wordbits'),
  bitOrder: document.getElementById('opt-bitorder'),
  zSpacing: document.getElementById('opt-zspacing'),
  substrateBlock: document.getElementById('opt-substrate'),
  onBlock: document.getElementById('opt-on'),
  statsList: document.getElementById('stats-list'),
  ySlider: document.getElementById('y-slider'),
  yValue: document.getElementById('y-value'),
  exportFmt: document.getElementById('export-fmt'),
  exportName: document.getElementById('export-name'),
  exportBtn: document.getElementById('export-btn'),
  sceneGrid: document.getElementById('scene-grid'),
  atmoOverlay: document.getElementById('atmo-overlay'),
};

let renderer = null;
let resizeObserver = null;
let currentBytes = null;
let currentName = '';
let currentGrid = null;
let buildTimer = null;

function showDropzone() {
  els.dropzoneWrap.hidden = false;
  els.stage.hidden = true;
}

function showStage() {
  els.dropzoneWrap.hidden = true;
  els.stage.hidden = false;
}

function showBuilding() {
  els.overlayBuilding.hidden = false;
  els.overlayError.hidden = true;
}

function hideOverlays() {
  els.overlayBuilding.hidden = true;
  els.overlayError.hidden = true;
}

function showError(msg) {
  els.overlayBuilding.hidden = true;
  els.overlayError.hidden = false;
  els.errorText.textContent = msg;
  els.exportBtn.disabled = true;
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

function applyScene(name) {
  const preset = SCENE_PRESETS[name] ?? SCENE_PRESETS.default;
  renderer?.setClearColor(...preset.clearColor);
  if (els.atmoOverlay) {
    if (preset.overlay) {
      els.atmoOverlay.style.background = preset.overlay;
      els.atmoOverlay.style.opacity = '1';
      els.atmoOverlay.style.mixBlendMode = 'multiply';
    } else {
      els.atmoOverlay.style.background = '';
      els.atmoOverlay.style.opacity = '0';
    }
  }
  els.sceneGrid?.querySelectorAll('.scene-chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.scene === name);
  });
}

function currentOptions() {
  return {
    wordBits: parseInt(els.wordBits.value, 10) || DEFAULT_OPTIONS.wordBits,
    msbFirst: els.bitOrder.value === 'msb',
    zSpacing: parseInt(els.zSpacing.value, 10) || 0,
    substrateBlock: els.substrateBlock.value || DEFAULT_OPTIONS.substrateBlock,
    onBlock: els.onBlock.value || DEFAULT_OPTIONS.onBlock,
  };
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function renderStats(stats, preview) {
  els.statsList.innerHTML = `
    <div><strong>${fmtBytes(stats.inputBytes)}</strong> input <span class="muted">(${stats.inputBytes.toLocaleString()} bytes)</span></div>
    <div><strong>${stats.wordCount.toLocaleString()}</strong> addresses x <strong>${stats.wordBits}</strong>-bit words</div>
    <div><strong>${stats.filledBits.toLocaleString()}</strong> bits set <span class="muted">of ${stats.totalBits.toLocaleString()}</span></div>
    <div><strong>${stats.width} x ${stats.height} x ${stats.depth}</strong> blocks (W x H x D)</div>
    <div>Volume: ${stats.volume.toLocaleString()} cells</div>
    ${!preview ? `<div class="warn">Preview disabled above ${PREVIEW_VOLUME_LIMIT.toLocaleString()} cells. Export still works.</div>` : ''}
  `;
}

function scheduleBuild() {
  if (!currentBytes) return;
  if (buildTimer) clearTimeout(buildTimer);
  buildTimer = setTimeout(() => runBuild(), 80);
}

async function runBuild() {
  if (!currentBytes) return;
  showBuilding();
  await new Promise((r) => requestAnimationFrame(r));

  try {
    const { grid, stats } = buildRom(currentBytes, currentOptions());
    currentGrid = grid;

    const canPreview = stats.volume <= PREVIEW_VOLUME_LIMIT;
    if (canPreview) {
      if (!renderer) {
        resizeCanvas();
        renderer = await createRenderer(els.canvas);
        applyScene('day');
      }
      renderer.setGrid(grid);
    }

    els.ySlider.max = grid.height - 1;
    els.ySlider.value = grid.height - 1;
    els.yValue.textContent = grid.height - 1;

    renderStats(stats, canPreview);
    els.exportBtn.disabled = false;
    hideOverlays();
  } catch (err) {
    console.error('[rom] build failed:', err);
    showError(err instanceof Error ? err.message : String(err));
  }
}

async function loadFile(file) {
  if (!file) return;
  if (file.size === 0) {
    showStage();
    showError('That file is empty.');
    return;
  }
  if (file.size > MAX_INPUT_BYTES) {
    showStage();
    showError(`File is ${fmtBytes(file.size)}. Max accepted is ${fmtBytes(MAX_INPUT_BYTES)}.`);
    return;
  }

  showStage();
  showBuilding();

  try {
    const buf = await file.arrayBuffer();
    currentBytes = new Uint8Array(buf);
    currentName = file.name;
    els.fileName.textContent = file.name;
    suggestExportName(file.name);
    await runBuild();
  } catch (err) {
    console.error('[rom] failed to read file:', err);
    showError(err instanceof Error ? err.message : String(err));
  }
}

function suggestExportName(srcName) {
  const dot = srcName.lastIndexOf('.');
  const base = dot > 0 ? srcName.slice(0, dot) : srcName;
  els.exportName.value = `${base}-rom`;
}

els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) loadFile(file);
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
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  if (!els.stage.hidden && e.dataTransfer?.files?.[0]) {
    e.preventDefault();
    loadFile(e.dataTransfer.files[0]);
  }
});

els.changeFileBtn.addEventListener('click', () => els.fileInput.click());

[els.wordBits, els.bitOrder, els.zSpacing, els.substrateBlock, els.onBlock].forEach((el) => {
  el.addEventListener('change', scheduleBuild);
});

els.ySlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  els.yValue.textContent = val;
  renderer?.setYLimit(val);
});

els.sceneGrid?.addEventListener('click', (e) => {
  const chip = e.target.closest('.scene-chip');
  if (!chip) return;
  applyScene(chip.dataset.scene);
});

els.exportBtn.addEventListener('click', () => {
  if (!currentGrid) return;
  const fmt = els.exportFmt.value;
  const baseName = (els.exportName.value || 'rom').trim() || 'rom';
  try {
    if (fmt === 'litematic') {
      const bytes = exportLitematic(currentGrid, baseName);
      triggerDownload(bytes, `${baseName}.litematic`);
    } else {
      const bytes = exportSchemV2(currentGrid, baseName);
      triggerDownload(bytes, `${baseName}.schem`);
    }
  } catch (err) {
    alert(`Export failed: ${err instanceof Error ? err.message : err}`);
  }
});

resizeObserver = new ResizeObserver(() => resizeCanvas());
resizeObserver.observe(els.canvasWrap);
window.addEventListener('resize', resizeCanvas);
