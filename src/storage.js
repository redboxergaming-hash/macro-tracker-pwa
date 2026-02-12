const DB_NAME = 'macroTrackerDB';
const DB_VERSION = 4;

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function ensureStore(db, storeName, options) {
  if (!db.objectStoreNames.contains(storeName)) {
    return db.createObjectStore(storeName, options);
  }
  return null;
}

function ensureIndex(store, indexName, keyPath, options) {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, options);
  }
}


function toNonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeEntryForStorage(entry) {
  const kcal = toNonNegativeNumber(entry?.kcal);
  const p = toNonNegativeNumber(entry?.p);
  const c = toNonNegativeNumber(entry?.c);
  const f = toNonNegativeNumber(entry?.f);
  const amountGrams = toNonNegativeNumber(entry?.amountGrams);

  if (kcal === null || p === null || c === null || f === null || amountGrams === null) {
    throw new Error('Invalid entry nutrition values: kcal/macros/grams must be non-negative numbers');
  }

  return {
    ...entry,
    kcal,
    p,
    c,
    f,
    amountGrams
  };
}

function normalizeWeightLogForImport(item) {
  const scaleWeight = Number(item?.scaleWeight);
  if (!Number.isFinite(scaleWeight) || scaleWeight <= 0) return null;
  const trendWeight = Number(item?.trendWeight);

  return {
    ...item,
    scaleWeight,
    trendWeight: Number.isFinite(trendWeight) && trendWeight > 0 ? trendWeight : null
  };
}

function shiftIsoDate(isoDate, dayDelta) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + dayDelta);
  return date.toISOString().slice(0, 10);
}

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      const oldVersion = event.oldVersion;

      let persons = ensureStore(db, 'persons', { keyPath: 'id' });
      let entries = ensureStore(db, 'entries', { keyPath: 'id' });
      ensureStore(db, 'productsCache', { keyPath: 'barcode' });
      let favorites = ensureStore(db, 'favorites', { keyPath: 'id' });
      let recents = ensureStore(db, 'recents', { keyPath: 'id' });
      let weightLogs = ensureStore(db, 'weightLogs', { keyPath: 'id' });
      ensureStore(db, 'meta', { keyPath: 'key' });

      if (!persons) persons = tx.objectStore('persons');
      if (!entries) entries = tx.objectStore('entries');
      if (!favorites) favorites = tx.objectStore('favorites');
      if (!recents) recents = tx.objectStore('recents');
      if (!weightLogs) weightLogs = tx.objectStore('weightLogs');

      ensureIndex(entries, 'byPersonDate', ['personId', 'date']);
      ensureIndex(entries, 'byPersonDateTime', ['personId', 'date', 'time']);
      ensureIndex(entries, 'byPerson', 'personId');

      ensureIndex(favorites, 'byPerson', 'personId');
      ensureIndex(favorites, 'byPersonLabel', ['personId', 'label']);

      ensureIndex(recents, 'byPersonUsedAt', ['personId', 'usedAt']);
      ensureIndex(recents, 'byPersonFood', ['personId', 'foodId']);

      ensureIndex(weightLogs, 'byPerson', 'personId');
      ensureIndex(weightLogs, 'byDate', 'date');
      ensureIndex(weightLogs, 'byPersonDate', ['personId', 'date'], { unique: true });

      if (oldVersion < 2) {
        const cursorReq = persons.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const value = cursor.value;
          if (!value.macroTargets || typeof value.macroTargets !== 'object') {
            value.macroTargets = { p: null, c: null, f: null };
            cursor.update(value);
          }
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function seedSampleData() {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'meta', 'favorites', 'recents', 'weightLogs'], 'readwrite');
  tx.objectStore('persons').clear();
  tx.objectStore('entries').clear();
  tx.objectStore('favorites').clear();
  tx.objectStore('recents').clear();
  tx.objectStore('weightLogs').clear();

  const persons = [
    { id: crypto.randomUUID(), name: 'Alex', kcalGoal: 2200, macroTargets: { p: 160, c: 240, f: 70 } },
    { id: crypto.randomUUID(), name: 'Sam', kcalGoal: 1800, macroTargets: { p: 120, c: 190, f: 60 } }
  ];
  persons.forEach((p) => tx.objectStore('persons').put(p));

  const today = new Date().toISOString().slice(0, 10);
  const sample = [
    {
      id: crypto.randomUUID(),
      personId: persons[0].id,
      date: today,
      time: '08:15',
      foodId: 'gf_oats',
      foodName: 'Oats (dry)',
      amountGrams: 60,
      kcal: 233,
      p: 10,
      c: 40,
      f: 4,
      source: 'Manual (Generic built-in)'
    },
    {
      id: crypto.randomUUID(),
      personId: persons[1].id,
      date: today,
      time: '12:30',
      foodId: 'custom_chicken',
      foodName: 'Chicken breast (cooked)',
      amountGrams: 150,
      kcal: 248,
      p: 46,
      c: 0,
      f: 5,
      source: 'Manual (Custom)'
    }
  ];
  sample.forEach((e) => tx.objectStore('entries').put(e));
  tx.objectStore('meta').put({ key: 'sampleSeededAt', value: new Date().toISOString() });

  await txDone(tx);
  return { persons, sample };
}

