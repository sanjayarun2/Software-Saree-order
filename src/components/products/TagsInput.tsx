"use client";

import React, { useState } from "react";
import { useLanguage } from "@/lib/language-context";

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
};

export function TagsInput({ tags, onChange, disabled }: Props) {
  const { t } = useLanguage();
  const [input, setInput] = useState("");

  const addTag = () => {
    const tag = input.trim();
    if (!tag || tags.includes(tag)) {
      setInput("");
      return;
    }
    onChange([...tags, tag]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          >
            {tag}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="text-primary-500"
              aria-label={t("Remove")}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={t("Add tag and press Enter")}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={addTag}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium dark:border-slate-600 dark:bg-slate-800"
        >
          {t("Add")}
        </button>
      </div>
    </div>
  );
}
