# WhatsApp Connect (multi-shop soft launch)

## What works today
- Stable Chatwoot: `https://chat.sripalanitextiles.com`
- Personal test WhatsApp → Velo Messages (manual token)
- Velo UI: Settings → Messages → **Connect WhatsApp**
- Edge Function `whatsapp-connect` provisions a **per-shop Chatwoot account** via Platform API
- `chatwoot-proxy` fail-closes to the shop’s WhatsApp inbox only

## Required one-time Meta step (cannot be automated)
Meta does not expose an API to create Facebook Login for Business Configuration IDs.

1. Open [Velo_ws App Dashboard](https://developers.facebook.com/apps/2190934024783640/)
2. Add product **Facebook Login for Business** if missing
3. **Configurations** → **Create from template** → *WhatsApp Embedded Signup Configuration With 60 Expiration Token*  
   (or custom → login variation **WhatsApp Embedded Signup**)
4. Permissions: `whatsapp_business_management`, `whatsapp_business_messaging`
5. Copy **Configuration ID**

Then set:

```bash
# Vercel + .env.local
NEXT_PUBLIC_META_APP_ID=2190934024783640
NEXT_PUBLIC_WA_ES_CONFIG_ID=<paste_config_id>

# Supabase Edge secrets
WA_ES_CONFIG_ID=<same>
```

Also set Chatwoot:

```bash
# on GCP /opt/chatwoot/.env
WHATSAPP_CONFIGURATION_ID=<same>
```

Restart Chatwoot rails/sidekiq after changing `.env`.

### JS SDK domains
In Meta App → Settings → Advanced (or Facebook Login settings), allow:
- `https://software-saree-order.vercel.app`
- `http://localhost:3000` (dev)

## Soft-launch access
App stays in **dev mode** until App Review.
Add each early shop’s Facebook user as **Tester** or **Developer** on Velo_ws.

## Phase B — public all users (blocked until)
| Requirement | Status / action |
|-------------|-----------------|
| Privacy Policy URL | Pages added: `/privacy` → set Meta App Settings → Basic to `https://software-saree-order.vercel.app/privacy` after deploy |
| Terms of Service URL | Pages added: `/terms` → set to `https://software-saree-order.vercel.app/terms` |
| Meta Business verification | Business Manager → Security Center → complete verification |
| App Review submission | Privileges for WhatsApp / Embedded Signup (Tech Provider if onboarding other WABAs) |
| App Live mode | After approval; remove Tester-only restriction |

See also soft-launch steps above before Phase B.
## Ops checklist after Config ID is set
1. `supabase secrets set` for META_*, WA_ES_CONFIG_ID, CHATWOOT_*
2. Redeploy `whatsapp-connect` + `chatwoot-proxy`
3. Deploy Vercel with `NEXT_PUBLIC_WA_ES_CONFIG_ID`
4. Tester clicks Connect WhatsApp on production
5. Confirm new Chatwoot account + inbox; phone webhook → `chat.sripalanitextiles.com`
6. Inbound phone reply appears only in that shop’s Velo Messages
7. Disconnect clears connection

## Edge secrets push (required once; Management API token expired in automation)

Secrets are ready on the Chatwoot VM at `/root/velo-wa-connect-secrets.env` and mirrored locally at `scripts/local/velo-wa-connect-secrets.env` (gitignored).

```powershell
# Create token: https://supabase.com/dashboard/account/tokens
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
$env:VELO_WA_SECRETS_FILE="c:\Users\sanjay_arun2\Downloads\Saree_order_App\scripts\local\velo-wa-connect-secrets.env"
cd c:\Users\sanjay_arun2\Downloads\Saree_order_App
node scripts/set-whatsapp-connect-secrets.mjs
```

After creating the Meta Configuration ID, append `WA_ES_CONFIG_ID=<id>` to that file and re-run the script; also set `NEXT_PUBLIC_WA_ES_CONFIG_ID` on Vercel.

## Soft-launch validation already passed
- Chatwoot Platform API create/delete account: OK
- Stable host HTTPS: OK  
- Edge functions redeployed: `whatsapp-connect` v3, `chatwoot-proxy` v4 (inbox fail-closed)
- Personal WhatsApp inbox (account 2 / inbox 7) remains for your test number
