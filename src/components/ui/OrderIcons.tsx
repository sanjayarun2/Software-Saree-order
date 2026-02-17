"use client";

import React from "react";

const iconClass = "h-5 w-5";

export function IconEdit({ className = iconClass }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

export function IconDispatch({ className = iconClass }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

export function IconUndo({ className = iconClass }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}

export function IconPdf({ className = iconClass }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

export function IconTrash({ className = iconClass }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export function IconWhatsApp({ className = iconClass }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <path
        fill="#25D366"
        d="M16.04 3C9.41 3 4 8.41 4 15.04c0 2.64.87 5.09 2.52 7.17L5 29l6.97-1.46A11.9 11.9 0 0 0 16.04 27C22.66 27 28 21.59 28 14.96 28 8.34 22.66 3 16.04 3z"
      />
      <path
        fill="#fff"
        d="M21.3 19.3c-.33-.16-1.95-.96-2.25-1.07-.3-.11-.52-.16-.74.16-.22.33-.85 1.07-1.04 1.29-.19.22-.38.24-.7.08-.33-.16-1.37-.5-2.61-1.6-.96-.85-1.61-1.9-1.8-2.23-.19-.33-.02-.51.14-.67.15-.15.33-.38.49-.57.16-.19.21-.33.33-.55.11-.22.05-.41-.03-.57-.08-.16-.74-1.79-1.02-2.45-.27-.65-.54-.56-.74-.57h-.63c-.22 0-.57.08-.87.38-.3.33-1.15 1.12-1.15 2.72 0 1.6 1.18 3.14 1.35 3.36.16.22 2.32 3.54 5.62 4.82.79.32 1.4.51 1.87.65.79.25 1.51.21 2.08.13.63-.1 1.95-.8 2.23-1.57.27-.77.27-1.43.19-1.57-.08-.13-.3-.22-.63-.38z"
      />
    </svg>
  );
}
