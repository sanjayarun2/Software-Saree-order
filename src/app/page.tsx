"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const RETURNING_KEY = "saree_app_returning";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const fromEmailVerify = hash.includes("access_token") || hash.includes("type=email");
    if (fromEmailVerify) {
      router.replace("/verify-success/");
      return;
    }
    if (user) router.replace("/dashboard/");
    else {
      const returning = typeof window !== "undefined" && localStorage.getItem(RETURNING_KEY);
      router.replace(returning ? "/login/" : "/register/");
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}