export async function getPersons() {
  const db = await openDb();
  const tx = db.transaction('persons', 'readonly');
  return promisify(tx.objectStore('persons').getAll());
}

export async function upsertPerson(person) {
  const db = await openDb();
  const tx = db.transaction('persons', 'readwrite');
  tx.objectStore('persons').put(person);
  await txDone(tx);
  return person;
}

export async function deletePersonCascade(personId) {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'favorites', 'recents', 'weightLogs'], 'readwrite');
  tx.objectStore('persons').delete(personId);

  const deleteByIndex = (storeName, indexName, keyRange) => {
    const index = tx.objectStore(storeName).index(indexName);
    const req = index.openCursor(keyRange);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
  };

  deleteByIndex('entries', 'byPerson', IDBKeyRange.only(personId));
  deleteByIndex('favorites', 'byPerson', IDBKeyRange.only(personId));
  deleteByIndex('recents', 'byPersonUsedAt', IDBKeyRange.bound([personId, 0], [personId, Number.MAX_SAFE_INTEGER]));
  deleteByIndex('weightLogs', 'byPerson', IDBKeyRange.only(personId));

  await txDone(tx);
}

export async function getEntriesForPersonDate(personId, date) {
  const db = await openDb();
  const tx = db.transaction('entries', 'readonly');
  const idx = tx.objectStore('entries').index('byPersonDate');
  return promisify(idx.getAll([personId, date]));
}

export async function getEntriesForPersonDateRange(personId, startDate, endDate) {
  const db = await openDb();
  const tx = db.transaction('entries', 'readonly');
  const idx = tx.objectStore('entries').index('byPersonDate');
  const range = IDBKeyRange.bound([personId, startDate], [personId, endDate]);
  return promisify(idx.getAll(range));
}

export async function addEntry(entry) {
  const sanitizedEntry = normalizeEntryForStorage(entry);
  const db = await openDb();
  const tx = db.transaction(['entries', 'recents', 'meta'], 'readwrite');
  const stored = {
    ...entry,
    id: entry.id || crypto.randomUUID(),
    createdAt: entry.createdAt || Date.now()
  };
  tx.objectStore('entries').put(stored);

  if (sanitizedEntry.recentItem) {
    const recentsStore = tx.objectStore('recents');
    const byPersonFood = recentsStore.index('byPersonFood');
    const key = [sanitizedEntry.personId, sanitizedEntry.recentItem.foodId];
    const existingReq = byPersonFood.get(key);
    existingReq.onsuccess = () => {
      const existing = existingReq.result;
      if (existing?.id) {
        recentsStore.delete(existing.id);
      }
      recentsStore.put({
        id: crypto.randomUUID(),
        personId: sanitizedEntry.personId,
        foodId: sanitizedEntry.recentItem.foodId,
        label: sanitizedEntry.recentItem.label,
        nutrition: sanitizedEntry.recentItem.nutrition,
        pieceGramHint: sanitizedEntry.recentItem.pieceGramHint ?? null,
        sourceType: sanitizedEntry.recentItem.sourceType,
        imageUrl: sanitizedEntry.recentItem.imageUrl || '',
        usedAt: Date.now()
      });
    };
  }

  if (sanitizedEntry.lastPortionKey) {
    tx.objectStore('meta').put({ key: `lastPortion:${sanitizedEntry.lastPortionKey}`, value: Number(sanitizedEntry.amountGrams) });
  }

  await txDone(tx);
  return stored;
}

