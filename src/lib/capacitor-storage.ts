/**
 * Capacitor Preferences-based storage for Supabase session persistence.
 * Ensures session survives app close (until device restart or logout).
 */
const PREFIX = "saree_sb_";

function prefixedKey(key: string): string {
  return PREFIX + key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export const capacitorStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: prefixedKey(key) });
      return value;
    } catch {
      return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: prefixedKey(key), value });
    } catch {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === "undefined") return;
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key: prefixedKey(key) });
    } catch {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    }
  },
};

export async function clearSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { keys } = await Preferences.keys();
    for (const k of keys) {
      if (k.startsWith(PREFIX)) await Preferences.remove({ key: k });
    }
  } catch {
    if (typeof localStorage !== "undefined") {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("sb-"));
      keys.forEach((k) => localStorage.removeItem(k));
    }
  }
}
