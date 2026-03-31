"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { clearSession } from "./capacitor-storage";
import { clearLastSyncTimestamp } from "./local-store";
import { getOrCreateDeviceId } from "./device-id";
import {
  resolveDeviceForSession,
  markSessionEndedForDeviceLimit,
  markDeviceSlotEvicted,
  AUTH_ERROR_DEVICE_LIMIT,
  type ResolveDeviceResult,
} from "./user-devices-supabase";

function notifyDeviceSlotEvicted(r: ResolveDeviceResult): void {
  if (r.ok && r.evicted && r.maxDevices != null) {
    markDeviceSlotEvicted(r.maxDevices);
  }
}

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, metadata?: { mobile?: string }) => Promise<{ error: Error | null; user?: User }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const stopLoading = () => {
      if (!cancelled) setLoading(false);
    };

    const timeout = setTimeout(stopLoading, 5000);

    supabase.auth
      .getSession()
      .then(async ({ data: { session }, error }) => {
        if (cancelled) return;
        clearTimeout(timeout);
        if (!error && session?.user && typeof window !== "undefined") {
          const deviceId = getOrCreateDeviceId();
          if (deviceId) {
            const r = await resolveDeviceForSession(session.user.id, deviceId);
            if (!r.ok) {
              markSessionEndedForDeviceLimit();
              await supabase.auth.signOut();
              await clearSession();
              if (!cancelled) {
                setSession(null);
                setUser(null);
              }
              stopLoading();
              return;
            }
            notifyDeviceSlotEvicted(r);
          }
        }
        if (!cancelled && !error) {
          setSession(session);
          setUser(session?.user ?? null);
        }
        stopLoading();
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          setSession(null);
          setUser(null);
          stopLoading();
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;

      if (!session?.user) {
        setSession(session);
        setUser(null);
        return;
      }

      if (typeof window === "undefined") {
        setSession(session);
        setUser(session.user);
        return;
      }

      void (async () => {
        const deviceId = getOrCreateDeviceId();
        if (deviceId) {
          const r = await resolveDeviceForSession(session.user.id, deviceId);
          if (!r.ok) {
            markSessionEndedForDeviceLimit();
            await supabase.auth.signOut();
            await clearSession();
            if (!cancelled) {
              setSession(null);
              setUser(null);
            }
            return;
          }
          notifyDeviceSlotEvicted(r);
        }
        if (cancelled) return;

        setSession(session);
        setUser(session.user);

        localStorage.setItem("saree_app_returning", "1");
        const pendingMobile = localStorage.getItem("saree_pending_mobile");
        const payload: { user_id: string; mobile?: string; email?: string; updated_at: string } = {
          user_id: session.user.id,
          updated_at: new Date().toISOString(),
        };
        if (pendingMobile?.trim()) payload.mobile = pendingMobile.trim();
        if (session.user.email) payload.email = session.user.email;
        if (payload.mobile || payload.email) {
          supabase
            .from("user_profiles")
            .upsert(payload, { onConflict: "user_id" })
            .then(() => {
              localStorage.removeItem("saree_pending_mobile");
            })
            .then(undefined, () => {});
        }
      })();
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    const u = data.user;
    if (u && typeof window !== "undefined") {
      const deviceId = getOrCreateDeviceId();
      if (deviceId) {
        const r = await resolveDeviceForSession(u.id, deviceId);
        if (!r.ok) {
          markSessionEndedForDeviceLimit();
          await supabase.auth.signOut();
          await clearSession();
          return { error: new Error(AUTH_ERROR_DEVICE_LIMIT) };
        }
        notifyDeviceSlotEvicted(r);
      }
      void clearLastSyncTimestamp(u.id).catch(() => {});
    }
    return { error: null };
  };

  const signUp = async (email: string, password: string, metadata?: { mobile?: string }) => {
    const siteUrl = typeof window !== "undefined"
      ? (window.location.origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
      : (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
    const redirectTo = `${siteUrl}/verify-success/`;
    const userMetadata: Record<string, string> = {};
    if (metadata?.mobile?.trim()) {
      userMetadata.mobile = metadata.mobile.trim();
      userMetadata.phone = metadata.mobile.trim();
      userMetadata.mobile_number = metadata.mobile.trim();
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: userMetadata,
      },
    });
    return { error, user: data?.user ?? undefined };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    await clearSession();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
