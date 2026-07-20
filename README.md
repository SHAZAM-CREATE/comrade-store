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

  # Comrade Store — Admin App

This is the admin dashboard, deployed **completely separately** from the
public marketplace site. It uses the same Supabase project/database, but
lives on its own domain, its own Vercel project, and its own repo (or a
separate folder if you keep one repo — either works).

Why separate: once the public site allows anonymous browsing, keeping the
admin dashboard bundled into that same deployment means its code (and the
fact that an `/admin` URL even exists) ships to every visitor's browser.
This way, nothing about the admin tool is part of the public site at all.

## Why this app has its own login page

Browser sessions are scoped per-domain. Logging into `comradestore.co.ke`
does **not** log you into a separate domain like
`admin-comradestore.vercel.app` — that's just how browser storage works,
not a Supabase limitation. So this app has its own small `login.html`
that signs in against the **same** Supabase project (same users, same
`is_admin` flag) but keeps its own session locally. You'll use the same
username/password here as on the public site — there's no separate admin
account system, just the same accounts with `is_admin = true`.

## Deploying it

1. **Push this folder to its own GitHub repo** (or a separate folder in
   your existing repo, then set Vercel's "Root Directory" to this
   folder when importing the project).
2. **Vercel → Add New → Project** → import it → Framework preset:
   **Other** → deploy. You'll get a URL like
   `admin-comradestore.vercel.app`.
3. *(Optional but recommended)* Buy or reuse a subdomain like
   `admin.comradestore.co.ke` and attach it in Vercel → Settings →
   Domains, same way you did for the main site.
4. **Update `js/config.js` in the MAIN site's project** —
   set `ADMIN_APP_URL` to wherever this app ends up deployed, so the
   "Admin" link shown to admin accounts on the public site points here.
5. **Supabase → Authentication → URL Configuration** — you don't need to
   add this domain to Redirect URLs, since this app doesn't use the
   password-reset email flow (admins reset their password via the
   public site if needed, same account).

## Keeping it in sync

`js/admin.js`, `js/auth.js`, `js/utils.js`, `js/supabase-client.js`,
`js/footer.js`, and `css/style.css` here are copies of the same files in
the main project. If you make future changes to the admin dashboard
logic (e.g. adding a new report), make them here — this app no longer
shares a live codebase with the public site, so changes don't
automatically sync either direction.

## Restricting who can even find this

- The URL isn't linked from anywhere public (main site links to it only
  for logged-in accounts with `is_admin = true`, and even then, opens in
  a new tab rather than being crawlable).
- `<meta name="robots" content="noindex,nofollow">` is set on
  `index.html` and `login.html`, so it won't show up in search results
  even if a URL leaks somewhere.
- Even if someone finds the URL and creates an account, `admin.js`
  checks `profile.is_admin` after login and shows an access-denied
  screen for anyone who isn't flagged — the actual data behind every
  table is still protected by Supabase Row Level Security regardless of
  what the frontend shows.