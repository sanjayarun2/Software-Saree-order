import type { User } from "@supabase/supabase-js";
import { getOrCreateDeviceId } from "./device-id";
import {
  resolveDeviceForSession,
  markSessionEndedForDeviceLimit,
} from "./user-devices-supabase";
import { clearSession } from "./capacitor-storage";
import { clearLastSyncTimestamp } from "./local-store";
import { supabase } from "./supabase";
import { consumeGoogleAuthIntent } from "./google-auth-intent";
import { markPendingMobileCompletion } from "./mobile-completion-gate";
import { userProfileHasMobile } from "./google-auth-mobile";

export type GoogleAuthFinishRoute =
  | { ok: true; path: "/dashboard/" }
  | { ok: true; path: "/complete-mobile/" }
  | { ok: false; path: "/login/"; query?: string };

export async function finishGoogleAuthSession(user: User): Promise<GoogleAuthFinishRoute> {
  const intent = consumeGoogleAuthIntent() ?? "login";

  if (intent === "signup") {
    const hasMobile = await userProfileHasMobile(user.id);
    if (!hasMobile) {
      markPendingMobileCompletion();
      return { ok: true, path: "/complete-mobile/" };
    }
  }

  const deviceId = getOrCreateDeviceId();
  if (deviceId) {
    const r = await resolveDeviceForSession(user.id, deviceId);
    if (!r.ok) {
      markSessionEndedForDeviceLimit();
      await supabase.auth.signOut();
      await clearSession();
      return { ok: false, path: "/login/", query: "device_limit=1" };
    }
  }

  void clearLastSyncTimestamp(user.id).catch(() => {});
  return { ok: true, path: "/dashboard/" };
}
