"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { clearSession } from "./capacitor-storage";

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
      .then(({ data: { session }, error }) => {
        if (cancelled) return;
        clearTimeout(timeout);
        if (!error) {
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
      if (!cancelled) {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user && typeof window !== "undefined") {
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
        }
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, metadata?: { mobile?: string }) => {
    const siteUrl = typeof window !== "undefined"
      ? (window.location.origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
      : (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
    const redirectTo = `${siteUrl}/verify-success/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: metadata ?? {},
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
