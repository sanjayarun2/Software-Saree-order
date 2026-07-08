"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import {
  formatIsoToDdMmYyyy,
  parseDdMmYyyyToIso,
} from "@/lib/order-filter-utils";
import { usePreferNativeDateInput } from "@/lib/use-prefer-native-date-input";

type DdMmYyyyDateInputProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (isoValue: string) => void;
  /** Called when the user focuses or opens the calendar — use to enable date filtering. */
  onInteract?: () => void;
  disabled?: boolean;
  error?: string | null;
};

const fieldBorderCls = (hasError: boolean) =>
  hasError
    ? "border-red-400 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500"
    : "border-gray-300 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 dark:border-slate-600";

const nativeDateCls =
  "min-h-touch w-full rounded-bento border bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100";

function CalendarIcon() {
  return (
    <svg
      className="pointer-events-none h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M4.5 8.25h15M4.5 19.5h15a1.5 1.5 0 001.5-1.5V7.5a1.5 1.5 0 00-1.5-1.5h-15A1.5 1.5 0 003 7.5v10.5a1.5 1.5 0 001.5 1.5z"
      />
    </svg>
  );
}

export function DdMmYyyyDateInput({
  id: idProp,
  label,
  value,
  onChange,
  onInteract,
  disabled = false,
  error = null,
}: DdMmYyyyDateInputProps) {
  const preferNative = usePreferNativeDateInput();
  const autoId = useId();
  const id = idProp ?? autoId;
  const [text, setText] = useState(() => formatIsoToDdMmYyyy(value));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setText(formatIsoToDdMmYyyy(value));
    setLocalError(null);
  }, [value]);

  const commitText = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setLocalError(null);
        onChange("");
        return;
      }
      const iso = parseDdMmYyyyToIso(trimmed);
      if (iso === null) {
        setLocalError("Use dd-mm-yyyy");
        return;
      }
      setLocalError(null);
      onChange(iso);
      setText(formatIsoToDdMmYyyy(iso));
    },
    [onChange]
  );

  const showError = error ?? localError;

  if (preferNative) {
    return (
      <div>
        <label
          htmlFor={id}
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300"
        >
          {label}
        </label>
        <input
          id={id}
          type="date"
          value={value || ""}
          disabled={disabled}
          onFocus={() => onInteract?.()}
          onClick={() => onInteract?.()}
          onChange={(e) => {
            onInteract?.();
            onChange(e.target.value);
          }}
          className={`${nativeDateCls} ${fieldBorderCls(Boolean(showError))}`}
          aria-invalid={showError ? true : undefined}
          aria-describedby={showError ? `${id}-error` : undefined}
        />
        {showError ? (
          <p id={`${id}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
            {showError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300"
      >
        {label}
      </label>
      <div
        className={`flex items-stretch overflow-hidden rounded-bento border bg-white dark:bg-slate-800 ${fieldBorderCls(Boolean(showError))}`}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd-mm-yyyy"
          value={text}
          disabled={disabled}
          onFocus={() => onInteract?.()}
          onChange={(e) => {
            onInteract?.();
            setText(e.target.value);
            if (localError) setLocalError(null);
          }}
          onBlur={() => commitText(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText(text);
            }
          }}
          className="min-w-0 flex-1 border-0 bg-transparent px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 disabled:opacity-50 dark:text-slate-100 dark:placeholder-slate-500"
          aria-invalid={showError ? true : undefined}
          aria-describedby={showError ? `${id}-error` : undefined}
        />
        <label
          onClick={() => onInteract?.()}
          className={`relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-l border-gray-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
          aria-label={`Pick ${label}`}
        >
          <input
            type="date"
            value={value || ""}
            disabled={disabled}
            onFocus={() => onInteract?.()}
            onChange={(e) => {
              onInteract?.();
              const iso = e.target.value;
              onChange(iso);
              setText(formatIsoToDdMmYyyy(iso));
              setLocalError(null);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            tabIndex={-1}
          />
          <CalendarIcon />
        </label>
      </div>
      {showError ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {showError}
        </p>
      ) : null}
    </div>
  );
}
