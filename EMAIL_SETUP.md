# Email & Verification Setup

## 1. Verification Link → Show "Verified" + "Open App"

**Required:** Add these to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** (one per line):

```
https://software-saree-order.vercel.app/**
https://software-saree-order.vercel.app/verify-success/**
http://localhost:3000/**
```

If `/verify-success/` is **not** in Redirect URLs, Supabase will redirect to the root (/) and the user may see the dashboard instead of the "Verified" page. Adding it fixes this.

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

### C. Edit Email Template

- **Authentication** → **Email Templates** → **Confirm signup**
- Remove words like: FREE, ACT NOW, URGENT, GUARANTEED
- Use clear, professional wording
- Keep HTML valid (no broken tags)

### D. Checklist

1. Enable Custom SMTP in Supabase with Resend/SendGrid
2. Add SPF, DKIM, DMARC DNS records for your domain
3. Add `https://software-saree-order.vercel.app/verify-success/**` to Redirect URLs
4. Test registration and check inbox (not Spam)

## Reference

- [Supabase Auth Emails](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
