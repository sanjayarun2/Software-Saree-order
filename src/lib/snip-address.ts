import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface SnipAddressPlugin {
  hasOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<{ opened: boolean }>;
  startOverlay(): Promise<{ running: boolean }>;
  stopOverlay(): Promise<{ running: boolean }>;
  isOverlayRunning(): Promise<{ running: boolean }>;
  getPending(): Promise<{ text: string }>;
  addListener(
    eventName: "snipAddress",
    listenerFunc: (event: { text: string }) => void
  ): Promise<PluginListenerHandle>;
}

export const SnipAddress = registerPlugin<SnipAddressPlugin>("SnipAddress");

const FLOAT_KEY = "velo:float-snip-enabled";

export function readFloatSnipEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FLOAT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFloatSnipEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FLOAT_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
