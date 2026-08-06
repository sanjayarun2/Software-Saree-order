"use client";

import React from "react";
import type { InboxConversation } from "@/lib/chatwoot-api";
import { ChannelDot } from "./ChannelBadge";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatRelativeTime(millis: number, now: number = Date.now()): string {
  if (!millis) return "";
  const diff = Math.max(0, now - millis);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(millis).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

interface ConversationListProps {
  conversations: InboxConversation[];
  selectedId: number | null;
  onSelect: (conversation: InboxConversation) => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
      {conversations.map((conversation) => {
        const active = conversation.id === selectedId;
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation)}
              className={`flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                active
                  ? "bg-primary-50 dark:bg-primary-900/30"
                  : "hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-700/40 dark:active:bg-slate-700/60"
              }`}
            >
              <span className="relative shrink-0">
                {conversation.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={conversation.avatarUrl}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-600 dark:bg-primary-900 dark:text-primary-300">
                    {initials(conversation.contactName)}
                  </span>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-[2px] dark:bg-slate-800">
                  <ChannelDot channel={conversation.channel} />
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {conversation.contactName}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                    {formatRelativeTime(conversation.lastActivityAt)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {conversation.lastMessage || "No messages yet"}
                  </span>
                  {conversation.unreadCount > 0 ? (
                    <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                      {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
