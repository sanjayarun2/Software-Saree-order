import { supabase } from "./supabase";
import { indexToGlobalProductPrefix } from "./product-code-prefix-encoding";

function normalizeStoredPrefix(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
}

/**
 * Ensures user_profiles.product_code_prefix is set. Values come from the central
 * DB counter (claim_next_product_prefix_index) in order: A0…A9, AA…AZ, B0…, …, ZZ, A00, …
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
    return normalizeStoredPrefix(data?.product_code_prefix as string | undefined);
  };

  const existing = await readPrefix();
  if (existing != null && existing.length >= 1) {
    return existing;
  }

  for (let attempt = 0; attempt < 128; attempt++) {
    const { data: idxRaw, error: rpcErr } = await supabase.rpc("claim_next_product_prefix_index");
    if (rpcErr) {
      console.error("[product-code-prefix] claim_next_product_prefix_index:", rpcErr.message);
      throw new Error(
        "Could not claim product prefix. Run the Supabase migration add_product_code_prefix_counter.sql."
      );
    }
    if (idxRaw == null && idxRaw !== 0) {
      throw new Error("Prefix counter returned no value.");
    }
    const candidate = indexToGlobalProductPrefix(Number(idxRaw));

    const { data: updated, error: updErr } = await supabase
      .from("user_profiles")
      .update({ product_code_prefix: candidate, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("product_code_prefix", null)
      .select("product_code_prefix")
      .maybeSingle();

    if (!updErr && updated?.product_code_prefix) {
      return normalizeStoredPrefix(updated.product_code_prefix as string) ?? candidate;
    }

    const again = await readPrefix();
    if (again != null && again.length >= 1) return again;

    const { error: insErr } = await supabase.from("user_profiles").insert({
      user_id: user.id,
      email: user.email ?? null,
      product_code_prefix: candidate,
      updated_at: new Date().toISOString(),
    });

    if (!insErr) {
      const afterIns = await readPrefix();
      if (afterIns != null && afterIns.length >= 1) return afterIns;
    }

    const dup =
      insErr?.code === "23505" ||
      (insErr?.message ?? "").includes("duplicate") ||
      updErr?.code === "23505" ||
      (updErr?.message ?? "").includes("duplicate");

    if (!dup && insErr) {
      console.warn("[product-code-prefix] insert:", insErr.message);
    }
  }

  const finalRead = await readPrefix();
  if (finalRead != null && finalRead.length >= 1) return finalRead;

  throw new Error("Could not assign product code prefix. Try again.");
}
