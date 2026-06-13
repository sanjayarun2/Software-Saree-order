const DEFAULT_SITE_URL = "https://software-saree-order.vercel.app";

export function getAuthSiteUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin || process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

export function getAuthCallbackUrl(): string {
  return `${getAuthSiteUrl()}/auth/callback/`;
}
