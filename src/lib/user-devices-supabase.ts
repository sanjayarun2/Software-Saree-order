import { supabase } from "./supabase";

export type UserDeviceRow = {
  id: string;
  user_id: string;
  device_id: string;
  last_seen_at: string;
  created_at: string;
};

/** Use `error.message === AUTH_ERROR_DEVICE_LIMIT` after sign-in (strict single-device only). */
export const AUTH_ERROR_DEVICE_LIMIT = "AUTH_DEVICE_LIMIT";

const SESSION_STORAGE_DEVICE_LIMIT = "saree_device_limit";
const SESSION_STORAGE_DEVICE_EVICTED = "saree_device_slot_evicted";

export function markSessionEndedForDeviceLimit(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_STORAGE_DEVICE_LIMIT, "1");
  } catch {
    /* ignore */
  }
}

export function consumeDeviceLimitRedirectFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(SESSION_STORAGE_DEVICE_LIMIT) !== "1") return false;
    sessionStorage.removeItem(SESSION_STORAGE_DEVICE_LIMIT);
    return true;
  } catch {
    return false;
  }
}

/** After LRU eviction (max_devices ≥ 2); consumed once to show a short modal + WhatsApp. */
export function markDeviceSlotEvicted(maxDevices: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_STORAGE_DEVICE_EVICTED, JSON.stringify({ maxDevices }));
  } catch {
    /* ignore */
  }
}

export function consumeDeviceSlotEvicted(): { maxDevices: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_DEVICE_EVICTED);
    if (!raw) return null;
    sessionStorage.removeItem(SESSION_STORAGE_DEVICE_EVICTED);
    const j = JSON.parse(raw) as { maxDevices?: number };
    return typeof j.maxDevices === "number" ? { maxDevices: j.maxDevices } : null;
  } catch {
    return null;
  }
}

function clampMaxDevices(raw: unknown): number {
  const m = Math.floor(Number(raw));
  if (!Number.isFinite(m)) return 2;
  return Math.min(20, Math.max(1, m));
}

export type ResolveDeviceResult =
  | { ok: true; evicted?: boolean; maxDevices?: number }
  | { ok: false };

/**
 * max_devices === 1: strict — new device blocked if a slot is already used.
 * max_devices >= 2: LRU — oldest last_seen row removed when over limit, then new device registered.
 */
export async function resolveDeviceForSession(
  userId: string,
  deviceId: string
): Promise<ResolveDeviceResult> {
  if (!deviceId) return { ok: true };

  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("user_devices")
    .select("id")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("user_devices").update({ last_seen_at: now }).eq("id", existing.id);
    return { ok: true };
  }

  const { data: prof } = await supabase
    .from("user_profiles")
    .select("max_devices")
    .eq("user_id", userId)
    .maybeSingle();

  const maxDevices = clampMaxDevices(prof?.max_devices ?? 2);

  const { count, error: countErr } = await supabase
    .from("user_devices")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const tryInsert = async (): Promise<ResolveDeviceResult> => {
    const { error: insErr } = await supabase.from("user_devices").insert({
      user_id: userId,
      device_id: deviceId,
      last_seen_at: now,
    });
    if (!insErr) return { ok: true };
    if (insErr.code === "23505") {
      await supabase.from("user_devices").update({ last_seen_at: now }).eq("user_id", userId).eq("device_id", deviceId);
      return { ok: true };
    }
    return { ok: false };
  };

  if (countErr) {
    return tryInsert();
  }

  const n = count ?? 0;

  if (maxDevices === 1) {
    if (n >= 1) return { ok: false };
    return tryInsert();
  }

  if (n < maxDevices) {
    return tryInsert();
  }

  const { data: oldest } = await supabase
    .from("user_devices")
    .select("id")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!oldest?.id) {
    return tryInsert();
  }

  const { error: delErr } = await supabase.from("user_devices").delete().eq("id", oldest.id);
  if (delErr) return { ok: false };

  const inserted = await tryInsert();
  if (!inserted.ok) return inserted;
  return { ok: true, evicted: true, maxDevices };
}

export async function listUserDevices(userId: string): Promise<{
  data: UserDeviceRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from("user_devices")
    .select("id,user_id,device_id,last_seen_at,created_at")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as UserDeviceRow[], error: null };
}

export async function removeUserDevice(deviceRowId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("user_devices").delete().eq("id", deviceRowId);
  return { error: error ? new Error(error.message) : null };
}
