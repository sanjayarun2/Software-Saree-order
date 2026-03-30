import { createStore, del, get, set } from "idb-keyval";

const sourceDraftStore = createStore("saree-pc-source-draft", "v1");

type StoredSourceImage = {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
};

function sourceDraftKey(draftId: string): string {
  return `draft:${draftId}`;
}

export async function putProductCodeSourceDraft(draftId: string, files: File[]): Promise<void> {
  if (typeof window === "undefined") return;
  const rows: StoredSourceImage[] = files.map((file) => ({
    name: file.name,
    type: file.type || "image/jpeg",
    lastModified: file.lastModified || Date.now(),
    blob: file,
  }));
  await set(sourceDraftKey(draftId), rows, sourceDraftStore);
}

export async function getProductCodeSourceDraftFiles(draftId: string): Promise<File[]> {
  if (typeof window === "undefined") return [];
  const rows = (await get<StoredSourceImage[]>(sourceDraftKey(draftId), sourceDraftStore)) ?? [];
  return rows.map(
    (row) =>
      new File([row.blob], row.name, {
        type: row.type || row.blob.type || "image/jpeg",
        lastModified: row.lastModified || Date.now(),
      }),
  );
}

export async function deleteProductCodeSourceDraft(draftId: string): Promise<void> {
  if (typeof window === "undefined") return;
  await del(sourceDraftKey(draftId), sourceDraftStore);
}
