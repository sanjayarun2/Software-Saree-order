"use client";

import React, { createContext, useContext, useState } from "react";

const SearchContext = createContext<{
  query: string;
  setQuery: (q: string) => void;
} | undefined>(undefined);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <SearchContext.Provider value={{ query, setQuery }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (ctx === undefined) return { query: "", setQuery: () => {} };
  return ctx;
}
