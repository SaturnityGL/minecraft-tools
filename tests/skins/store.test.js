import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore, newId } from '../../assets/js/skins/store.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: k => { data.delete(k); },
    raw: data
  };
}

test('newId returns distinct strings', () => {
  const a = newId();
  assert.equal(typeof a, 'string');
  assert.notEqual(a, newId());
});

test('without indexedDB every call resolves to an empty result', async () => {
  const store = await openStore({ indexedDB: undefined, localStorage: fakeStorage() });
  assert.equal(store.available, false);
  assert.deepEqual(await store.drafts.list(), []);
  assert.equal(await store.drafts.get('x'), null);
  assert.equal(await store.drafts.put({ id: 'x', pixels: new Uint8Array(4) }), false);
  assert.equal(await store.drafts.remove('x'), false);
  assert.deepEqual(await store.snapshots.listFor('x'), []);
  assert.equal(await store.snapshots.put({ id: 's', draftId: 'x' }), false);
  assert.equal(await store.snapshots.remove('s'), false);
  assert.deepEqual(await store.parts.list(), []);
  assert.equal(await store.parts.put({ id: 'p' }), false);
  assert.equal(await store.parts.remove('p'), false);
});

test('an indexedDB whose open throws leaves the store unavailable', async () => {
  const store = await openStore({ indexedDB: { open() { throw new Error('blocked'); } }, localStorage: fakeStorage() });
  assert.equal(store.available, false);
  assert.deepEqual(await store.drafts.list(), []);
});

test('an indexedDB whose open errors leaves the store unavailable', async () => {
  const indexedDB = {
    open() {
      const req = {};
      queueMicrotask(() => req.onerror());
      return req;
    }
  };
  const store = await openStore({ indexedDB, localStorage: fakeStorage() });
  assert.equal(store.available, false);
  assert.equal(await store.parts.put({ id: 'p' }), false);
});

test('a failing transaction resolves to the fallback', async () => {
  const db = { transaction() { throw new Error('quota'); } };
  const indexedDB = {
    open() {
      const req = { result: db };
      queueMicrotask(() => req.onsuccess());
      return req;
    }
  };
  const store = await openStore({ indexedDB, localStorage: fakeStorage() });
  assert.equal(store.available, true);
  assert.deepEqual(await store.drafts.list(), []);
  assert.equal(await store.drafts.put({ id: 'x' }), false);
  assert.deepEqual(await store.snapshots.listFor('x'), []);
});

test('prefs round trip with JSON values and the bf-skins prefix', async () => {
  const storage = fakeStorage();
  const store = await openStore({ indexedDB: undefined, localStorage: storage });
  assert.equal(store.prefs.get('recent', 'none'), 'none');
  assert.equal(store.prefs.set('recent', [[1, 2, 3], [4, 5, 6]]), true);
  assert.deepEqual(store.prefs.get('recent', []), [[1, 2, 3], [4, 5, 6]]);
  assert.ok(storage.raw.has('bf-skins:recent'));
  assert.equal(store.prefs.remove('recent'), true);
  assert.equal(store.prefs.get('recent', 7), 7);
});

test('prefs with corrupt JSON returns the fallback', async () => {
  const storage = fakeStorage();
  storage.setItem('bf-skins:bad', '{nope');
  const store = await openStore({ indexedDB: undefined, localStorage: storage });
  assert.equal(store.prefs.get('bad', 'fallback'), 'fallback');
});

test('prefs with a throwing localStorage never throw', async () => {
  const storage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('full'); },
    removeItem() { throw new Error('denied'); }
  };
  const store = await openStore({ indexedDB: undefined, localStorage: storage });
  assert.equal(store.prefs.get('k', 'fb'), 'fb');
  assert.equal(store.prefs.set('k', 1), false);
  assert.equal(store.prefs.remove('k'), false);
});

test('prefs without any localStorage return the fallback', async () => {
  const store = await openStore({ indexedDB: undefined, localStorage: undefined });
  assert.equal(store.prefs.get('k', 'fb'), 'fb');
  assert.equal(store.prefs.set('k', 1), false);
});
