import {
  hasPendingMobileCompletion,
  clearPendingMobileCompletion,
} from "./mobile-completion-gate";
import { userProfileHasMobile } from "./google-auth-mobile";

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

export function isInvalidLoginCredentials(message: string): boolean {
  return /invalid login credentials/i.test(message);
}
