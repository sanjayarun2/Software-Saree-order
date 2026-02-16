# Email & Verification Setup

## 1. Verification Link → "Verification Successful" page (not homepage)

**Why the link opens the homepage:** If the redirect URL is not in Supabase’s allow list, Supabase sends users to the **Site URL** (e.g. your homepage) instead of your app’s verification-success page.

**In the app (already set):** `signUp` uses `emailRedirectTo: ${siteUrl}/verify-success/` so Supabase is told to send users to the Verification Successful page after they click the link. See `src/lib/auth-context.tsx`:

```ts
options: {
  emailRedirectTo: `${siteUrl}/verify-success/`,
  data: userMetadata,
},
```

**In Supabase Dashboard:** Add the verification-success URL to the allow list so Supabase can redirect there.

**Required:** Add these to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** (one per line):

```
https://software-saree-order.vercel.app/**
https://software-saree-order.vercel.app/verify-success/**
https://software-saree-order.vercel.app/reset-password/**
http://localhost:3000/**
```

If `/verify-success/` or `/reset-password/` is **not** in Redirect URLs, Supabase may redirect to the root (/) instead. Add them so password reset and verification work correctly.

**Site URL:** `https://software-saree-order.vercel.app`

---

## 2. Email Going to Spam – How to Fix

To reduce verification emails landing in Spam:

### A. Use Custom SMTP (Best fix)
- **Project Settings** → **Auth** → **SMTP Settings**
- Enable **Custom SMTP** and use a verified provider (Resend, SendGrid, Postmark, etc.)
- Use a **custom domain** for the "From" address (e.g. `noreply@yourdomain.com`)
- Ensure the From address matches your domain

### B. Add DNS Records (SPF, DKIM, DMARC)

At your domain registrar, add:

| Record | Type | Name | Value |
|--------|------|------|-------|
| SPF | TXT | @ | `v=spf1 include:_spf.supabase.co ~all` |
| DKIM | TXT | (from SMTP provider) | Get from Resend/SendGrid |
| DMARC | TXT | _dmarc | `v=DMARC1; p=none; rua=mailto:you@yourdomain.com` |

### C. Confirm signup email with “Open Gmail” link

So the verification email includes a link that opens the Gmail app (on mobile) or Gmail in the browser (on desktop):

1. **Supabase** → **Authentication** → **Email Templates** → **Confirm signup**
2. In the **Message (HTML)** body, add the “Open Gmail” block below (e.g. after the main confirm button/link).

**Snippet to add (paste before `</body>` or after the confirmation link):**

```html
<p style="margin-top: 24px;">Or open Gmail to find this email:</p>
<p>
  <a href="googlegmail://" style="display: inline-block; margin-right: 12px; color: #2563eb;">Open Gmail App</a>
  <a href="https://mail.google.com" style="color: #2563eb;">Open Gmail (web)</a>
</p>
```

- **Open Gmail App** uses `googlegmail://` so on mobile it can open the Gmail app.
- **Open Gmail (web)** opens https://mail.google.com in the browser (desktop or fallback).

3. Keep the main confirmation link (e.g. `{{ .ConfirmationURL }}`) in the template so users can still verify from the email.
4. Remove words like: FREE, ACT NOW, URGENT, GUARANTEED. Keep HTML valid.

### D. Checklist

1. Enable Custom SMTP in Supabase with Resend/SendGrid
2. Add SPF, DKIM, DMARC DNS records for your domain
3. Add `https://software-saree-order.vercel.app/verify-success/**` to Redirect URLs
4. Test registration and check inbox (not Spam)

## Reference

- [Supabase Auth Emails](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
