import { supabase } from "./supabase";

function twoFromUuid(id: string): string {
  const s = id.replace(/-/g, "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const a = 65 + (Math.abs(h) % 26);
  const b = 65 + (Math.abs(h >> 7) % 26);
  return String.fromCharCode(a) + String.fromCharCode(b);
}

function randomTwo(): string {
  const r = () => 65 + Math.floor(Math.random() * 26);
  return String.fromCharCode(r(), r());
}

/**
 * Ensures user_profiles.product_code_prefix is set (2 letters, globally unique). Lazy on first use.
 */
export async function ensureProductCodePrefix(): Promise<string> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    throw new Error("Not signed in");
  }

  const readPrefix = async (): Promise<string | null> => {
    const { data } = await supabase
      .from("user_profiles")
      .select("product_code_prefix")
      .eq("user_id", user.id)
      .maybeSingle();
    const p = data?.product_code_prefix;
    return p && String(p).length >= 1 ? String(p).toUpperCase().slice(0, 2).padEnd(2, "X") : null;
  };

  const existing = await readPrefix();
  if (existing && existing.length === 2) return existing;

  for (let attempt = 0; attempt < 48; attempt++) {
    const candidate = (attempt === 0 ? twoFromUuid(user.id) : randomTwo()).toUpperCase();

    const { data: updated, error: updErr } = await supabase
      .from("user_profiles")
      .update({ product_code_prefix: candidate, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("product_code_prefix", null)
      .select("product_code_prefix")
      .maybeSingle();

    if (!updErr && updated?.product_code_prefix) {
      return String(updated.product_code_prefix).toUpperCase().slice(0, 2);
    }

    const again = await readPrefix();
    if (again && again.length === 2) return again;

    const { error: insErr } = await supabase.from("user_profiles").insert({
      user_id: user.id,
      email: user.email ?? null,
      product_code_prefix: candidate,
      updated_at: new Date().toISOString(),
    });

    if (!insErr) {
      const afterIns = await readPrefix();
      if (afterIns) return afterIns;
    }

    const dup =
      insErr?.code === "23505" ||
      insErr?.message?.includes("duplicate") ||
      updErr?.code === "23505" ||
      updErr?.message?.includes("duplicate");
    if (!dup && insErr && !insErr.message?.includes("duplicate")) {
      console.warn("[product-code-prefix] insert:", insErr.message);
    }
  }

  const finalRead = await readPrefix();
  if (finalRead) return finalRead;

  throw new Error("Could not assign product code. Try again or run DB migration for product_code_prefix.");
}
