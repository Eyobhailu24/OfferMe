"use client";
import { useEffect, useState } from "react";
export type PendingPhoto = { id: string; draftKey: string; file: File };
let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("offerme-draft-photos", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("photos", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("Could not save this photo on the device."));
    });
  return database;
}
async function operation<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("photos", mode),
      request = run(tx.objectStore("photos"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function listPhotos(key: string) {
  return (
    (await operation("readonly", (store) => store.getAll())) as PendingPhoto[]
  ).filter((p) => p.draftKey === key);
}
export async function keepPhoto(key: string, file: File) {
  const photo = { id: crypto.randomUUID(), draftKey: key, file };
  await operation("readwrite", (store) => store.put(photo));
  window.dispatchEvent(new Event("offerme:photos"));
  return photo;
}
export async function removePhoto(id: string) {
  await operation("readwrite", (store) => store.delete(id));
  window.dispatchEvent(new Event("offerme:photos"));
}
export function usePendingPhotos(key: string) {
  const [ready, setReady] = useState(false);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]),
    [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listPhotos(key)
        .then((items) => {
          if (active) {
            setPhotos(items);
            setReady(true);
          }
        })
        .catch((e) => {
          if (active) {
            setError(e);
            setReady(true);
          }
        });
    };
    refresh();
    window.addEventListener("offerme:photos", refresh);
    return () => {
      active = false;
      window.removeEventListener("offerme:photos", refresh);
    };
  }, [key]);
  return { photos, error, ready };
}
