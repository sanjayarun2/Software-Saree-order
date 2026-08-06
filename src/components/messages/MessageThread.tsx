"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import type { InboxConversation, InboxMessage } from "@/lib/chatwoot-api";
import { ChannelBadge } from "./ChannelBadge";

function formatClockTime(millis: number): string {
  if (!millis) return "";
  return new Date(millis).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(millis: number, now: number = Date.now()): string {
  if (!millis) return "";
  const date = new Date(millis);
  const today = new Date(now);
  const isSameDay = date.toDateString() === today.toDateString();
  if (isSameDay) return "Today";
  const yesterday = new Date(now - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

interface MessageThreadProps {
  conversation: InboxConversation;
  messages: InboxMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  onBack: () => void;
  onSend: (text: string) => Promise<boolean>;
  onResolve: () => void;
}

export function MessageThread({
  conversation,
  messages,
  loading,
  sending,
  error,
  onBack,
  onSend,
  onResolve,
}: MessageThreadProps) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Jump to the newest message when the thread or its contents change.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [conversation.id, messages.length]);

  useEffect(() => {
    setDraft("");
  }, [conversation.id]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const ok = await onSend(text);
    if (ok) setDraft("");
  };

  let lastDayLabel = "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-700/60">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 lg:hidden"
          aria-label={t("Back")}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {conversation.contactName}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <ChannelBadge channel={conversation.channel} />
            {conversation.contactIdentifier ? (
              <span className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                {conversation.contactIdentifier}
              </span>
            ) : null}
          </div>
        </div>

        <Link
          href="/add-order/"
          className="hidden shrink-0 rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 sm:block"
        >
          {t("New order")}
        </Link>
        {conversation.status !== "resolved" ? (
          <button
            type="button"
            onClick={onResolve}
            className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {t("Resolve")}
          </button>
        ) : (
          <span className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {t("Resolved")}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-3 py-4 dark:bg-slate-900/40"
      >
        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t("No messages in this conversation yet.")}
          </p>
        ) : (
          messages.map((message) => {
            const dayLabel = formatDayLabel(message.createdAt);
            const showDay = dayLabel !== lastDayLabel;
            lastDayLabel = dayLabel;

            return (
              <React.Fragment key={message.id}>
                {showDay && dayLabel ? (
                  <p className="py-2 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    {dayLabel}
                  </p>
                ) : null}
                <div className={`flex ${message.incoming ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${
                      message.incoming
                        ? "rounded-bl-md bg-white text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                        : "rounded-br-md bg-primary-600 text-white"
                    }`}
                  >
                    {message.attachmentUrls.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt=""
                        className="mb-1.5 max-h-56 w-full rounded-xl object-cover"
                      />
                    ))}
                    {message.content ? (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {message.content}
                      </p>
                    ) : null}
                    <p
                      className={`mt-1 text-right text-[10px] ${
                        message.incoming
                          ? "text-slate-400 dark:text-slate-400"
                          : "text-white/70"
                      }`}
                    >
                      {message.failed ? `${t("Failed")} · ` : ""}
                      {formatClockTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      {error ? (
        <p className="shrink-0 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-2.5 dark:border-slate-700/60 dark:bg-slate-800/60">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder={t("Type a reply…")}
            className="max-h-32 min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !draft.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white transition hover:bg-primary-700 disabled:opacity-40"
            aria-label={t("Send")}
          >
            {sending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.997.997 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
