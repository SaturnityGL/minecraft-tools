import { newId } from './store.js';
import { encodeShare, decodeShare } from './share.js';
import { h, button, frontPixels, pixelCanvas, ago } from './ui-dom.js';

const SAVE_DELAY = 1000;
const SNAPSHOT_MAX = 20;
const SHARE_KEY = 's=';

export function initStore(ed) {
  const { doc, store, select } = ed;
  const nameInput = document.getElementById('draft-name');
  const saveState = document.getElementById('save-state');
  const draftsRoot = document.getElementById('drawer-drafts');
  const shareMenu = document.getElementById('share-menu');
  const draftList = h('div', { class: 'card-list' });
  const snapList = h('div', { class: 'card-list' });
  const snapTitle = h('h3', { text: 'Snapshots of this skin' });

  let created = Date.now();
  let dirty = false;
  let loading = false;
  let timer = null;
  let warned = false;

  function setState(text) {
    saveState.textContent = text;
  }

  function record() {
    return {
      id: doc.id,
      name: doc.name,
      model: doc.model,
      pixels: new Uint8Array(doc.pixels),
      created,
      updated: Date.now()
    };
  }

  async function save() {
    clearTimeout(timer);
    timer = null;
    if (!dirty || !store.available) return;
    dirty = false;
    const ok = await store.drafts.put(record());
    if (!ok) {
      setState('Not saved');
      if (!warned) {
        warned = true;
        ed.notice('The browser refused to save this draft, most likely because storage is full. Download your PNG so the work is not lost.');
      }
      return;
    }
    store.prefs.set('lastDraft', doc.id);
    setState('Saved');
    if (ed.drawer.active === 'drafts') renderDrafts();
  }

  function saveSoon() {
    dirty = true;
    if (!store.available) {
      setState('Not saved');
      return;
    }
    setState('Saving...');
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY);
  }

  async function switchTo(pixels, options, { keep = false } = {}) {
    ed.finishStroke();
    select.clear();
    await save();
    loading = true;
    doc.load(pixels, options);
    loading = false;
    created = options.created || Date.now();
    nameInput.value = doc.name;
    if (keep) saveSoon();
    else setState(options.saved ? 'Saved' : '');
    if (options.saved) store.prefs.set('lastDraft', doc.id);
    renderAll();
  }

  function openDraft(draft) {
    return switchTo(new Uint8ClampedArray(draft.pixels), {
      model: draft.model,
      name: draft.name,
      id: draft.id,
      created: draft.created,
      saved: true
    });
  }

  function newSkin() {
    return switchTo(ed.defaultSkin(doc.model), { model: doc.model, name: 'My skin', id: newId() }).then(() => {
      ed.setStatus('New skin started. It is saved as a draft once you change it.');
    });
  }

  ed.openAsNew = (pixels, model, name) => {
    switchTo(pixels, { model, name: (name || 'Uploaded skin').slice(0, 40), id: newId() }, { keep: true });
  };

  doc.on('change', () => {
    if (!loading) saveSoon();
  });

  nameInput.addEventListener('input', () => {
    doc.name = nameInput.value.trim() || 'My skin';
    saveSoon();
  });
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') nameInput.blur();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', () => {
    save();
  });

  function thumb(pixels, model) {
    return h('div', { class: 'thumb' }, pixelCanvas(frontPixels(pixels, model)));
  }

  function confirmButton(label, sure, run) {
    let armed = false;
    let reset = null;
    const b = button(label, () => {
      if (armed) {
        clearTimeout(reset);
        run();
        return;
      }
      armed = true;
      b.textContent = sure;
      reset = setTimeout(() => {
        armed = false;
        b.textContent = label;
      }, 3500);
    }, { class: 'sk-btn small danger' });
    return b;
  }

  function renameInline(title, current, commit) {
    const input = h('input', { type: 'text', class: 'text-input', maxlength: '40', value: current, 'aria-label': 'New name' });
    let done = false;
    const finish = keep => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      if (keep && next && next !== current) commit(next);
      else input.replaceWith(title);
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    title.replaceWith(input);
    input.focus();
    input.select();
  }

  async function renameDraft(draft, name) {
    if (draft.id === doc.id) {
      doc.name = name;
      nameInput.value = name;
      dirty = true;
      await save();
    } else {
      await store.drafts.put({ ...draft, name });
    }
    renderDrafts();
  }

  async function duplicateDraft(draft) {
    if (draft.id === doc.id) await save();
    const source = draft.id === doc.id ? record() : draft;
    const now = Date.now();
    await store.drafts.put({ ...source, id: newId(), name: `${source.name} copy`.slice(0, 40), created: now, updated: now });
    ed.setStatus('Draft duplicated.');
    renderDrafts();
  }

  async function deleteDraft(draft) {
    if (draft.id === doc.id) {
      ed.finishStroke();
      select.clear();
      clearTimeout(timer);
      dirty = false;
    }
    const snaps = await store.snapshots.listFor(draft.id);
    for (const s of snaps) await store.snapshots.remove(s.id);
    await store.drafts.remove(draft.id);
    if (draft.id === doc.id) {
      dirty = false;
      clearTimeout(timer);
      const rest = await store.drafts.list();
      if (rest.length > 0) await openDraft(rest[0]);
      else {
        store.prefs.remove('lastDraft');
        await newSkin();
      }
    }
    ed.setStatus('Draft deleted.');
    renderDrafts();
  }

  async function renderDrafts() {
    if (!store.available) {
      draftList.replaceChildren(h('p', { class: 'empty-note', text: 'Drafts are not available because this browser is blocking storage. Download your PNG to keep your work.' }));
      return;
    }
    const drafts = await store.drafts.list();
    draftList.replaceChildren();
    if (drafts.length === 0) {
      draftList.append(h('p', { class: 'empty-note', text: 'No drafts yet. Your skin is saved here on its own as soon as you change it.' }));
      return;
    }
    for (const draft of drafts) {
      const current = draft.id === doc.id;
      const title = h('strong', { text: draft.name || 'Untitled', title: draft.name || 'Untitled' });
      draftList.append(h('div', { class: current ? 'card is-current' : 'card' },
        thumb(draft.pixels, draft.model),
        h('div', { class: 'meta' },
          title,
          h('span', { text: `${current ? 'Open now, ' : ''}${draft.model}, ${ago(draft.updated)}` }),
          h('div', { class: 'row' },
            current ? null : button('Open', () => openDraft(draft)),
            button('Rename', () => renameInline(title, draft.name || '', name => renameDraft(draft, name))),
            button('Copy', () => duplicateDraft(draft)),
            confirmButton('Delete', 'Really delete?', () => deleteDraft(draft))))));
    }
  }

  async function takeSnapshot() {
    ed.finishStroke();
    select.commit();
    dirty = true;
    await save();
    const ok = await store.snapshots.put({
      id: newId(),
      draftId: doc.id,
      created: Date.now(),
      model: doc.model,
      pixels: new Uint8Array(doc.pixels)
    });
    if (!ok) {
      ed.setStatus('The snapshot could not be saved.');
      return;
    }
    const all = await store.snapshots.listFor(doc.id);
    for (const old of all.slice(SNAPSHOT_MAX)) await store.snapshots.remove(old.id);
    ed.setStatus('Snapshot saved.');
    renderSnapshots();
  }

  function restoreSnapshot(snap) {
    ed.finishStroke();
    select.clear();
    const changed = doc.replaceAll(new Uint8ClampedArray(snap.pixels), { model: snap.model });
    ed.setStatus(changed ? 'Snapshot restored. Undo brings back what you had.' : 'The skin already matches that snapshot.');
  }

  async function renderSnapshots() {
    snapList.replaceChildren();
    if (!store.available) return;
    const snaps = await store.snapshots.listFor(doc.id);
    snapList.replaceChildren();
    if (snaps.length === 0) {
      snapList.append(h('p', { class: 'empty-note', text: 'Save a snapshot before a risky change. You can come back to it any time, even after closing the page.' }));
      return;
    }
    for (const snap of snaps) {
      snapList.append(h('div', { class: 'card' },
        thumb(snap.pixels, snap.model),
        h('div', { class: 'meta' },
          h('strong', { text: new Date(snap.created).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }),
          h('span', { text: ago(snap.created) }),
          h('div', { class: 'row' },
            button('Restore', () => restoreSnapshot(snap)),
            confirmButton('Delete', 'Really delete?', async () => {
              await store.snapshots.remove(snap.id);
              renderSnapshots();
            })))));
    }
  }

  function renderAll() {
    if (ed.drawer.active !== 'drafts') return;
    renderDrafts();
    renderSnapshots();
  }

  const snapBtn = button('Save snapshot', takeSnapshot);
  snapBtn.disabled = !store.available;
  draftsRoot.append(
    h('div', { class: 'row spread', style: 'margin-bottom:10px' },
      h('h3', { text: 'Your drafts', style: 'margin:0' }),
      button('New skin', newSkin)),
    draftList,
    h('div', { class: 'row spread', style: 'margin:16px 0 10px' }, snapTitle, snapBtn),
    snapList);
  snapTitle.style.margin = '0';

  document.getElementById('tab-drafts').addEventListener('click', () => {
    queueMicrotask(renderAll);
  });

  async function buildShare() {
    shareMenu.replaceChildren(h('p', { class: 'menu-note', text: 'Building the link...' }));
    ed.finishStroke();
    select.commit();
    let link;
    try {
      const payload = await encodeShare(doc.pixels, doc.model);
      link = `${location.origin}${location.pathname}#${SHARE_KEY}${payload}`;
    } catch (err) {
      shareMenu.replaceChildren(h('p', { class: 'menu-note', text: 'This browser cannot build share links. Download the PNG and send that instead.' }));
      return;
    }
    const field = h('input', { type: 'text', class: 'text-input', readOnly: true, value: link, 'aria-label': 'Share link' });
    const copy = button('Copy', async () => {
      try {
        await navigator.clipboard.writeText(link);
        ed.setStatus('Link copied.');
      } catch (err) {
        field.focus();
        field.select();
        ed.setStatus('Press Ctrl+C to copy the selected link.');
      }
    }, { class: 'sk-btn small primary' });
    shareMenu.replaceChildren(
      h('div', { class: 'col' },
        h('div', { class: 'share-row' }, field, copy),
        h('p', { class: 'menu-note', text: `The whole skin is packed into the link (${link.length} characters). Nothing is uploaded, and anyone who opens it gets their own copy to edit.` })));
    field.addEventListener('focus', () => field.select());
  }

  ed.on('menu', id => {
    if (id === 'share-menu') buildShare();
  });

  async function openShared(payload) {
    try {
      const shared = await decodeShare(payload);
      await switchTo(shared.pixels, { model: shared.model, name: 'Shared skin', id: newId() }, { keep: true });
      ed.setStatus('Shared skin opened as a new draft.');
      return true;
    } catch (err) {
      ed.notice(`${err.message} Your last draft was opened instead.`);
      return false;
    } finally {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  async function openLast() {
    const last = store.prefs.get('lastDraft', null);
    if (!store.available || !last) return;
    const draft = await store.drafts.get(last);
    if (draft) await openDraft(draft);
  }

  async function boot() {
    if (!store.available) {
      setState('Not saved');
      ed.notice('This browser is not letting the editor save drafts (private windows often do this). Everything else works, but download your PNG before you leave.');
    }
    const hash = location.hash.replace(/^#/, '');
    if (hash.startsWith(SHARE_KEY)) {
      const ok = await openShared(hash.slice(SHARE_KEY.length));
      if (ok) return;
    }
    await openLast();
  }

  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace(/^#/, '');
    if (hash.startsWith(SHARE_KEY)) openShared(hash.slice(SHARE_KEY.length));
  });

  boot();
}
