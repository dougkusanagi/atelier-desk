import { openDB } from 'idb';
import { selectionClipboard } from './selectionClipboard';
const database = openDB('atelier-offline-v1', 1, {
  upgrade(db) {
    db.createObjectStore('documents');
    db.createObjectStore('outbox');
    db.createObjectStore('metadata');
    db.createObjectStore('history');
  },
});
export const cache = {
  async get<T>(store: string, key: string): Promise<T | undefined> {
    return (await database).get(store, key);
  },
  async put(store: string, key: string, value: unknown) {
    await (await database).put(store, value, key);
  },
  async delete(store: string, key: string) {
    await (await database).delete(store, key);
  },
  async entries<T>(store: string, prefix: string): Promise<T[]> {
    const db = await database;
    const transaction = db.transaction(store, 'readonly');
    const values: T[] = [];
    let cursor = await transaction.store.openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'));
    while (cursor) {
      values.push(cursor.value as T);
      cursor = await cursor.continue();
    }
    return values;
  },
  async records<T>(store: string, prefix: string): Promise<Array<{ key: string; value: T }>> {
    const db = await database,
      transaction = db.transaction(store, 'readonly');
    const values: Array<{ key: string; value: T }> = [];
    let cursor = await transaction.store.openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'));
    while (cursor) {
      values.push({ key: String(cursor.key), value: cursor.value as T });
      cursor = await cursor.continue();
    }
    return values;
  },
  async clearUser(userId: string) {
    const db = await database;
    for (const store of ['documents', 'outbox', 'metadata', 'history']) {
      const transaction = db.transaction(store, 'readwrite');
      let cursor = await transaction.store.openCursor(
        IDBKeyRange.bound(userId + ':', userId + ':\uffff'),
      );
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await transaction.done;
    }
    for (const entry of await indexedDB.databases()) {
      if (!entry.name?.startsWith('atelier:' + userId + ':')) continue;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(entry.name!);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(
            new Error('Feche outras abas do Atelier para concluir a limpeza dos dados locais.'),
          );
      });
    }
    for (const key of Object.keys(localStorage))
      if (key.startsWith('atelier-camera:' + userId + ':')) localStorage.removeItem(key);
    sessionStorage.removeItem('atelier-search-target');
    selectionClipboard.value = null;
  },
  async clear() {
    const db = await database;
    for (const store of ['documents', 'outbox', 'metadata', 'history']) await db.clear(store);
  },
};
