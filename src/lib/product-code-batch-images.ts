import { createStore, get, set, del } from "idb-keyval";

const imgStore = createStore("saree-pc-batch-img", "v1");

export type StoredBatchImage = {
  code: string;
  mime: string;
  /** Raw base64 without data: URL prefix */
  dataBase64: string;
};

function imgKey(userId: string, batchId: string): string {
  return `img:${userId}:${batchId}`;
}

export async function putProductCodeBatchImages(
  userId: string,
  batchId: string,
  images: StoredBatchImage[]
): Promise<void> {
  if (typeof window === "undefined") return;
  await set(imgKey(userId, batchId), images, imgStore);
}

export async function getProductCodeBatchImages(
  userId: string,
  batchId: string
): Promise<StoredBatchImage[]> {
  if (typeof window === "undefined") return [];
  const v = await get<StoredBatchImage[]>(imgKey(userId, batchId), imgStore);
  return Array.isArray(v) ? v : [];
}

export async function deleteProductCodeBatchImages(userId: string, batchId: string): Promise<void> {
  if (typeof window === "undefined") return;
  await del(imgKey(userId, batchId), imgStore);
}

export function storedImageToBlob(entry: StoredBatchImage): Blob {
  const binary = atob(entry.dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: entry.mime || "image/jpeg" });
}

export function blobToBase64Payload(blob: Blob): Promise<{ mime: string; dataBase64: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = r.result as string;
      const comma = s.indexOf(",");
      const dataBase64 = comma >= 0 ? s.slice(comma + 1) : s;
      resolve({
        mime: blob.type || "image/jpeg",
        dataBase64,
      });
    };
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}
