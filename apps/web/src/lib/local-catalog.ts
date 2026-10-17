import { type Title, type CatalogResponse, titleKey } from '@animepoodle/shared';
const LIMIT = 500;
interface CatalogRecord {
  key: string;
  item: Title;
  seenAt: number;
}
export function validTitle(item: unknown): item is Title {
  if (!item || typeof item !== 'object') return false;
  const t = item as Title;
  return (
    Number.isSafeInteger(t.id) &&
    typeof t.title === 'string' &&
    typeof t.original === 'string' &&
    typeof t.image === 'string' &&
    typeof t.description === 'string' &&
    Array.isArray(t.genres) &&
    t.genres.every((g) => typeof g === 'string') &&
    Array.isArray(t.features) &&
    t.features.length === 6 &&
    t.features.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) &&
    ['Anime', 'Manga', 'Manhwa', 'Manhua', 'Donghua'].includes(t.format)
  );
}
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('animepoodle-local-catalog', 2);
    req.onupgradeneeded = () => {
      for (const store of ['titles', 'requests'])
        if (!req.result.objectStoreNames.contains(store))
          req.result.createObjectStore(store, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Browser storage is busy.'));
  }));
}
export async function readLocalCatalog(): Promise<Title[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('titles', 'readonly');
    const request = tx.objectStore('titles').getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as CatalogRecord[])
          .sort((a, b) => b.seenAt - a.seenAt)
          .slice(0, LIMIT)
          .reverse()
          .map((r) => r.item)
          .filter(validTitle),
      );
    request.onerror = () => reject(request.error);
  });
}
export async function rememberTitles(items: Title[]) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('titles', 'readwrite');
    const store = tx.objectStore('titles');
    const now = Date.now();
    for (const item of items.filter(validTitle))
      store.put({ key: titleKey(item), item, seenAt: now });
    const request = store.getAll();
    request.onsuccess = () => {
      const records = (request.result as CatalogRecord[]).sort((a, b) => b.seenAt - a.seenAt);
      for (const record of records.slice(LIMIT)) store.delete(record.key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function readCatalogResponse(key: string): Promise<CatalogResponse | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const read = db.transaction('requests', 'readonly').objectStore('requests').get(key);
    read.onsuccess = () => {
      const data = read.result?.data;
      resolve(
        Array.isArray(data?.items) &&
          data.items.every(validTitle) &&
          typeof data.source === 'string'
          ? data
          : undefined,
      );
    };
    read.onerror = () => reject(read.error);
  });
}
export async function storeCatalogResponse(key: string, data: CatalogResponse) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('requests', 'readwrite');
    const store = tx.objectStore('requests');
    store.put({ key, data, storedAt: Date.now() });
    const read = store.getAll();
    read.onsuccess = () => {
      const rows = (read.result as { key: string; storedAt: number }[]).sort(
        (a, b) => b.storedAt - a.storedAt,
      );
      for (const row of rows.slice(24)) store.delete(row.key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
