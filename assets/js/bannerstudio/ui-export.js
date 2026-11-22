import { h, modal, closeModal, toast, fmtBytes } from './ui-kit.js';
import { renderFrame } from './render.js';
import { frameCount, loopMs } from './anim.js';
import { encodeGif, encodeApng, encodeWebp, canEncodeWebp, recordWebm, webmMimeType, downloadBytes } from './encode.js';
import { loadCore, loadModels } from './assets.js';

const PREF_KEY = 'blockforge-banner-studio-export';
const BIG_BYTES = 600 * 1024 * 1024;
const yieldUi = () => new Promise(r => setTimeout(r, 0));

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; }
}

function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { }
}

function fileBase(doc) {
  return (doc.name || 'banner').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'banner';
}

export function openExport(app) {
  const doc = app.doc;
  const p = Object.assign({ fmt: 'gif', scale: 1, colors: 256, dither: 'none', palette: 'global', quality: 0.9 }, loadPrefs());
  const webp = canEncodeWebp();
  const webm = !!webmMimeType();
  const formats = [
    ['gif', 'GIF', 'Works everywhere: Discord, forums, server lists.'],
    ['apng', 'APNG', 'Full color and smooth alpha. Discord and browsers play it, some sites do not.'],
    webp ? ['webp', 'WebP', 'Small, full color. Good for websites.'] : null,
    webm ? ['webm', 'WebM video', 'Tiny files for sites and video uploads. Records in real time.'] : null,
    ['png', 'PNG still', 'Just the frame you are looking at right now.'],
  ].filter(Boolean);
  if (!formats.some(f => f[0] === p.fmt)) p.fmt = 'gif';

  const fmtBox = h('div', { class: 'bs-fmts', role: 'radiogroup', 'aria-label': 'Format' });
  const opts = h('div', { class: 'bs-fields' });
  const info = h('p', { class: 'bs-note' });
  const bar = h('div', { class: 'bs-progress', hidden: true }, h('div', { class: 'bs-progress-fill' }));
  const status = h('div', { class: 'bs-small bs-muted', 'aria-live': 'polite' });
  const result = h('div', { class: 'bs-result' });
  const go = h('button', { type: 'button', class: 'bs-btn primary' }, 'Export');
  let busy = false;
  let cancel = false;

  const drawFmts = () => {
    fmtBox.textContent = '';
    for (const [id, label, desc] of formats) {
      fmtBox.append(h('button', { type: 'button', role: 'radio', 'aria-checked': String(p.fmt === id), class: 'bs-fmt' + (p.fmt === id ? ' on' : ''), onclick: () => { if (busy) return; p.fmt = id; drawFmts(); drawOpts(); } },
        h('strong', null, label), h('span', null, desc)));
    }
  };

  const sel = (label, key, list) => {
    const s = h('select', { class: 'bs-input' });
    for (const [v, l] of list) s.append(h('option', { value: String(v), selected: String(p[key]) === String(v) }, l));
    s.addEventListener('change', () => { const v = list.find(x => String(x[0]) === s.value)[0]; p[key] = v; drawInfo(); });
    return h('label', { class: 'bs-row' }, h('span', { class: 'bs-lab' }, label), s);
  };

  const drawOpts = () => {
    opts.textContent = '';
    if (p.fmt !== 'png') opts.append(sel('Size', 'scale', [[0.5, 'Half size'], [1, 'Full size'], [2, 'Double size (crisp upscale)']]));
    else opts.append(sel('Size', 'scale', [[1, 'Full size'], [2, 'Double size'], [4, 'Four times']]));
    if (p.fmt === 'gif') {
      opts.append(sel('Colors', 'colors', [[256, '256 (best)'], [128, '128'], [64, '64 (smaller file)'], [32, '32 (smallest)']]));
      opts.append(sel('Dithering', 'dither', [['none', 'None (clean pixel art)'], ['bayer', 'Pattern (smooth gradients)'], ['floyd', 'Diffusion (photos)']]));
      opts.append(sel('Palette', 'palette', [['global', 'Shared (no flicker)'], ['local', 'Per frame (more colors)']]));
      if (doc.transparent || doc.corner > 0) opts.append(h('p', { class: 'bs-note' }, 'Transparent areas become see-through. GIF only has on or off transparency, so soft edges get a hard cutoff.'));
    }
    if (p.fmt === 'webp') opts.append(sel('Quality', 'quality', [[1, 'Lossless-ish (1.0)'], [0.9, 'High (0.9)'], [0.75, 'Medium (0.75)'], [0.5, 'Low (0.5)']]));
    if (p.fmt === 'webm') opts.append(h('p', { class: 'bs-note' }, 'Video can not be transparent. Keep this tab visible while it records.'));
    drawInfo();
  };

  const dims = () => {
    const k = +p.scale;
    return [Math.max(1, Math.round(doc.w * k)), Math.max(1, Math.round(doc.h * k))];
  };

  const drawInfo = () => {
    const [w, hh] = dims();
    const n = frameCount(doc);
    if (p.fmt === 'png') {
      info.textContent = `${w} x ${hh} still image at ${(app.t / 1000).toFixed(2)}s.`;
      return;
    }
    const mem = w * hh * 4 * n;
    let txt = `${w} x ${hh}, ${n} frames at ${doc.fps} fps, ${(loopMs(doc) / 1000).toFixed(1)}s loop.`;
    if (mem > BIG_BYTES && p.fmt !== 'webm') txt += ` That is a lot of pixels (${fmtBytes(mem)} raw). It may be slow or run out of memory. Try half size or a lower frame rate.`;
    if (p.fmt === 'gif' && w * hh * n > 40e6) txt += ' Expect a big GIF. Discord caps server banners at 10 MB.';
    info.textContent = txt;
  };

  const setProg = (frac, msg) => {
    bar.hidden = false;
    bar.firstChild.style.width = (frac * 100).toFixed(1) + '%';
    if (msg) status.textContent = msg;
  };

  const frameCanvas = () => {
    const [w, hh] = dims();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hh;
    const x = c.getContext('2d', { willReadFrequently: true });
    const k = +p.scale;
    return { c, x, k, w, hh };
  };

  const drawAt = (F, t) => {
    F.x.setTransform(F.k, 0, 0, F.k, 0, 0);
    F.x.imageSmoothingEnabled = F.k < 1;
    renderFrame(F.x, doc, t, { static: false });
  };

  const showResult = (blob, name) => {
    result.textContent = '';
    const url = URL.createObjectURL(blob);
    const isVid = blob.type.startsWith('video/');
    const media = isVid ? h('video', { src: url, autoplay: true, loop: true, muted: true, playsinline: true, class: 'bs-preview' }) : h('img', { src: url, alt: 'Exported banner preview', class: 'bs-preview' });
    const warn = p.fmt === 'gif' && blob.size > 10 * 1024 * 1024 ? h('p', { class: 'bs-note bad' }, 'Over 10 MB. Discord banners and many sites will reject it. Try fewer colors, half size, or a lower frame rate.') : null;
    result.append(h('div', { class: 'bs-preview-wrap' + (doc.transparent ? ' checker' : '') }, media),
      h('div', { class: 'bs-btnrow' }, h('span', null, h('strong', null, name), ' ', h('span', { class: 'bs-muted' }, fmtBytes(blob.size))),
        h('button', { type: 'button', class: 'bs-btn primary', onclick: () => downloadBytes(blob, name, blob.type) }, 'Download')), warn);
    downloadBytes(blob, name, blob.type);
  };

  const run = async () => {
    if (busy) { cancel = true; return; }
    busy = true;
    cancel = false;
    savePrefs(p);
    go.textContent = 'Cancel';
    result.textContent = '';
    status.textContent = 'Loading textures and fonts';
    setProg(0);
    try {
      await loadCore();
      await loadModels();
      if (document.fonts) await document.fonts.ready;
      const base = fileBase(doc);
      const n = frameCount(doc);
      const loop = loopMs(doc);
      const tOf = i => i * loop / n;
      if (p.fmt === 'png') {
        const F = frameCanvas();
        drawAt(F, app.t);
        const blob = await new Promise(r => F.c.toBlob(r, 'image/png'));
        showResult(blob, base + '.png');
      } else if (p.fmt === 'webm') {
        const F = frameCanvas();
        if (!doc.transparent) { F.x.fillStyle = '#000'; F.x.fillRect(0, 0, F.w, F.hh); }
        const blob = await recordWebm(F.c, async i => { if (cancel) throw new Error('cancel'); drawAt(F, tOf(i)); }, n, doc.fps, f => setProg(f, `Recording frame ${Math.min(n, Math.round(f * n))} of ${n}`));
        if (!blob) throw new Error('This browser can not record video.');
        showResult(blob, base + '.webm');
      } else if (p.fmt === 'webp') {
        const F = frameCanvas();
        const bytes = await encodeWebp(async i => {
          if (cancel) throw new Error('cancel');
          drawAt(F, tOf(i));
          if (i % 4 === 3) await yieldUi();
          return F.c;
        }, n, { delayMs: Math.round(1000 / doc.fps), loop: 0, quality: +p.quality }, f => setProg(f, `Encoding frame ${Math.min(n, Math.round(f * n))} of ${n}`));
        if (!bytes) throw new Error('This browser can not make WebP files.');
        showResult(new Blob([bytes], { type: 'image/webp' }), base + '.webp');
      } else {
        const F = frameCanvas();
        const frames = [];
        for (let i = 0; i < n; i++) {
          if (cancel) throw new Error('cancel');
          drawAt(F, tOf(i));
          frames.push(F.x.getImageData(0, 0, F.w, F.hh));
          if (i % 3 === 2) { setProg((i + 1) / n * 0.4, `Rendering frame ${i + 1} of ${n}`); await yieldUi(); }
        }
        setProg(0.4, 'Encoding');
        await yieldUi();
        const onP = f => setProg(0.4 + f * 0.6, `Encoding ${Math.round(f * 100)}%`);
        let bytes, mime, ext;
        if (p.fmt === 'gif') {
          bytes = await encodeGif(frames, { delayCs: Math.round(100 / doc.fps), loop: 0, colors: +p.colors, dither: p.dither, transparent: doc.transparent || doc.corner > 0, palette: p.palette }, onP);
          mime = 'image/gif'; ext = '.gif';
        } else {
          bytes = await encodeApng(frames, { delayMs: Math.round(1000 / doc.fps), loop: 0 }, onP);
          mime = 'image/apng'; ext = '.png';
        }
        frames.length = 0;
        showResult(new Blob([bytes], { type: mime }), base + ext);
      }
      setProg(1, 'Done. The download should start on its own.');
    } catch (e) {
      bar.hidden = true;
      if (e && e.message === 'cancel') status.textContent = 'Cancelled.';
      else {
        status.textContent = 'Export failed: ' + (e && e.message ? e.message : 'unknown error');
        toast('Export failed. Try a smaller size or lower frame rate.', 'bad');
      }
    } finally {
      busy = false;
      go.textContent = 'Export again';
    }
  };

  go.addEventListener('click', run);
  drawFmts();
  drawOpts();
  modal('Export banner', [
    h('div', { class: 'bs-h' }, 'Format'), fmtBox,
    h('div', { class: 'bs-h' }, 'Options'), opts, info,
    h('div', { class: 'bs-btnrow' }, go, h('button', { type: 'button', class: 'bs-btn ghost', onclick: () => { cancel = true; closeModal(); } }, 'Close')),
    bar, status, result,
  ], { wide: true, sticky: false, onClose: () => { cancel = true; }, focus: false });
}
