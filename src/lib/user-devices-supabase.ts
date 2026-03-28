import { supabase } from "./supabase";

export type UserDeviceRow = {
  id: string;
  user_id: string;
  device_id: string;
  last_seen_at: string;
  created_at: string;
};

/** Use `error.message === AUTH_ERROR_DEVICE_LIMIT` after sign-in. */
export const AUTH_ERROR_DEVICE_LIMIT = "AUTH_DEVICE_LIMIT";

const SESSION_STORAGE_DEVICE_LIMIT = "saree_device_limit";

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

function clampMaxDevices(raw: unknown): number {
  const m = Math.floor(Number(raw));
  if (!Number.isFinite(m)) return 2;
  return Math.min(20, Math.max(1, m));
}

/**
 * Registers or refreshes this device. If the user already has `max_devices` rows
 * (from `user_profiles.max_devices`, default 2) and this device_id is new, returns ok: false.
 */
export async function resolveDeviceForSession(
  userId: string,
  deviceId: string
): Promise<{ ok: true } | { ok: false }> {
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

  if (countErr) {
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
  }

  if ((count ?? 0) >= maxDevices) {
    return { ok: false };
  }

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
