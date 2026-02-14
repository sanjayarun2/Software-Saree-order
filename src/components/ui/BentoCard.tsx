"use client";

import React from "react";

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
}

export function BentoCard({ children, className = "" }: BentoCardProps) {
  return (
    <div className={`bento-card rounded-[16px] border border-gray-100 bg-white ${className}`}>
      {children}
    </div>
  );
}
