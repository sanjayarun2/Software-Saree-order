import { supabase } from "./supabase";

export type AdminWorkerRow = {
  id: string;
  admin_user_id: string;
  worker_email: string;
  created_at: string;
};

export async function listAdminWorkers(adminUserId: string): Promise<{
  data: AdminWorkerRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from("admin_workers")
    .select("id,admin_user_id,worker_email,created_at")
    .eq("admin_user_id", adminUserId)
    .order("created_at", { ascending: true });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as AdminWorkerRow[], error: null };
}

export async function addAdminWorker(
  adminUserId: string,
  workerEmail: string
): Promise<{ error: Error | null }> {
  const email = workerEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: new Error("Enter a valid email.") };
  }
  const { error } = await supabase.from("admin_workers").insert({
    admin_user_id: adminUserId,
    worker_email: email,
  });
  return { error: error ? new Error(error.message) : null };
}

export async function removeAdminWorker(rowId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("admin_workers").delete().eq("id", rowId);
  return { error: error ? new Error(error.message) : null };
}

/** True when the signed-in user's email is listed as a worker (not an admin managing workers). */
export async function fetchIsListedWorker(): Promise<{ isWorker: boolean; error: Error | null }> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) return { isWorker: false, error: new Error(sessionErr.message) };
  const email = sessionData.session?.user?.email?.trim().toLowerCase();
  if (!email) return { isWorker: false, error: null };

  const { data, error } = await supabase.from("admin_workers").select("id").eq("worker_email", email).maybeSingle();

  if (error) return { isWorker: false, error: new Error(error.message) };
  return { isWorker: data != null, error: null };
}
