"use client";

import React from "react";
import { useLanguage } from "@/lib/language-context";
import type { VeloSizeConfig, VeloSizeOption } from "@/lib/velo-products-types";
import { DEFAULT_SIZE_OPTIONS } from "@/lib/velo-products-types";

type Props = {
  value: VeloSizeConfig;
  onChange: (next: VeloSizeConfig) => void;
  disabled?: boolean;
};

export function SizeConfigEditor({ value, onChange, disabled }: Props) {
  const { t } = useLanguage();

  const setEnabled = (enabled: boolean) => {
    const options =
      enabled && value.options.length === 0
        ? [...DEFAULT_SIZE_OPTIONS]
        : value.options;
    onChange({ enabled, options });
  };

  const updateOption = (index: number, patch: Partial<VeloSizeOption>) => {
    const options = value.options.map((row, i) =>
      i === index ? { ...row, ...patch } : row
    );
    onChange({ ...value, options });
  };

  const addRow = () => {
    if (value.options.length >= 12) return;
    onChange({ ...value, options: [...value.options, { size: "", qty: 1 }] });
  };

  const removeRow = (index: number) => {
    onChange({ ...value, options: value.options.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-900/40">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        {t("Enable size options")}
      </label>

      {value.enabled ? (
        <div className="space-y-2">
          {value.options.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                maxLength={8}
                value={row.size}
                disabled={disabled}
                onChange={(e) =>
                  updateOption(index, { size: e.target.value.toUpperCase() })
                }
                placeholder={t("Size")}
                className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
              <input
                type="number"
                min={0}
                step={0.01}
                value={row.qty}
                disabled={disabled}
                onChange={(e) =>
                  updateOption(index, { qty: Number(e.target.value) || 0 })
                }
                className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
              <button
                type="button"
                disabled={disabled || value.options.length <= 1}
                onClick={() => removeRow(index)}
                className="rounded-lg border border-red-200 px-2 py-2 text-xs text-red-600 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
              >
                {t("Remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={addRow}
            className="text-sm font-medium text-primary-600 dark:text-primary-400"
          >
            + {t("Add size row")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
