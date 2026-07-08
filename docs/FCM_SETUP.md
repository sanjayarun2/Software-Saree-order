# Firebase Cloud Messaging (FCM) setup

Industry-standard push notifications so the Velo app alerts you when a customer pays on the website — even when the app is fully closed.

## Overview

| Component | Role |
|-----------|------|
| **Firebase project** | Issues FCM tokens to Android devices |
| **Velo app** | Registers FCM token → Supabase `push_device_tokens` |
| **API key (Settings → API)** | Per-client link to their shop — used for order sync **and** server push poll |
| **Shop webhook** (optional, fastest) | On paid order → `notify-velo-order-push` |
| **Server poll** `poll-velo-order-push` | Every 2 min: polls each client's shop API using their saved key → FCM push |
| **Dedupe** `push_notified_orders` | Prevents double alerts (webhook + poll + in-app) |

### Two paths (industry standard)

1. **Event-driven (webhook)** — instant when shop calls Supabase after payment.
2. **Polling (server cron)** — works when user only adds API key in Velo; **no shop code changes required**.

Both paths use the same FCM delivery and dedupe table.

## 1. Create Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Add project (or use existing)
3. **Add Android app** with package name: `com.sareeorder.app`
4. Download **`google-services.json`**
5. Place it at: `android/app/google-services.json`

Without this file, the Android build skips the Google Services plugin and push will not work (the app still runs; in-app polling alerts remain).

Also keep **`NEXT_PUBLIC_ENABLE_FCM_PUSH` unset** (or not `true`) until `google-services.json` is in the APK. Otherwise older builds could call `PushNotifications.register()` and crash Android on login.

## 2. Firebase service account (server)

1. Firebase Console → Project settings → **Service accounts**
2. **Generate new private key** → save JSON
3. In **Supabase Dashboard** → Edge Functions → Secrets, set:

```
FCM_SERVICE_ACCOUNT_JSON=<paste entire JSON on one line>
VELO_PUSH_WEBHOOK_SECRET=<random long secret, e.g. openssl rand -hex 32>
```

## 3. Deploy Supabase migration + edge function

```bash
# Apply migration (push_device_tokens table)
supabase db push

# Deploy edge function
supabase functions deploy notify-velo-order-push --no-verify-jwt
```

`--no-verify-jwt` is required because the shop calls this function with a webhook secret, not a user JWT.

## 4. Deploy edge functions + schedule server poll

```bash
supabase db push   # push_notified_orders + last_push_poll_at
supabase functions deploy notify-velo-order-push --no-verify-jwt
supabase functions deploy poll-velo-order-push --no-verify-jwt
```

Enable cron (every 2 minutes) in **Supabase Dashboard → Edge Functions → poll-velo-order-push → Schedules**, or use `supabase/config.toml` cron section.

Manual test:

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/poll-velo-order-push" \
  -H "x-velo-push-secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d "{}"
```

## 5. Configure shop webhook (optional — faster than poll)

Add environment variables on **each shop** (e.g. sakthi-textiles-shop):

| Variable | Example |
|----------|---------|
| `VELO_PUSH_NOTIFY_URL` | `https://YOUR_PROJECT.supabase.co/functions/v1/notify-velo-order-push` |
| `VELO_PUSH_WEBHOOK_SECRET` | Same value as Supabase `VELO_PUSH_WEBHOOK_SECRET` |

Redeploy the shop after adding these. **If you skip this, server poll still works** using the API key saved in Velo.

## 6. Build new APK

After adding `google-services.json`, enable FCM in the web build (GitHub Actions → repository secret or workflow env):

```
NEXT_PUBLIC_ENABLE_FCM_PUSH=true
```

```bash
git pull
npm run apk
```

Install the APK, log in, enable **Settings → Website order alerts**, and allow notification permission when prompted.

## 7. Test

1. **Settings → Test order alert** — confirms sound + local notification while app is open
2. Close the app completely (swipe away from recents)
3. Place a test order on the website and complete payment
4. You should receive a push notification with the cling sound

## Troubleshooting

| Symptom | Check |
|---------|--------|
| No push when app closed | Latest APK? Notifications allowed? API key saved in Velo? `poll-velo-order-push` deployed + scheduled? |
| `{ polled: N, pushed: 0 }` | No new **paid** orders in last 30 min, or already deduped |
| Push works on web test but not APK | Rebuild APK after adding `google-services.json` |
| `{ sent: 0, message: "No registered devices" }` | Log into Velo app on phone; ensure notifications allowed |
| `{ sent: 0, message: "No Velo users for this shop" }` | Velo **Settings → API** has enabled integration with matching shop URL |

## How it works with in-app alerts

- **App closed / background:** FCM delivers push (this setup)
- **App open:** FCM + in-app poll (~15s) both use dedupe — you won't get double alerts for the same order
- **First login sync:** Only orders from the last 5 minutes trigger in-app alerts (avoids burst of old orders)
