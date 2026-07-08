/** Web Client ID from Google Cloud Console (OAuth 2.0 → Web application). */
export function getGoogleWebClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  return id || null;
}

export function requireGoogleWebClientId(): string {
  const id = getGoogleWebClientId();
  if (!id) {
    throw new Error(
      "Google Web Client ID is not configured. Set NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.local and rebuild the app."
    );
  }
  return id;
}

export function isNativeGoogleSignInConfigured(): boolean {
  return Boolean(getGoogleWebClientId());
}
