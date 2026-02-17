/**
 * Gmail deep link utility: opens Gmail app on mobile, web on desktop.
 * - Android: Chrome Intent (intent://#Intent;scheme=googlegmail;package=com.google.android.gm;end)
 * - iOS: googlegmail://
 * - Web: inbox URL in a new tab
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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e5ff1efb-b536-4696-aa4a-e6f88c1f3cf2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:`log_${Date.now()}_gmailDeepLink`,runId:'pre-fix',hypothesisId:'H1',location:'gmail-deep-link.ts:getGmailDeepLinkUrl',message:'GMAIL deep link platform detection',data:{userAgent:navigator.userAgent,isIOS,isAndroid},timestamp:Date.now()})}).catch(()=>{});
  // #endregion agent log

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

/**
 * Opens Gmail with strict platform detection.
 * - Android: Chrome Intent (intent://#Intent;scheme=googlegmail;package=com.google.android.gm;end).
 * - iOS: googlegmail:// custom scheme.
 * - Web: https://mail.google.com in a new tab.
 */
export function openGmailApp(): void {
  if (typeof window === "undefined") return;

  const url = getGmailDeepLinkUrl();
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e5ff1efb-b536-4696-aa4a-e6f88c1f3cf2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:`log_${Date.now()}_openGmail`,runId:'pre-fix',hypothesisId:'H2',location:'gmail-deep-link.ts:openGmailApp',message:'openGmailApp called',data:{userAgent:navigator.userAgent,isMobile,url},timestamp:Date.now()})}).catch(()=>{});
  // #endregion agent log

  if (isMobile && (url.startsWith("googlegmail://") || url.startsWith("intent://"))) {
    // Let the OS handle the Gmail deep-link. If Gmail is not installed, the OS will handle gracefully.
    window.location.href = url;
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
