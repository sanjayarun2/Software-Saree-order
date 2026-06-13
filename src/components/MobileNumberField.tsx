"use client";

import React from "react";
import { useLanguage } from "@/lib/language-context";

type MobileNumberFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  recentMobiles: string[];
  requiredForGoogle?: boolean;
  disabled?: boolean;
};

export function MobileNumberField({
  id,
  value,
  onChange,
  recentMobiles,
  requiredForGoogle,
  disabled,
}: MobileNumberFieldProps) {
  const { t } = useLanguage();
  const listId = `${id}-suggestions`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {t("Mobile Number")}
        {requiredForGoogle ? (
          <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
            ({t("required for Google sign-in")})
          </span>
        ) : null}
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
        inputMode="tel"
        autoComplete="tel"
        className="w-full rounded-bento border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <datalist id={listId}>
        {recentMobiles.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {requiredForGoogle ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("Add your mobile number before using Google sign-in.")}
        </p>
      ) : null}
    </div>
  );
}
