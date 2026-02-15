# Email Deliverability (SPF, DKIM, DMARC)

To reduce verification emails landing in Spam and improve deliverability:

## 1. Supabase Dashboard

### Auth URL Configuration
- **Supabase Dashboard** → **Authentication** → **URL Configuration**
- **Site URL**: Your production URL (e.g. `https://software-saree-order.vercel.app`)
- **Redirect URLs**: Add:
  - `https://software-saree-order.vercel.app/**`
  - `https://software-saree-order.vercel.app/verify-success/**`
  - `http://localhost:3000/**` (for local dev)

### Custom SMTP (Recommended for better deliverability)
- **Project Settings** → **Auth** → **SMTP Settings**
- Enable **Custom SMTP** and use a verified provider (Resend, SendGrid, Postmark, etc.)
- Use a **custom domain** for the "From" address (e.g. `noreply@yourdomain.com`)
- Ensure the From address matches your domain

### Email Templates
- **Authentication** → **Email Templates**
- Avoid spam-trigger words (FREE, ACT NOW, URGENT, etc.)
- Keep HTML valid (no broken tags)
- Use plain text or simple HTML

## 2. DNS Records (for custom domain emails)

If using a custom domain for SMTP, add these DNS records at your domain registrar:

### SPF Record
```
Type: TXT
Name: @ (or your domain)
Value: v=spf1 include:_spf.supabase.co ~all
```
(Adjust if using a different SMTP provider – e.g. Resend: `include:sendgrid.net`)

### DKIM Record
- Your SMTP provider (Resend, SendGrid, etc.) will provide DKIM records
- Add the TXT record they give you (name and value)
- Supabase: **Project Settings** → **Auth** → check for DKIM if using custom SMTP

### DMARC Record (optional but recommended)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```
(Change `p=quarantine` or `p=reject` once you're confident)

## 3. Verify Configuration

- Ensure the "From" email address is verified in your SMTP provider
- Test sending from Supabase Dashboard
- Check that emails land in Primary inbox after applying SPF/DKIM

## Reference

- [Supabase Auth Emails](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
