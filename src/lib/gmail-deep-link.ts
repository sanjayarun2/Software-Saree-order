/**
 * Gmail deep link utility: opens Gmail app on mobile, falls back to mailto: or web.
 * - iOS: googlegmail://
 * - Android: intent:// with Gmail package
 * - Fallback: mailto: (opens default mail app) or mail.google.com
 */
export function getGmailDeepLinkUrl(): string {
  if (typeof window === "undefined") return "https://mail.google.com";
  
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);
  
  if (isIOS) {
    // iOS: googlegmail:// scheme
    return "googlegmail://";
  }
  
  if (isAndroid) {
    // Android: intent:// with Gmail package and fallback
    const fallback = encodeURIComponent("https://mail.google.com");
    return `intent://#Intent;scheme=googlegmail;package=com.google.android.gm;S.browser_fallback_url=${fallback};end`;
  }
  
  // Desktop: web Gmail
  return "https://mail.google.com";
}

/**
 * Opens Gmail app with fallback handling.
 * On mobile, attempts deep link; if that fails, falls back to mailto: or web.
 */
export function openGmailApp(): void {
  if (typeof window === "undefined") return;
  
  const url = getGmailDeepLinkUrl();
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  if (isMobile && (url.startsWith("googlegmail://") || url.startsWith("intent://"))) {
    // Mobile: try deep link (intent:// for Android includes fallback URL)
    window.location.href = url;
  } else {
    // Desktop: open in new tab
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
