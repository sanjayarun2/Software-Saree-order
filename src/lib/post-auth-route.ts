import {
  hasPendingMobileCompletion,
  clearPendingMobileCompletion,
} from "./mobile-completion-gate";
import { userProfileHasMobile } from "./google-auth-mobile";
import { consumePendingNavigation } from "./pending-navigation";

export type PostAuthPath = "/complete-mobile/" | "/dashboard/";

/** After login or signup: mobile popup only when signup left a pending mobile flag. */
export async function resolvePostAuthRoute(userId: string): Promise<PostAuthPath> {
  if (!hasPendingMobileCompletion()) {
    return "/dashboard/";
  }

  const hasMobile = await userProfileHasMobile(userId);
  if (!hasMobile) {
    return "/complete-mobile/";
  }

  clearPendingMobileCompletion();
  return "/dashboard/";
}

/** Post-login destination: pending notification/deep link first, then mobile gate, then dashboard. */
export async function resolvePostLoginRoute(userId: string): Promise<string> {
  const pending = consumePendingNavigation();
  if (pending) return pending;
  return resolvePostAuthRoute(userId);
}

export function isInvalidLoginCredentials(message: string): boolean {
  return /invalid login credentials/i.test(message);
}
