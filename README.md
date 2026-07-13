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

These hold your PayHero credentials server-side — never put an API
password in a file that ships to the browser.

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy payhero-initiate
supabase functions deploy payhero-callback --no-verify-jwt

supabase secrets set \
  PAYHERO_USERNAME=your_payhero_api_username \
  PAYHERO_PASSWORD=your_payhero_api_password \
  PAYHERO_CHANNEL_ID=your_channel_id \
  PUBLIC_CALLBACK_URL=https://YOUR_PROJECT_REF.functions.supabase.co/payhero-callback
```

Get the API username/password and channel id from your PayHero portal
(app.payhero.co.ke → Payment Channels). In `js/config.js`, confirm
`PAYMENT_INITIATE_FUNCTION` matches the deployed function name
(`payhero-initiate` by default).

## 3. How the payment flow works

1. Buyer taps **Unlock contact** on `product.html` → `js/payment.js`
   calls the `payhero-initiate` function with their phone number.
2. The function creates a `pending` row in `payments`, then asks
   PayHero's API (`POST https://backend.payhero.co.ke/api/v2/payments`)
   to push an M-Pesa prompt to that phone.
3. The buyer enters their M-Pesa PIN. PayHero POSTs the result to
   `payhero-callback`, which flips the row to `success` or `failed` and,
   on success, inserts a row in `unlocks`.
4. The browser is watching that `payments` row over Supabase Realtime
   (with a polling fallback), so the contact number appears the moment
   payment clears — no page refresh needed.

## About BluePay

You mentioned bluepay.co.ke as an alternative gateway. I wasn't able to
confirm that domain's specific API from public documentation — the
"BluePay" documentation that's easy to find belongs to a US card
processor (Fiserv/BluePay) with a completely different API, so I didn't
want to hand you integration code built on a guess. If you'd like to use
bluepay.co.ke instead of PayHero, get their API docs directly from their
support/dashboard and I can adapt `payhero-initiate`/`payhero-callback`
into `bluepay-initiate`/`bluepay-callback` with the same shape (the
frontend in `js/payment.js` doesn't need to change either way — it just
calls whichever Edge Function name is set in `js/config.js`).

## Notes

- Contact numbers, product locations, and the feed are all live via
  Supabase Postgres — no more browser-only `window.storage`.
- `get_email_by_username` is a `SECURITY DEFINER` function scoped to
  return only a single matching email, so anonymous users can look up
  *just enough* to log in without being able to browse the users table.
- Row Level Security means a signed-in user can only ever edit their own
  products/profile, and can only see their own payment/unlock rows.