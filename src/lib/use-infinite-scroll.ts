"use client";

import { useEffect, useRef } from "react";

/**
 * Triggers onLoadMore when the sentinel enters the viewport (user scrolls near list end).
 */
export function useInfiniteScroll(opts: {
  enabled: boolean;
  onLoadMore: () => void | Promise<void>;
  rootMargin?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(opts.onLoadMore);
  const busyRef = useRef(false);

  useEffect(() => {
    onLoadMoreRef.current = opts.onLoadMore;
  }, [opts.onLoadMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !opts.enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit || busyRef.current) return;
        busyRef.current = true;
        void Promise.resolve(onLoadMoreRef.current()).finally(() => {
          busyRef.current = false;
        });
      },
      { root: null, rootMargin: opts.rootMargin ?? "240px 0px", threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [opts.enabled, opts.rootMargin]);

  return sentinelRef;
}
