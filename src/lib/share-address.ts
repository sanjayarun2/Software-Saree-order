import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface ShareAddressPlugin {
  getPending(): Promise<{ text: string }>;
  addListener(
    eventName: "shareAddress",
    listenerFunc: (event: { text: string }) => void
  ): Promise<PluginListenerHandle>;
}

export const ShareAddress = registerPlugin<ShareAddressPlugin>("ShareAddress");

const STORAGE_KEY = "velo:pending-shared-address";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Stash shared address for Add Order (survives navigation / login). */
export function stashSharedAddress(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, trimmed);
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("velo-shared-address", { detail: trimmed })
    );
  }
}

export function peekSharedAddress(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/** Read and clear pending shared address. */
export function consumeSharedAddress(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const value = store.getItem(STORAGE_KEY);
    if (value) store.removeItem(STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}
