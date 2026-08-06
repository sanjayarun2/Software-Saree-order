"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConversationList } from "@/components/messages/ConversationList";
import { MessageThread } from "@/components/messages/MessageThread";
import {
  getChatwootSettings,
  isChatwootConfigured,
} from "@/lib/chatwoot-settings-supabase";
import {
  listConversations,
  listMessages,
  sendMessage,
  setConversationStatus,
  type ChatwootChannel,
  type InboxConversation,
  type InboxMessage,
} from "@/lib/chatwoot-api";

const POLL_INTERVAL_MS = 20000;

const STATUS_TABS = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
] as const;

type StatusFilter = (typeof STATUS_TABS)[number]["value"];

const CHANNEL_FILTERS = [
  { value: "all", label: "All channels" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
] as const;

type ChannelFilter = (typeof CHANNEL_FILTERS)[number]["value"];

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [checkingSetup, setCheckingSetup] = useState(true);
  const [connected, setConnected] = useState(false);

  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [search, setSearch] = useState("");

  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const row = await getChatwootSettings(user.id);
      if (cancelled) return;
      setConnected(isChatwootConfigured(row));
      setCheckingSetup(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const refreshConversations = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoadingList(true);
      try {
        const rows = await listConversations({ status: statusFilter });
        setConversations(rows);
        setListError(null);
      } catch (e) {
        setListError((e as Error).message);
      } finally {
        setLoadingList(false);
      }
    },
    [statusFilter]
  );

  const refreshThread = useCallback(
    async (conversationId: number, options?: { silent?: boolean }) => {
      if (!options?.silent) setLoadingThread(true);
      try {
        const rows = await listMessages(conversationId);
        // Discard results for a thread the user has already navigated away from.
        if (selectedIdRef.current !== conversationId) return;
        setMessages(rows);
        setThreadError(null);
      } catch (e) {
        if (selectedIdRef.current !== conversationId) return;
        setThreadError((e as Error).message);
      } finally {
        if (selectedIdRef.current === conversationId) setLoadingThread(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!connected) return;
    void refreshConversations();
  }, [connected, refreshConversations]);

  useEffect(() => {
    if (!connected || selectedId === null) return;
    void refreshThread(selectedId);
  }, [connected, selectedId, refreshThread]);

  // Background refresh only while the app is actually on screen.
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshConversations({ silent: true });
      const current = selectedIdRef.current;
      if (current !== null) void refreshThread(current, { silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connected, refreshConversations, refreshThread]);

  const visibleConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (channelFilter !== "all" && conversation.channel !== (channelFilter as ChatwootChannel)) {
        return false;
      }
      if (!query) return true;
      return (
        conversation.contactName.toLowerCase().includes(query) ||
        conversation.contactIdentifier.toLowerCase().includes(query) ||
        conversation.lastMessage.toLowerCase().includes(query)
      );
    });
  }, [conversations, channelFilter, search]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const handleSelect = useCallback((conversation: InboxConversation) => {
    setSelectedId(conversation.id);
    setMessages([]);
    setThreadError(null);
    // Clear the badge locally; Chatwoot marks it read on its own next sync.
    setConversations((prev) =>
      prev.map((c) => (c.id === conversation.id ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      if (selectedId === null) return false;
      setSending(true);
      setThreadError(null);
      try {
        const sent = await sendMessage(selectedId, text);
        setMessages((prev) => [...prev, sent]);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? { ...c, lastMessage: text, lastActivityAt: Date.now() }
              : c
          )
        );
        return true;
      } catch (e) {
        setThreadError((e as Error).message);
        return false;
      } finally {
        setSending(false);
      }
    },
    [selectedId]
  );

  const handleResolve = useCallback(async () => {
    if (selectedId === null) return;
    try {
      await setConversationStatus(selectedId, "resolved");
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, status: "resolved" } : c))
      );
      void refreshConversations({ silent: true });
    } catch (e) {
      setThreadError((e as Error).message);
    }
  }, [selectedId, refreshConversations]);

  if (loading || checkingSetup) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  if (!connected) {
    return (
      <ErrorBoundary>
        <div className="mx-auto max-w-lg space-y-4 px-4 py-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100 text-3xl dark:bg-primary-900/50">
            💬
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("Messages")}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t(
              "Bring WhatsApp, Instagram and Facebook chats into one inbox. Connect your messaging server to get started."
            )}
          </p>
          <Link
            href="/settings/messages/"
            className="inline-block rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            {t("Connect messages")}
          </Link>
        </div>
      </ErrorBoundary>
    );
  }

  const showThreadOnMobile = selectedConversation !== null;

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-6xl px-0 py-0 lg:px-10 lg:py-6">
        <div className="hidden items-center justify-between lg:flex">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">
            {t("Messages")}
          </h1>
          <Link
            href="/settings/messages/"
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {t("Connection settings")}
          </Link>
        </div>

        <div className="mt-0 flex h-[calc(100dvh-10.5rem)] overflow-hidden border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60 lg:mt-4 lg:h-[calc(100dvh-11rem)] lg:rounded-2xl lg:border">
          {/* Conversation list: full width on mobile until a thread is open */}
          <section
            className={`flex min-h-0 w-full flex-col border-slate-200 dark:border-slate-700 lg:w-[340px] lg:shrink-0 lg:border-r ${
              showThreadOnMobile ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="shrink-0 space-y-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-700/60">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search customer or message")}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900/60">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                      statusFilter === tab.value
                        ? "bg-primary-500 text-white dark:bg-primary-600"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {t(tab.label)}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {CHANNEL_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setChannelFilter(filter.value)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                      channelFilter === filter.value
                        ? "bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300"
                    }`}
                  >
                    {t(filter.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {listError ? (
                <div className="space-y-3 px-4 py-6 text-center">
                  <p className="text-sm text-red-600 dark:text-red-400">{listError}</p>
                  <button
                    type="button"
                    onClick={() => void refreshConversations()}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  >
                    {t("Retry")}
                  </button>
                </div>
              ) : loadingList && conversations.length === 0 ? (
                <div className="flex justify-center py-10">
                  <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
                </div>
              ) : visibleConversations.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  {conversations.length === 0
                    ? t("No conversations yet.")
                    : t("No conversations match this filter.")}
                </p>
              ) : (
                <ConversationList
                  conversations={visibleConversations}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                />
              )}
            </div>
          </section>

          {/* Thread pane */}
          <section
            className={`min-h-0 min-w-0 flex-1 ${showThreadOnMobile ? "flex" : "hidden lg:flex"}`}
          >
            {selectedConversation ? (
              <div className="min-h-0 w-full">
                <MessageThread
                  conversation={selectedConversation}
                  messages={messages}
                  loading={loadingThread}
                  sending={sending}
                  error={threadError}
                  onBack={() => setSelectedId(null)}
                  onSend={handleSend}
                  onResolve={() => void handleResolve()}
                />
              </div>
            ) : (
              <div className="flex w-full items-center justify-center px-6 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("Select a conversation to start replying.")}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </ErrorBoundary>
  );
}
