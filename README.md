# Comrade Store

A campus resale marketplace, split into plain HTML/CSS/JS pages backed
by Supabase (database + auth) and PayHero (M-Pesa STK push payments).

## File map

```
index.html            Home feed (requires login)
login.html             Log in
register.html          Create account
reset-password.html    Forgot / set new password
post-item.html          List an item (with map picker)
product.html            Item detail, map + travel times, contact unlock

css/style.css           All styles

js/config.js             ← the only file you edit to point at your project
js/supabase-client.js    Shared Supabase client
js/utils.js              Pure helpers (categories, distance/time math, escaping)
js/auth.js               Register / login / logout / password reset
js/app.js                Home feed logic
js/post.js               Post-item form + map
js/detail.js             Item detail page + unlock flow
js/payment.js            Talks to the payhero-initiate Edge Function
js/login.js / register.js / reset-password.js   Small per-page glue scripts

sql/schema.sql            Run once in the Supabase SQL editor

supabase/functions/payhero-initiate/    Edge Function: starts the STK push
supabase/functions/payhero-callback/    Edge Function: receives PayHero's result
```

Because pages use `<script type="module">` and `import`, open them
through a local server rather than `file://` (e.g. `npx serve .`, or the
Live Server VS Code extension), or just deploy the folder as-is to any
static host (Netlify, Vercel, GitHub Pages, Supabase Storage, etc).

## 1. Set up Supabase

1. Create a project at supabase.com.
2. In **SQL Editor**, run `sql/schema.sql`. It creates `profiles`,
   `products`, `unlocks`, `payments`, row-level-security policies, and a
   `get_email_by_username` function (needed because the app logs people
   in by username, while Supabase Auth itself is email/password).
3. In **Project Settings → API**, copy the Project URL and anon public
   key into `js/config.js`.
4. Email confirmation: if you leave Supabase's "Confirm email" setting
   on (the default), new users must click a confirmation link before
   they can log in. Turn it off in **Authentication → Providers → Email**
   if you want instant login after registering, which suits a small
   campus app better.

## 2. Deploy the two payment Edge Functions

These hold your BluePay credentials server-side — never put an API
secret in a file that ships to the browser.

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy bluepay-initiate
supabase functions deploy bluepay-callback --no-verify-jwt

supabase secrets set \
  BLUEPAY_API_SECRET=your_bluepay_api_secret \
  BLUEPAY_CHANNEL_ID=your_channel_uuid
```

Get these from your bluepay.co.ke dashboard:
- **API secret** — Dashboard → **API Keys** (use the secret key, Bearer auth)
- **Channel UUID** — Dashboard → **Payment channels** (the `channel_id`, not a password)

Then, in the bluepay.co.ke dashboard under **Account → Callback URL**, set:
```
https://YOUR_PROJECT_REF.functions.supabase.co/bluepay-callback
```
That's how BluePay tells your app a payment succeeded or failed.

In `js/config.js`, `PAYMENT_INITIATE_FUNCTION` should be `"bluepay-initiate"` (already set).

## 3. How the payment flow works

1. Buyer taps **Unlock contact** on `product.html` → `js/payment.js`
   calls the `bluepay-initiate` function with their phone number.
2. The function creates a `pending` row in `payments`, then asks
   BluePay's API (`POST https://bluepay.co.ke/api/stk_push.php`) to push
   an M-Pesa prompt to that phone, using your `channel_id` and our
   internal payment id as the `account_reference`.
3. The buyer enters their M-Pesa PIN. BluePay POSTs a signed webhook
   (`X-BluePay-Signature: v1=<HMAC-SHA256 of the raw body>`) to
   `bluepay-callback`, which verifies the signature, flips the row to
   `success` or `failed`, and — on success — inserts a row in `unlocks`.
4. The browser is watching that `payments` row over Supabase Realtime
   (with a polling fallback), so the contact number appears the moment
   payment clears — no page refresh needed.

BluePay also exposes a polling endpoint (`POST /api/payment_status.php`)
as a backup in case a webhook is ever missed — worth knowing about if
you want to add a manual "check status" retry later, though the
webhook + Realtime combination already covers the normal case.

## About the two payment providers

This project ships with working Edge Functions for **both** BluePay
(`supabase/functions/bluepay-*`) and PayHero (`supabase/functions/payhero-*`).
`js/config.js` currently points at BluePay (`PAYMENT_INITIATE_FUNCTION =
"bluepay-initiate"`). If you ever want to switch back to PayHero, deploy
its two functions, set its secrets (see git history / the PayHero
function's own comments), and change that one config line — `js/payment.js`
doesn't need to change either way, since it just calls whichever function
name is configured.

## Notes

- Contact numbers, product locations, and the feed are all live via
  Supabase Postgres — no more browser-only `window.storage`.
- `get_email_by_username` is a `SECURITY DEFINER` function scoped to
  return only a single matching email, so anonymous users can look up
  *just enough* to log in without being able to browse the users table.
- Row Level Security means a signed-in user can only ever edit their own
  products/profile, and can only see their own payment/unlock rows.