export async function getFavorites(personId) {
  const db = await openDb();
  const tx = db.transaction('favorites', 'readonly');
  const idx = tx.objectStore('favorites').index('byPerson');
  return promisify(idx.getAll(personId));
}

export async function isFavorite(personId, foodId) {
  const db = await openDb();
  const tx = db.transaction('favorites', 'readonly');
  const item = await promisify(tx.objectStore('favorites').get(`${personId}:${foodId}`));
  return Boolean(item);
}

export async function toggleFavorite(personId, favoriteItem) {
  const db = await openDb();
  const tx = db.transaction('favorites', 'readwrite');
  const store = tx.objectStore('favorites');
  const id = `${personId}:${favoriteItem.foodId}`;
  const existing = await promisify(store.get(id));
  if (existing) {
    store.delete(id);
  } else {
    store.put({
      id,
      personId,
      foodId: favoriteItem.foodId,
      label: favoriteItem.label,
      nutrition: favoriteItem.nutrition,
      sourceType: favoriteItem.sourceType,
      pieceGramHint: favoriteItem.pieceGramHint ?? null,
      imageUrl: favoriteItem.imageUrl || '',
      createdAt: Date.now()
    });
  }
  await txDone(tx);
  return !existing;
}

export async function getRecents(personId, limit = 20) {
  const db = await openDb();
  const tx = db.transaction('recents', 'readonly');
  const idx = tx.objectStore('recents').index('byPersonUsedAt');
  const range = IDBKeyRange.bound([personId, 0], [personId, Number.MAX_SAFE_INTEGER]);

  return new Promise((resolve, reject) => {
    const out = [];
    const req = idx.openCursor(range, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || out.length >= limit) {
        resolve(out);
        return;
      }
      const row = cursor.value;
      if (!out.some((item) => item.foodId === row.foodId)) {
        out.push(row);
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}


export async function getMetaValue(key) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readonly');
  const row = await promisify(tx.objectStore('meta').get(key));
  return row?.value ?? null;
}

export async function setMetaValue(key, value) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await txDone(tx);
  return value;
}

export async function getLastPortion(lastPortionKey) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readonly');
  const row = await promisify(tx.objectStore('meta').get(`lastPortion:${lastPortionKey}`));
  return row?.value ?? null;
}


function uniqueById(items, idKey = 'id') {
  const map = new Map();
  for (const item of items || []) {
    if (!item || item[idKey] == null) continue;
    map.set(item[idKey], item);
  }
  return [...map.values()];
}

export async function exportAllData() {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs'], 'readonly');

  const [persons, entries, productsCache, favorites, recents, weightLogs] = await Promise.all([
    promisify(tx.objectStore('persons').getAll()),
    promisify(tx.objectStore('entries').getAll()),
    promisify(tx.objectStore('productsCache').getAll()),
    promisify(tx.objectStore('favorites').getAll()),
    promisify(tx.objectStore('recents').getAll()),
    promisify(tx.objectStore('weightLogs').getAll())
  ]);

  return {
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    persons,
    entries,
    productsCache,
    favorites,
    recents,
    weightLogs
  };
}

