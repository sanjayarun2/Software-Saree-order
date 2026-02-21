"use client";

import React, { createContext, useContext, useEffect, useRef } from "react";
import { useAuth } from "./auth-context";
import { initSyncManager, teardownSyncManager } from "./sync-manager";
import { fullSync } from "./order-service";

interface DataContextValue {
  ready: boolean;
}

const DataContext = createContext<DataContextValue>({ ready: false });

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const syncedRef = useRef<string | null>(null);
  const [ready, setReady] = React.useState(false);

  useEffect(() => {
    if (!user) {
      teardownSyncManager();
      syncedRef.current = null;
      setReady(false);
      return;
    }

    if (syncedRef.current === user.id) return;
    syncedRef.current = user.id;

    initSyncManager(user.id);

    fullSync(user.id).finally(() => setReady(true));
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
