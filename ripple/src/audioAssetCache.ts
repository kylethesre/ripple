const DB_NAME = 'ripple-audio-assets';
const DB_VERSION = 1;
const STORE_NAME = 'encoded-assets';

export type CachedAudioAsset = {
  key: string;
  mimeType: string;
  byteSize: number;
  data: ArrayBuffer;
  cachedAt: number;
};

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function assetCacheKey(assetId: bigint, byteSize: bigint, createdAtMicros: bigint) {
  return `${assetId.toString()}:${byteSize.toString()}:${createdAtMicros.toString()}`;
}

export async function getCachedAudioAsset(key: string): Promise<CachedAudioAsset | undefined> {
  const db = await openCacheDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const value = await requestToPromise<CachedAudioAsset | undefined>(tx.objectStore(STORE_NAME).get(key));
  db.close();
  return value;
}

export async function putCachedAudioAsset(asset: Omit<CachedAudioAsset, 'cachedAt'>): Promise<void> {
  const db = await openCacheDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await requestToPromise(tx.objectStore(STORE_NAME).put({ ...asset, cachedAt: Date.now() }));
  db.close();
}

export async function deleteCachedAudioAsset(key: string): Promise<void> {
  const db = await openCacheDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await requestToPromise(tx.objectStore(STORE_NAME).delete(key));
  db.close();
}

export function base64ChunksToArrayBuffer(chunks: readonly string[]): ArrayBuffer {
  const binary = atob(chunks.join(''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function arrayBufferToBase64Chunks(buffer: ArrayBuffer, chunkBytes = 96 * 1024): string[] {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const slice = bytes.subarray(offset, offset + chunkBytes);
    let binary = '';
    for (const byte of slice) binary += String.fromCharCode(byte);
    chunks.push(btoa(binary));
  }
  return chunks;
}
