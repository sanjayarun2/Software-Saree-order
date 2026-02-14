"use client";

import React from "react";

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
}

export function BentoCard({ children, className = "" }: BentoCardProps) {
  return (
    <div className={`bento-card rounded-2xl border border-white/20 bg-white/50 shadow-[5px_0_15px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-800/50 ${className}`}>
      {children}
    </div>
  );
}
