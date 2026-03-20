"use client";

import React from "react";

interface FormatSelectionModalProps {
  title: string;
  onSelectA4: () => void;
  onSelectPOS: () => void;
  onClose: () => void;
}

export default function FormatSelectionModal({
  title,
  onSelectA4,
  onSelectPOS,
  onClose,
}: FormatSelectionModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-600 dark:bg-slate-800">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose the paper format
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              onSelectA4();
              onClose();
            }}
            className="flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white font-semibold text-slate-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="5" y="2" width="14" height="20" rx="1.5" />
              <line x1="8" y1="7" x2="16" y2="7" />
              <line x1="8" y1="10" x2="16" y2="10" />
              <line x1="8" y1="13" x2="13" y2="13" />
            </svg>
            A4
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectPOS();
              onClose();
            }}
            className="flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary-600 font-semibold text-white shadow-sm hover:bg-primary-700 active:bg-primary-800 dark:bg-primary-500 dark:hover:bg-primary-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="6" y="3" width="12" height="18" rx="1.5" />
              <line x1="6" y1="16" x2="18" y2="16" />
              <line x1="12" y1="16" x2="12" y2="21" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="9" y1="11" x2="15" y2="11" />
            </svg>
            POS
          </button>
        </div>
      </div>
    </div>
  );
}
