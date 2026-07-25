/**
 * Default FROM (sender) address per user account.
 * - Instant: localStorage keyed by user_id
 * - Durable: user_profiles.default_from_address in Supabase (tied to login / email account)
 */
import { supabase } from "./supabase";

const LEGACY_STORAGE_KEY = "saree_default_from_address_v1";
const STORAGE_PREFIX = "saree_default_from_address_v2:";
const PLACEHOLDER_FROM = "Shop Address";
const MAX_LEN = 800;
const REMOTE_DEBOUNCE_MS = 600;

const remoteSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hydrateInFlight = new Map<string, Promise<string>>();

function normalizeFrom(text: string): string {
  return text.replace(/\r\n/g, "\n").trim().slice(0, MAX_LEN);
}

function isWeakFrom(text: string): boolean {
  const t = normalizeFrom(text);
  if (!t) return true;
  if (t === PLACEHOLDER_FROM) return true;
  return false;
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function migrateLegacyIfNeeded(userId: string): string {
  if (typeof window === "undefined" || !userId) return "";
  try {
    const scoped = window.localStorage.getItem(storageKey(userId));
    if (scoped != null) return normalizeFrom(scoped);
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy == null) return "";
    const n = normalizeFrom(legacy);
    if (!isWeakFrom(n)) {
      window.localStorage.setItem(storageKey(userId), n);
    }
    return n;
  } catch {
    return "";
  }
}

/** Sync read for immediate UI — scoped to the logged-in user. */
export function readDefaultFromAddress(userId?: string | null): string {
  if (typeof window === "undefined" || !userId) return "";
  try {
    const migrated = migrateLegacyIfNeeded(userId);
    if (migrated) return migrated;
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw == null) return "";
    return normalizeFrom(raw);
  } catch {
    return "";
  }
}

function writeLocal(userId: string, text: string): boolean {
  if (typeof window === "undefined" || !userId) return false;
  const next = normalizeFrom(text);
  if (isWeakFrom(next)) return false;
  try {
    window.localStorage.setItem(storageKey(userId), next);
    return true;
  } catch {
    return false;
  }
}

async function upsertRemote(userId: string, text: string): Promise<void> {
  const next = normalizeFrom(text);
  if (!userId || isWeakFrom(next)) return;
  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      default_from_address: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    console.warn("[FROM] failed to save default_from_address:", error.message);
  }
}

function scheduleRemoteSave(userId: string, text: string): void {
  const prev = remoteSaveTimers.get(userId);
  if (prev) clearTimeout(prev);
  remoteSaveTimers.set(
    userId,
    setTimeout(() => {
      remoteSaveTimers.delete(userId);
      void upsertRemote(userId, text);
    }, REMOTE_DEBOUNCE_MS)
  );
}

/**
 * Persist FROM for this account: local immediately, DB shortly after.
 * Empty / placeholder does not wipe a good address.
 */
export function writeDefaultFromAddress(
  text: string,
  userId?: string | null
): boolean {
  if (!userId) return false;
  const next = normalizeFrom(text);
  if (isWeakFrom(next)) return false;
  const ok = writeLocal(userId, next);
  if (ok) scheduleRemoteSave(userId, next);
  return ok;
}

/** Flush pending remote save (e.g. before leaving Add Order). */
export async function flushDefaultFromAddress(userId?: string | null): Promise<void> {
  if (!userId) return;
  const timer = remoteSaveTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    remoteSaveTimers.delete(userId);
  }
  const local = readDefaultFromAddress(userId);
  if (local) await upsertRemote(userId, local);
}

/**
 * Load FROM from DB into local cache (cross-device / reinstall).
 * Prefer non-empty DB; keep local if DB empty.
 */
export async function hydrateDefaultFromAddress(
  userId?: string | null
): Promise<string> {
  if (!userId) return "";
  const existing = hydrateInFlight.get(userId);
  if (existing) return existing;

  const job = (async () => {
    const local = readDefaultFromAddress(userId);
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("default_from_address")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.warn("[FROM] hydrate failed:", error.message);
        return local;
      }
      const remote = normalizeFrom(data?.default_from_address ?? "");
      if (!isWeakFrom(remote)) {
        writeLocal(userId, remote);
        return remote;
      }
      // Local has a value DB doesn't — push it up once.
      if (local) {
        await upsertRemote(userId, local);
        return local;
      }
      return "";
    } catch (e) {
      console.warn("[FROM] hydrate error:", e);
      return local;
    } finally {
      hydrateInFlight.delete(userId);
    }
  })();

  hydrateInFlight.set(userId, job);
  return job;
}

export function seedDefaultFromAddressIfEmpty(
  text: string,
  userId?: string | null
): string {
  if (!userId) return "";
  const existing = readDefaultFromAddress(userId);
  if (existing) return existing;
  if (writeDefaultFromAddress(text, userId)) return normalizeFrom(text);
  return existing;
}

export function resolveDefaultFromAddress(
  userId: string | null | undefined,
  ...candidates: Array<string | null | undefined>
): string {
  const cached = readDefaultFromAddress(userId);
  if (cached) return cached;
  for (const c of candidates) {
    const n = normalizeFrom(c ?? "");
    if (!isWeakFrom(n)) {
      writeDefaultFromAddress(n, userId);
      return n;
    }
  }
  return PLACEHOLDER_FROM;
}

export function resolveFromAddressForLabel(
  orderSenderDetails: string | null | undefined,
  userId?: string | null
): string {
  const onOrder = normalizeFrom(orderSenderDetails ?? "");
  if (!isWeakFrom(onOrder)) return onOrder;
  const cached = readDefaultFromAddress(userId);
  if (cached) return cached;
  return onOrder || PLACEHOLDER_FROM;
}

export { PLACEHOLDER_FROM };
