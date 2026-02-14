"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

type ToastContextType = {
  toast: (message: string) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const toast = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {message && (
        <div
          className="fixed bottom-24 left-4 right-4 z-[100] mx-auto max-w-sm rounded-[16px] border border-gray-100 bg-white px-4 py-3 text-center text-base font-medium text-gray-800 shadow-lg md:bottom-8"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (ctx === undefined) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
