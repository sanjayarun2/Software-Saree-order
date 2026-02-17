/**
 * Gmail deep link utility: opens Gmail app on mobile, web on desktop, mailto: fallback.
 * - Android: Chrome Intent (intent://#Intent;scheme=googlegmail;package=com.google.android.gm;end)
 * - iOS: googlegmail://
 * - Web: https://mail.google.com in a new tab
 * - Fallback: mailto: if the app doesn't open (e.g. after timeout on mobile)
 */
const GMAIL_PACKAGE = "com.google.android.gm";
const GMAIL_WEB_URL = "https://mail.google.com";
const GMAIL_APP_SCHEME = "googlegmail://";
/** Android intent to open Gmail app (no browser fallback in the intent; we handle fallback in JS) */
const GMAIL_ANDROID_INTENT = `intent://#Intent;scheme=googlegmail;package=${GMAIL_PACKAGE};end`;

export function getGmailDeepLinkUrl(): string {
  if (typeof window === "undefined") return GMAIL_WEB_URL;

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isIOS) return GMAIL_APP_SCHEME;
  if (isAndroid) return GMAIL_ANDROID_INTENT;
  return GMAIL_WEB_URL;
}

/** Best-effort inbox URL for web to open a specific Gmail account when possible. */
export function getGmailWebInboxUrlForEmail(email?: string): string {
  if (!email || !email.toLowerCase().endsWith("@gmail.com")) {
    return "https://mail.google.com/mail/u/0/#inbox";
  }
  const authuser = encodeURIComponent(email);
  return `https://mail.google.com/mail/?authuser=${authuser}&view=tl&search=inbox`;
}

/** Opens default mail client via mailto: (no recipient; user picks app). Use as fallback when Gmail app didn't open. */
export function openMailtoFallback(): void {
  if (typeof window === "undefined") return;
  window.open("mailto:", "_blank", "noopener,noreferrer");
}

/** Delay (ms) before opening mailto: fallback on mobile when Gmail app may be missing. */
const GMAIL_FALLBACK_DELAY_MS = 2500;

/**
 * Opens Gmail with strict platform detection.
 * - Android: Chrome Intent (intent://#Intent;scheme=googlegmail;package=com.google.android.gm;end).
 * - iOS: googlegmail:// custom scheme.
 * - Web: https://mail.google.com in a new tab.
 * Fallback: on mobile, if the Gmail app doesn't open, opens mailto: after GMAIL_FALLBACK_DELAY_MS.
 */
export function openGmailApp(): void {
  if (typeof window === "undefined") return;

  const url = getGmailDeepLinkUrl();
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile && (url.startsWith("googlegmail://") || url.startsWith("intent://"))) {
    window.location.href = url;
    setTimeout(() => openMailtoFallback(), GMAIL_FALLBACK_DELAY_MS);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
