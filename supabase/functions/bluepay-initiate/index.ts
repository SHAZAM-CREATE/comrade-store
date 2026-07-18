// supabase/functions/bluepay-initiate/index.ts
//
// Called by the browser (js/payment.js) via supabase.functions.invoke().
// Creates a `payments` row, then asks BluePay to send an M-Pesa STK push
// to the buyer's phone. BluePay will later POST the result to
// bluepay-callback (signed with HMAC-SHA256), which flips the row to
// success/failed and — on success — inserts the matching `unlocks` row.
//
// Deploy with:
//   supabase functions deploy bluepay-initiate
// Required secrets (set with `supabase secrets set KEY=value`):
//   BLUEPAY_API_SECRET       — API secret from bluepay.co.ke → API Keys
//   BLUEPAY_CHANNEL_ID       — channel UUID from bluepay.co.ke → Payment channels
//   SUPABASE_URL             — auto-provided by Supabase
//   SUPABASE_ANON_KEY        — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Browsers send a CORS preflight before the real POST, and Supabase Edge
// Functions don't add CORS headers automatically — without this, every
// call from a browser (Vercel, localhost, anywhere) gets blocked before
// your code even runs.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';

    // Client bound to the caller's own JWT, so we can verify who's asking.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Not authenticated' }, 401);
    }

    const { productId, phone, amount } = await req.json();
    if (!productId || !phone || !amount) {
      return json({ error: 'productId, phone and amount are required' }, 400);
    }

    // Service-role client for writes that bypass RLS (payments/unlocks
    // are intentionally not writable by the `authenticated` role).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: payment, error: insertErr } = await admin
      .from('payments')
      .insert({ user_id: user.id, product_id: productId, amount, phone, provider: 'bluepay', status: 'pending' })
      .select()
      .single();
    if (insertErr) return json({ error: insertErr.message }, 500);

    // account_reference is how BluePay's webhook tells us which payment
    // this was for, so we use our own payment id as that reference.
    const bpResponse = await fetch('https://bluepay.co.ke/api/stk_push.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('BLUEPAY_API_SECRET')}`,
      },
      body: JSON.stringify({
        channel_id: Deno.env.get('BLUEPAY_CHANNEL_ID'),
        phone,
        amount,
        account_reference: payment.id,
      }),
    });
    const bpData = await bpResponse.json();

    if (!bpResponse.ok || bpData.ok === false) {
      await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id);
      return json({ error: 'BluePay rejected the request', details: bpData }, 502);
    }

    await admin
      .from('payments')
      .update({
        checkout_request_id: bpData.checkout_request_id ?? null,
        provider_reference: bpData.stk_request_id ? String(bpData.stk_request_id) : null,
      })
      .eq('id', payment.id);

    return json({ paymentId: payment.id, checkoutRequestId: bpData.checkout_request_id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}