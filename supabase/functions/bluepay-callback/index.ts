// supabase/functions/bluepay-callback/index.ts
//
// Set this function's deployed URL as your "Callback URL" in the
// bluepay.co.ke dashboard (Account → Callback URL), AND it's also sent
// per-request as callback_url from bluepay-initiate for redundancy.
// BluePay POSTs a JSON event here on every payment success/failure,
// signed with HMAC-SHA256 over the raw request body using your API secret.
//
// Deploy with:
//   supabase functions deploy bluepay-callback --no-verify-jwt
// (--no-verify-jwt because BluePay calls this anonymously — we verify
// the HMAC signature ourselves instead of a Supabase user JWT.)
//
// Required secrets: BLUEPAY_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifySignature(rawBody: string, sigHeader: string | null, secret: string): Promise<boolean> {
  const match = /^v1=([a-f0-9]{64})$/.exec(sigHeader ?? '');
  if (!match) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expectedHex = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (expectedHex.length !== match[1].length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) diff |= expectedHex.charCodeAt(i) ^ match[1].charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get('X-BluePay-Signature');
    const secret = Deno.env.get('BLUEPAY_API_SECRET')!;

    const validSig = await verifySignature(rawBody, sigHeader, secret);
    if (!validSig) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    // Events per BluePay docs: mpesa.payment.received / mpesa.payment.failed
    const event = payload.event as string;
    const accountReference = payload.data?.account_reference;
    const checkoutRequestId = payload.data?.checkout_request_id;

    if (!accountReference && !checkoutRequestId) {
      return new Response(JSON.stringify({ error: 'Missing account_reference and checkout_request_id' }), { status: 400 });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const succeeded = event === 'mpesa.payment.received';
    const newStatus = succeeded ? 'success' : 'failed';

    // Match on BluePay's own generated account_reference (stored in
    // provider_reference at STK time) — fall back to checkout_request_id
    // if that's ever unavailable.
    let query = admin.from('payments').update({ status: newStatus, updated_at: new Date().toISOString() });
    query = accountReference
      ? query.eq('provider_reference', accountReference)
      : query.eq('checkout_request_id', checkoutRequestId);

    const { data: payment, error: updateErr } = await query.select().single();

    if (updateErr || !payment) {
      return new Response(JSON.stringify({ error: updateErr?.message ?? 'Payment not found' }), { status: 404 });
    }

    if (succeeded) {
      await admin
        .from('unlocks')
        .upsert({ user_id: payment.user_id, product_id: payment.product_id }, { onConflict: 'user_id,product_id' });
    }

    // Return 2xx quickly — BluePay does not retry webhooks.
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});