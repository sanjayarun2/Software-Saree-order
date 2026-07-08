"use client";

import React, { createContext, useContext, useEffect, useRef } from "react";
import { useAuth } from "./auth-context";
import { initOrderAlertService, teardownOrderAlertService } from "./order-alert-service";
import {
  initPushRegistration,
  teardownPushRegistration,
} from "./push-registration-service";
import { initSyncManager, teardownSyncManager } from "./sync-manager";
import { fullSync } from "./order-service";
import { resetSyncCoalesceState } from "./sync-coalesce";

interface DataContextValue {
  ready: boolean;
}

const DataContext = createContext<DataContextValue>({ ready: false });

const NATIVE_SERVICES_DEFER_MS = 2000;

async function fullSyncWithRetry(uid: string): Promise<void> {
  try {
    await fullSync(uid);
  } catch (err) {
    if (err instanceof TypeError && /failed to fetch|network/i.test(err.message)) {
      await new Promise((r) => setTimeout(r, 2000));
      await fullSync(uid).catch(() => {});
    }
  }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const syncedRef = useRef<string | null>(null);
  const nativeServicesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = React.useState(false);

  useEffect(() => {
    if (!user) {
      if (nativeServicesTimerRef.current != null) {
        clearTimeout(nativeServicesTimerRef.current);
        nativeServicesTimerRef.current = null;
      }
      teardownSyncManager();
      void teardownOrderAlertService();
      void teardownPushRegistration();
      resetSyncCoalesceState();
      syncedRef.current = null;
      setReady(false);
      return;
    }

    if (syncedRef.current === user.id) return;
    syncedRef.current = user.id;

    fullSyncWithRetry(user.id)
      .finally(() => {
        setReady(true);
        initSyncManager(user.id);
      });

    // Defer native notification/FCM setup until after first screen paint + sync start.
    nativeServicesTimerRef.current = setTimeout(() => {
      nativeServicesTimerRef.current = null;
      try {
        initOrderAlertService();
      } catch (e) {
        console.warn("[DataProvider] order alerts init failed:", e);
      }
      void initPushRegistration(user.id).catch((e) => {
        console.warn("[DataProvider] push init failed:", e);
      });
    }, NATIVE_SERVICES_DEFER_MS);

    return () => {
      if (nativeServicesTimerRef.current != null) {
        clearTimeout(nativeServicesTimerRef.current);
        nativeServicesTimerRef.current = null;
      }
    };
  }, [user]);

  return (
    <DataContext.Provider value={{ ready }}>
      {children}
    </DataContext.Provider>
  );
}

export function useDataReady(): boolean {
  return useContext(DataContext).ready;
}
