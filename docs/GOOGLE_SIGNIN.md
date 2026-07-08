# Google Sign-In (mobile APK)

## Supabase redirect URLs

In **Supabase Dashboard → Authentication → URL configuration → Redirect URLs**, add:

```
https://software-saree-order.vercel.app/auth/callback/
sareeorder://auth/callback
```

The custom scheme `sareeorder://` is registered in `AndroidManifest.xml` so Google OAuth returns to the app after in-app browser sign-in.

## Flow

| Screen | Google | Mobile |
|--------|--------|--------|
| **App open** | — | Lands on **Login** first |
| **Login** | Primary; no mobile | — |
| **Login fail (unknown email)** | — | **Register** link nudges |
| **Register (email)** | Google first | Popup **after** verify + sign-in |
| **Register (Google)** | After OAuth → `/complete-mobile/` if new | Mandatory gate |
| **Login (existing)** | → dashboard | Never asked |

## Native OAuth

On Capacitor Android/iOS the app uses `@capacitor/browser` + `sareeorder://auth/callback` deep link (PKCE).

**Robust return handling:**
- `NativeOAuthBridge` (app root) listens for `appUrlOpen` and `getLaunchUrl()` so cold-start returns still complete sign-in.
- OAuth intent is stored in `localStorage` (survives WebView reload).
- PKCE code exchange has a timeout; corrupted redirect URLs (`sareeorder:?code=`) are normalized.

**Supabase redirect URLs** must include exactly:

```
sareeorder://auth/callback
```

(not bare `sareeorder://` — required for reliable PKCE on mobile)
