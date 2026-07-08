# Google Sign-In (mobile APK + web)

## Native sign-in (APK — recommended)

The mobile app uses **native Google account picker** (`@capgo/capacitor-social-login`) and Supabase `signInWithIdToken`. **No browser opens.**

### 1. Environment variable

Add to `.env.local` and GitHub Actions secret `GOOGLE_WEB_CLIENT_ID`:

```
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
```

Use the **Web application** OAuth client ID from Google Cloud Console (same ID configured in Supabase → Authentication → Google).

### 2. Google Cloud Console

1. **OAuth consent screen** — configured and published (or test users added).
2. **Credentials → Web client** — copy Client ID → `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
3. **Credentials → Android client** (required for native account picker without error `[16]`):
   - Package name: `com.sareeorder.app`
   - SHA-1: from your signing key (debug for CI APK, release for production)

   If SHA is added only via Firebase API/CLI, you may still need to **create the Android OAuth client manually** in [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials?project=helical-patrol-499311-d0), then re-download `google-services.json`.

   Validate locally:

   ```powershell
   .\scripts\validate-google-signin.ps1
   ```

   Fix helper (refresh config after manual Android client creation):

   ```bash
   node scripts/fix-google-android-oauth.mjs
   ```

4. Supabase Google provider must use the **same Web client ID** and matching client secret.

### 3. Supabase

**Authentication → Providers → Google** — enabled with Web client ID + secret.

**Redirect URLs** (for web only):

```
https://software-saree-order.vercel.app/auth/callback/
```

Native APK uses native account picker first. If Google returns error `[16]`, the app **automatically falls back** to in-app browser OAuth (`sareeorder://auth/callback`). Add that URL in Supabase → Authentication → URL Configuration → Redirect URLs.

### 4. GitHub Actions (APK build)

Add repository secret:

| Secret | Value |
|--------|--------|
| `GOOGLE_WEB_CLIENT_ID` | Web OAuth client ID |

Workflow passes it as `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` during `npm run build`.

---

## Web sign-in

Browser redirect to `/auth/callback/` via Supabase OAuth (unchanged).

---

## Auth flow summary

| Platform | Method |
|----------|--------|
| **APK** | Native account picker → ID token → Supabase session → dashboard |
| **Web** | Redirect OAuth → `/auth/callback/` |
| **New Google signup** | → `/complete-mobile/` if mobile missing |
| **Login** | Never asks mobile |
