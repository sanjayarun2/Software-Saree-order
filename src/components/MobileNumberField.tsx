"use client";

import React from "react";
import { useLanguage } from "@/lib/language-context";

type MobileNumberFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  recentMobiles: string[];
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
};

export function MobileNumberField({
  id,
  value,
  onChange,
  recentMobiles,
  required,
  disabled,
  helperText,
}: MobileNumberFieldProps) {
  const { t } = useLanguage();
  const listId = `${id}-suggestions`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {t("Mobile Number")}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      <input
        id={id}
        name={id}
        type="tel"
        list={listId}
        placeholder={t("Mobile number")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        inputMode="tel"
        autoComplete="tel"
        className="w-full rounded-bento border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <datalist id={listId}>
        {recentMobiles.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {helperText ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
      ) : null}
    </div>
  );
}
