import { supabase } from "./supabase";

export type PushPlatform = "android" | "ios" | "web";

export async function upsertPushDeviceToken(
  userId: string,
  token: string,
  platform: PushPlatform,
  deviceId?: string | null
): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;

  const { error } = await supabase.from("push_device_tokens").upsert(
    {
      user_id: userId,
      token: trimmed,
      platform,
      device_id: deviceId?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" }
  );

  if (error) {
    console.warn("[Push] upsert token failed:", error.message);
  }
}

export async function removePushDeviceToken(
  userId: string,
  token: string
): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;

  const { error } = await supabase
    .from("push_device_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("token", trimmed);

  if (error) {
    console.warn("[Push] remove token failed:", error.message);
  }
}