export async function importAllData(payload) {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs', 'meta'], 'readwrite');

  const storesToReset = ['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs'];
  storesToReset.forEach((storeName) => tx.objectStore(storeName).clear());

  const persons = uniqueById(payload.persons || []);
  const entries = uniqueById(payload.entries || []).map((item) => {
    try {
      return normalizeEntryForStorage(item);
    } catch (error) {
      return null;
    }
  }).filter(Boolean);
  const productsCache = uniqueById(payload.productsCache || [], 'barcode');
  const favorites = uniqueById(payload.favorites || []);
  const recents = uniqueById(payload.recents || []);
  const weightLogs = uniqueById(payload.weightLogs || []).map(normalizeWeightLogForImport).filter(Boolean);

  persons.forEach((item) => tx.objectStore('persons').put(item));
  entries.forEach((item) => tx.objectStore('entries').put(item));
  productsCache.forEach((item) => tx.objectStore('productsCache').put(item));
  favorites.forEach((item) => tx.objectStore('favorites').put(item));
  recents.forEach((item) => tx.objectStore('recents').put(item));
  weightLogs.forEach((item) => tx.objectStore('weightLogs').put(item));

  tx.objectStore('meta').put({ key: 'lastImportAt', value: new Date().toISOString() });

  await txDone(tx);
  return {
    persons: persons.length,
    entries: entries.length,
    productsCache: productsCache.length,
    favorites: favorites.length,
    recents: recents.length,
    weightLogs: weightLogs.length
  };
}

export async function deleteAllData() {
  const db = await openDb();
  const tx = db.transaction(['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs', 'meta'], 'readwrite');
  ['persons', 'entries', 'productsCache', 'favorites', 'recents', 'weightLogs', 'meta'].forEach((storeName) => {
    tx.objectStore(storeName).clear();
  });
  await txDone(tx);
}


export async function getCachedProduct(barcode) {
  const db = await openDb();
  const tx = db.transaction('productsCache', 'readonly');
  return promisify(tx.objectStore('productsCache').get(barcode));
}

export async function upsertCachedProduct(product) {
  const db = await openDb();
  const tx = db.transaction('productsCache', 'readwrite');
  tx.objectStore('productsCache').put(product);
  await txDone(tx);
  return product;
}



export async function addWeightLog(personId, date, scaleWeight) {
  const safeWeight = Number(scaleWeight);
  if (!Number.isFinite(safeWeight) || safeWeight <= 0) {
    throw new Error('Invalid weight value');
  }

  const db = await openDb();
  const existingTx = db.transaction('weightLogs', 'readonly');
  const byPersonDate = existingTx.objectStore('weightLogs').index('byPersonDate');
  const existing = await promisify(byPersonDate.get([personId, date]));

  const tx = db.transaction('weightLogs', 'readwrite');
  const store = tx.objectStore('weightLogs');
  const rowId = existing?.id || crypto.randomUUID();
  store.put({
    id: rowId,
    personId,
    date,
    scaleWeight: safeWeight,
    trendWeight: null
  });
  await txDone(tx);

  const startDate = shiftIsoDate(date, -6);
  const recent = await getWeightLogsInRange(personId, startDate, date);
  const valid = recent.map((item) => Number(item.scaleWeight)).filter((v) => Number.isFinite(v) && v > 0);
  const trendWeight = valid.length ? Math.round((valid.reduce((sum, v) => sum + v, 0) / valid.length) * 10) / 10 : null;

  const trendTx = db.transaction('weightLogs', 'readwrite');
  trendTx.objectStore('weightLogs').put({
    id: rowId,
    personId,
    date,
    scaleWeight: safeWeight,
    trendWeight
  });
  await txDone(trendTx);

  return { id: rowId, personId, date, scaleWeight: safeWeight, trendWeight };
}


export async function getWeightLogsByPerson(personId) {
  const db = await openDb();
  const tx = db.transaction('weightLogs', 'readonly');
  const idx = tx.objectStore('weightLogs').index('byPersonDate');
  const range = IDBKeyRange.bound([personId, '0000-01-01'], [personId, '9999-12-31']);

  return new Promise((resolve, reject) => {
    const out = [];
    const req = idx.openCursor(range, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      out.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getWeightLogsInRange(personId, startDate, endDate) {
  const db = await openDb();
  const tx = db.transaction('weightLogs', 'readonly');
  const idx = tx.objectStore('weightLogs').index('byPersonDate');
  const range = IDBKeyRange.bound([personId, startDate], [personId, endDate]);

  return promisify(idx.getAll(range));
}
