import { supabase } from "./supabase";

export async function logReferralShare(params: {
  userId: string;
  link: string;
  channel?: string;
}): Promise<void> {
  const { userId, link, channel = "whatsapp" } = params;
  try {
    const { error } = await supabase.from("referral_events").insert({
      user_id: userId,
      link,
      channel,
    });
    if (error) {
      console.warn("[Referral] Failed to log referral share:", error);
    }
  } catch (e) {
    console.warn("[Referral] Unexpected error logging referral share:", e);
  }
}

