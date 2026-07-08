/** Shared sync timing — coalesce redundant network calls across modules. */

export const WEBSITE_POLL_COOLDOWN_MS = 15_000;
export const RESUME_SYNC_DEBOUNCE_MS = 2_000;
export const BACKGROUND_DASHBOARD_SYNC_COOLDOWN_MS = 45_000;

let lastWebsitePollAt = 0;
let lastDashboardSyncAt = 0;
let lastFullSyncAt = 0;

let resumeSyncTimer: ReturnType<typeof setTimeout> | null = null;

export function markWebsitePollComplete(): void {
  lastWebsitePollAt = Date.now();
}

export function wasWebsitePollRecent(withinMs = WEBSITE_POLL_COOLDOWN_MS): boolean {
  return lastWebsitePollAt > 0 && Date.now() - lastWebsitePollAt < withinMs;
}

export function markDashboardSyncComplete(): void {
  lastDashboardSyncAt = Date.now();
}

export function markFullSyncComplete(): void {
  const now = Date.now();
  lastFullSyncAt = now;
  lastDashboardSyncAt = now;
}

export function shouldSkipBackgroundDashboardSync(
  withinMs = BACKGROUND_DASHBOARD_SYNC_COOLDOWN_MS,
): boolean {
  const now = Date.now();
  return (
    (lastDashboardSyncAt > 0 && now - lastDashboardSyncAt < withinMs) ||
    (lastFullSyncAt > 0 && now - lastFullSyncAt < withinMs)
  );
}

export function scheduleResumeSync(fn: () => void, debounceMs = RESUME_SYNC_DEBOUNCE_MS): void {
  if (resumeSyncTimer != null) clearTimeout(resumeSyncTimer);
  resumeSyncTimer = setTimeout(() => {
    resumeSyncTimer = null;
    fn();
  }, debounceMs);
}

export function clearResumeSyncSchedule(): void {
  if (resumeSyncTimer != null) {
    clearTimeout(resumeSyncTimer);
    resumeSyncTimer = null;
  }
}

export function resetSyncCoalesceState(): void {
  lastWebsitePollAt = 0;
  lastDashboardSyncAt = 0;
  lastFullSyncAt = 0;
  clearResumeSyncSchedule();
}
