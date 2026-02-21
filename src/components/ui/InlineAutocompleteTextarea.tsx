"use client";

import React, { useRef, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

interface InlineAutocompleteTextareaProps {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder: string;
  maxLength?: number;
  rows?: number;
  className?: string;
  id?: string;
}

export function InlineAutocompleteTextarea({
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength = 600,
  rows = 3,
  className = "",
  id,
}: InlineAutocompleteTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [isWeb, setIsWeb] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsWeb(!Capacitor.isNativePlatform());
    }
  }, []);

  const query = value.trim().toLowerCase();
  const bestMatch = query
    ? suggestions.find((s) => s.toLowerCase().startsWith(query))
    : undefined;
  const completion = bestMatch ? bestMatch.slice(value.length) : "";

  // Web only: auto-grow textarea so only the page scrolls (no inner scrollbar)
  useEffect(() => {
    if (!isWeb || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.overflowY = "hidden";
    el.style.height = "auto";
    const minHeight = rows * 22;
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [isWeb, value, rows]);

  // Sync scroll from textarea to hint (native only; web uses auto-grow)
  const handleScroll = () => {
    if (textareaRef.current && hintRef.current) {
      hintRef.current.scrollTop = textareaRef.current.scrollTop;
      hintRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (completion && (e.key === "Tab" || e.key === "Enter")) {
      e.preventDefault();
      onChange(bestMatch!);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = e.target.value;
    const newVal = raw.length > maxLength ? raw.slice(0, maxLength) : raw;
    onChange(newVal);
  };

  return (
    <div
      className={`relative w-full whitespace-pre-wrap rounded-bento border px-4 py-2 dark:border-slate-600 dark:bg-slate-800 ${className}`.trim()}
    >
      {/* Hint layer: invisible value + grey completion, behind the textarea */}
      <div
        ref={hintRef}
        aria-hidden
        className={`pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-4 py-2 text-base leading-normal ${isWeb ? "overflow-hidden" : "overflow-auto"}`}
      >
        <span className="invisible">{value}</span>
        {completion && (
          <span className="text-gray-400 dark:text-gray-500">{completion}</span>
        )}
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        maxLength={maxLength}
        rows={rows}
        placeholder={value ? undefined : placeholder}
        className="relative z-10 min-h-0 w-full resize-none border-0 bg-transparent p-0 caret-slate-900 focus:outline-none focus:ring-0 dark:caret-slate-100"
        style={{ color: "inherit" }}
        required
      />
    </div>
  );
}
