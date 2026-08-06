"use client";

import React from "react";
import type { ChatwootChannel } from "@/lib/chatwoot-api";

const CHANNEL_META: Record<
  ChatwootChannel,
  { label: string; dot: string; pill: string }
> = {
  whatsapp: {
    label: "WhatsApp",
    dot: "bg-[#25D366]",
    pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  instagram: {
    label: "Instagram",
    dot: "bg-[#E1306C]",
    pill: "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
  },
  facebook: {
    label: "Facebook",
    dot: "bg-[#1877F2]",
    pill: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  email: {
    label: "Email",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  sms: {
    label: "SMS",
    dot: "bg-violet-500",
    pill: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  },
  telegram: {
    label: "Telegram",
    dot: "bg-sky-500",
    pill: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  },
  web: {
    label: "Website",
    dot: "bg-slate-500",
    pill: "bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
  },
  other: {
    label: "Other",
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
  },
};

export function channelLabel(channel: ChatwootChannel): string {
  return CHANNEL_META[channel].label;
}

export function ChannelDot({ channel }: { channel: ChatwootChannel }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${CHANNEL_META[channel].dot}`}
      title={CHANNEL_META[channel].label}
      aria-label={CHANNEL_META[channel].label}
    />
  );
}

export function ChannelBadge({ channel }: { channel: ChatwootChannel }) {
  const meta = CHANNEL_META[channel];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.pill}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}
