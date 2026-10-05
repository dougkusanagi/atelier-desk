import { openDB } from 'idb';
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
  async clear() {
    const db = await database;
    for (const store of ['documents', 'outbox', 'metadata', 'history']) await db.clear(store);
  },
};
