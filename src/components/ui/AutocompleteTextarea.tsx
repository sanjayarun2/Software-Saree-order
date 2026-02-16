"use client";

import React, { useRef, useEffect, useState } from "react";

interface AutocompleteTextareaProps {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder: string;
  maxLength?: number;
  rows?: number;
  className?: string;
  id?: string;
}

export function AutocompleteTextarea({
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength = 600,
  rows = 3,
  className = "",
  id,
}: AutocompleteTextareaProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? suggestions.filter((s) => s.toLowerCase().includes(query)).slice(0, 8)
    : [];

  useEffect(() => {
    setHighlightIndex(-1);
  }, [value, filtered.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (s: string) => {
    onChange(s);
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(filtered[highlightIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <textarea
        id={id}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const newVal = raw.length > maxLength ? raw.slice(0, maxLength) : raw;
          onChange(newVal);
          const q = newVal.trim().toLowerCase();
          const matches = q
            ? suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 8)
            : [];
          setShowDropdown(matches.length > 0);
        }}
        onKeyDown={handleKeyDown}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        className={className}
        required
      />
      {showDropdown && filtered.length > 0 && (
        <ul
          className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-[16px] border border-gray-100 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filtered.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlightIndex}
              className={`cursor-pointer px-4 py-3 text-base text-gray-900 hover:bg-gray-50 ${
                i === highlightIndex ? "bg-gray-50" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
            >
              {s.length > 80 ? `${s.slice(0, 80)}…` : s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
