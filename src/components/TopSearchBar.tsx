"use client";

import React from "react";
import { useSearch } from "@/lib/search-context";

export function TopSearchBar() {
  const { query, setQuery } = useSearch();
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          placeholder="Search by address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-[50px] flex-1 rounded-[16px] border border-gray-100 bg-gray-50 px-4 text-base text-gray-800 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          aria-label="Search orders"
        />
      </div>
    </header>
  );
}
