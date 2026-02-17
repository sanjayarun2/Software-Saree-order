"use client";

import React from "react";
import { useSearch } from "@/lib/search-context";

export function TopSearchBar() {
  const { query, setQuery } = useSearch();
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-2 md:px-4 md:py-3">
      <div className="mx-auto flex max-w-2xl items-center gap-2 md:gap-3">
        <svg className="h-4 w-4 shrink-0 text-gray-400 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          placeholder="Search by mobile, name or consignment..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-[44px] flex-1 rounded-xl border border-gray-100 bg-gray-50 px-3 text-sm text-gray-800 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 md:min-h-[50px] md:rounded-[16px] md:px-4 md:text-base"
          aria-label="Search orders"
        />
      </div>
    </header>
  );
}
