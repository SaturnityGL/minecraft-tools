const DB_NAME = 'blockforge-skins';
const DB_VERSION = 1;
const PREFIX = 'bf-skins:';

export function newId() {
  return crypto.randomUUID();
}

function readGlobal(name) {
  try {
    return globalThis[name];
  } catch {
    return undefined;
  }
}

function openDatabase(indexedDB) {
  return new Promise(resolve => {
    if (!indexedDB) {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('drafts', { keyPath: 'id' });
        db.createObjectStore('parts', { keyPath: 'id' });
        const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' });
        snapshots.createIndex('draftId', 'draftId', { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function createRunner(db) {
  return function run(storeName, mode, work, fallback, transform = value => value) {
    if (!db) return Promise.resolve(fallback);
    return new Promise(resolve => {
      try {
        const tx = db.transaction(storeName, mode);
        const req = work(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(transform(req ? req.result : undefined));
        tx.onerror = () => resolve(fallback);
        tx.onabort = () => resolve(fallback);
      } catch {
        resolve(fallback);
      }
    });
  };
}

function normalize(record) {
  if (record && record.pixels) return { ...record, pixels: new Uint8Array(record.pixels) };
  return record;
}

function createPrefs(storage) {
  return {
    get(key, fallback) {
      try {
        const raw = storage.getItem(PREFIX + key);
        return raw === null || raw === undefined ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        storage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        storage.removeItem(PREFIX + key);
        return true;
      } catch {
        return false;
      }
    }
  };
}

function createCollection(run, name) {
  return {
    list: () => run(name, 'readonly', s => s.getAll(), [], rows => rows || []),
    get: id => run(name, 'readonly', s => s.get(id), null, row => row || null),
    put: record => run(name, 'readwrite', s => s.put(normalize(record)), false, () => true),
    remove: id => run(name, 'readwrite', s => s.delete(id), false, () => true)
  };
}

export async function openStore(options = {}) {
  const indexedDB = 'indexedDB' in options ? options.indexedDB : readGlobal('indexedDB');
  const localStorage = 'localStorage' in options ? options.localStorage : readGlobal('localStorage');
  const db = await openDatabase(indexedDB);
  const run = createRunner(db);

  const drafts = createCollection(run, 'drafts');
  const parts = createCollection(run, 'parts');
  const snapshots = createCollection(run, 'snapshots');

  const prefs = localStorage
    ? createPrefs(localStorage)
    : { get: (key, fallback) => fallback, set: () => false, remove: () => false };

  return {
    available: db !== null,
    drafts: {
      ...drafts,
      list: () => drafts.list().then(rows => rows.slice().sort((a, b) => b.updated - a.updated))
    },
    snapshots: {
      ...snapshots,
      listFor: draftId => run(
        'snapshots',
        'readonly',
        s => s.index('draftId').getAll(draftId),
        [],
        rows => (rows || []).slice().sort((a, b) => b.created - a.created)
      )
    },
    parts: {
      ...parts,
      list: () => parts.list().then(rows => rows.slice().sort((a, b) => b.created - a.created))
    },
    prefs
  };
}
