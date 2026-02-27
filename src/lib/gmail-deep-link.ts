/**
 * Gmail deep link utility: opens Gmail app on mobile, web on desktop.
 * - In Capacitor native app: open Gmail web URL in system browser (so OS can open Gmail app or show web inbox).
 * - Web: inbox URL in a new tab.
 */
const GMAIL_PACKAGE = "com.google.android.gm";
const GMAIL_WEB_URL = "https://mail.google.com";
const GMAIL_APP_SCHEME = "googlegmail://";
/** Android intent to open Gmail app (WebView often blocks this; we use Browser plugin on native instead) */
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

const FALLBACK_DELAY_MS = 1800;

/**
 * Fallback: open Gmail inbox in system browser (working logic – do not remove).
 * Used when primary (Gmail app intent/scheme) does not take the user out of the app.
 */
function openGmailInBrowser(email?: string): void {
  const url = getGmailWebInboxUrlForEmail(email);
  import("@capacitor/browser")
    .then(({ Browser }) => Browser.open({ url }))
    .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
}

/**
 * Opens Gmail. No Android/iOS permission is required.
 * - Primary (native mobile): try to open the Gmail app first via intent (Android) or googlegmail:// (iOS).
 * - Fallback: if still in app after a short delay, open inbox in system browser (Capacitor Browser).
 */
export function openGmailApp(email?: string): void {
  if (typeof window === "undefined") return;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  const isNative = typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();

  if (isNative && isMobile) {
    const appUrl = getGmailDeepLinkUrl();
    if (appUrl.startsWith("googlegmail://") || appUrl.startsWith("intent://")) {
      window.location.href = appUrl;
      setTimeout(() => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          openGmailInBrowser(email);
        }
      }, FALLBACK_DELAY_MS);
      return;
    }
  }

  if (isNative) {
    openGmailInBrowser(email);
    return;
  }

  if (isMobile) {
    const url = getGmailDeepLinkUrl();
    if (url.startsWith("googlegmail://") || url.startsWith("intent://")) {
      window.location.href = url;
      return;
    }
  }

  const url = getGmailWebInboxUrlForEmail(email);
  window.open(url, "_blank", "noopener,noreferrer");
}
