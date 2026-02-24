import { openDB } from 'idb';
import { OfflineMutation } from '../types';

const DB_NAME = 'flowly-offline-db';
const DB_VERSION = 1;
const STORE_MUTATIONS = 'mutations';

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
      db.createObjectStore(STORE_MUTATIONS, { keyPath: 'id' });
    }
  },
});

export async function enqueueMutation(
  mutation: Omit<OfflineMutation, 'id' | 'created_at'>,
): Promise<OfflineMutation> {
  const payload: OfflineMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };

  const db = await dbPromise;
  await db.put(STORE_MUTATIONS, payload);
  return payload;
}

export async function listMutations(): Promise<OfflineMutation[]> {
  const db = await dbPromise;
  return db.getAll(STORE_MUTATIONS);
}

export async function removeMutation(id: string): Promise<void> {
  const db = await dbPromise;
  await db.delete(STORE_MUTATIONS, id);
}

export async function clearMutations(): Promise<void> {
  const db = await dbPromise;
  await db.clear(STORE_MUTATIONS);
}

export async function countMutations(): Promise<number> {
  const db = await dbPromise;
  return db.count(STORE_MUTATIONS);
}
