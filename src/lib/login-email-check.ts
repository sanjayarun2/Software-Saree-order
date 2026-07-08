import { supabase } from "./supabase";

export type LoginCredentialFailureKind =
  | "wrong_password"
  | "email_not_registered"
  | "unknown";

/** Distinguish wrong password vs unregistered email after Invalid login credentials. */
export async function classifyLoginCredentialFailure(
  email: string
): Promise<LoginCredentialFailureKind> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return "unknown";

  const { data, error } = await supabase.rpc("check_auth_email_exists", {
    lookup_email: trimmed,
  });

  if (error) {
    console.warn("[Login] check_auth_email_exists failed:", error.message);
    return "unknown";
  }

  return data === true ? "wrong_password" : "email_not_registered";
}
