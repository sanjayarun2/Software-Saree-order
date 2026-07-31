"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { clearSession } from "./capacitor-storage";
import { clearLastSyncTimestamp } from "./local-store";
import { getOrCreateDeviceId } from "./device-id";
import {
  resolveDeviceForSessionOnce,
  unregisterDeviceForSession,
  markSessionEndedForDeviceLimit,
  markDeviceSlotEvicted,
  clearDeviceResolveCache,
  AUTH_ERROR_DEVICE_LIMIT,
  type ResolveDeviceResult,
} from "./user-devices-supabase";
import { getAuthSiteUrl } from "./auth-site-url";
import {
  clearPendingMobileForGoogleAuth,
  getPendingMobileForGoogleAuth,
} from "./google-auth-mobile";

function notifyDeviceSlotEvicted(r: ResolveDeviceResult): void {
  if (r.ok && r.evicted && r.maxDevices != null) {
    markDeviceSlotEvicted(r.maxDevices);
  }
}

/**
 * Industry standard auth gate:
 * Keep `loading === true` until the initial session (and device check) fully settles.
 * Never flash Login while Preferences restore / token refresh / device resolve is in flight.
 */
type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: (intent?: import("./google-auth-intent").GoogleAuthIntent) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, metadata?: { mobile?: string }) => Promise<{ error: Error | null; user?: User }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Hard ceiling only — splash stays until bootstrap finishes or this fires. */
const BOOTSTRAP_HARD_TIMEOUT_MS = 20_000;

async function gateSessionDevice(session: Session | null): Promise<Session | null> {
  if (!session?.user) return null;
  if (typeof window === "undefined") return session;

  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return session;

  const r = await resolveDeviceForSessionOnce(session.user.id, deviceId);
  if (!r.ok) {
    markSessionEndedForDeviceLimit();
    await supabase.auth.signOut();
    await clearSession();
    return null;
  }
  notifyDeviceSlotEvicted(r);
  return session;
}

function persistReturningProfile(session: Session) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("saree_app_returning", "1");
  } catch {
    /* ignore */
  }

  const pendingMobile = getPendingMobileForGoogleAuth();
  const payload: { user_id: string; mobile?: string; email?: string; updated_at: string } = {
    user_id: session.user.id,
    updated_at: new Date().toISOString(),
  };
  if (pendingMobile) payload.mobile = pendingMobile;
  if (session.user.email) payload.email = session.user.email;
  if (payload.mobile || payload.email) {
    void supabase
      .from("user_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .then(() => {
        clearPendingMobileForGoogleAuth();
      })
      .then(undefined, () => {});
  }

  void import("./default-from-address").then(({ hydrateDefaultFromAddress }) =>
    hydrateDefaultFromAddress(session.user.id)
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrappedRef = useRef(false);
  const bootstrapGenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const publish = (next: Session | null) => {
      if (cancelled) return;
      setSession(next);
      setUser(next?.user ?? null);
      setLoading(false);
      bootstrappedRef.current = true;
    };

    const finishBootstrap = async (incoming: Session | null) => {
      const gen = ++bootstrapGenRef.current;
      try {
        const gated = await gateSessionDevice(incoming);
        if (cancelled || gen !== bootstrapGenRef.current) return;
        if (gated?.user) persistReturningProfile(gated);
        publish(gated);
      } catch {
        if (cancelled || gen !== bootstrapGenRef.current) return;
        publish(null);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;

      // Supabase emits INITIAL_SESSION after storage restore (incl. Capacitor Preferences).
      if (event === "INITIAL_SESSION") {
        void finishBootstrap(nextSession);
        return;
      }

      // Until bootstrap completes, ignore other events (avoids null flash mid-restore).
      if (!bootstrappedRef.current) return;

      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      // TOKEN_REFRESHED / SIGNED_IN / USER_UPDATED — never clear user on transient null.
      if (!nextSession?.user) return;

      void (async () => {
        const gen = ++bootstrapGenRef.current;
        const gated = await gateSessionDevice(nextSession);
        if (cancelled || gen !== bootstrapGenRef.current) return;
        if (!gated?.user) {
          setSession(null);
          setUser(null);
          return;
        }
        setSession(gated);
        setUser(gated.user);
        persistReturningProfile(gated);
      })();
    });

    // Safety net if INITIAL_SESSION is delayed (slow Preferences / network refresh).
    const hardTimeout = setTimeout(() => {
      if (cancelled || bootstrappedRef.current) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (cancelled || bootstrappedRef.current) return;
        void finishBootstrap(data.session ?? null);
      });
    }, BOOTSTRAP_HARD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(hardTimeout);
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
        const r = await resolveDeviceForSessionOnce(u.id, deviceId);
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

  const signInWithGoogle = async (intent: import("./google-auth-intent").GoogleAuthIntent = "login") => {
    const { stageGoogleAuthIntent } = await import("./google-auth-intent");
    const { getGoogleOAuthRedirectUrl, startGoogleOAuth } = await import("./google-oauth-flow");
    stageGoogleAuthIntent(intent);
    const redirectTo = getGoogleOAuthRedirectUrl();
    const { error } = await startGoogleOAuth(redirectTo);
    return { error: error ?? null };
  };

  const signUp = async (email: string, password: string, metadata?: { mobile?: string }) => {
    const redirectTo = `${getAuthSiteUrl()}/verify-success/`;
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
    const uid =
      user?.id ??
      (await supabase.auth.getSession()).data.session?.user?.id ??
      null;
    const deviceId = getOrCreateDeviceId();
    if (uid && deviceId) {
      await unregisterDeviceForSession(uid, deviceId);
    }
    await supabase.auth.signOut();
    await clearSession();
    clearDeviceResolveCache();
    setSession(null);
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signInWithGoogle, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
