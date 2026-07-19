// supabase/functions/bluepay-initiate/index.ts
//
// Called by the browser (js/payment.js) via supabase.functions.invoke().
// Creates a `payments` row, then asks BluePay to send an M-Pesa STK push
// to the buyer's phone. We deliberately do NOT send our own
// account_reference — BluePay's channel has a required-prefix rule on
// that field ("account_reference must start with merchant prefix") that
// isn't something we can reliably predict client-side. Per BluePay's
// docs, account_reference is optional: when omitted, BluePay generates
// one itself and returns it in the response — we store that generated
// value and use it to match the later webhook instead.
//
// Deploy with:
//   supabase functions deploy bluepay-initiate
// Required secrets (set with `supabase secrets set KEY=value`):
//   BLUEPAY_API_SECRET        — API secret from bluepay.co.ke → API Keys
//   BLUEPAY_CHANNEL_ID        — channel UUID from bluepay.co.ke → Payment channels
//   PUBLIC_CALLBACK_URL       — https://<project-ref>.functions.supabase.co/bluepay-callback
//   SUPABASE_URL              — auto-provided by Supabase
//   SUPABASE_ANON_KEY         — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
        // account_reference intentionally omitted — see comment above.
        callback_url: Deno.env.get('PUBLIC_CALLBACK_URL'),
      }),
    });
    const bpData = await bpResponse.json();

    if (!bpResponse.ok || bpData.ok === false) {
      await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id);
      return json({ error: 'BluePay rejected the request', details: bpData }, 502);
    }

    // Store BluePay's own generated account_reference — this is the value
    // that will come back on the webhook, so it's what we match against.
    await admin
      .from('payments')
      .update({
        checkout_request_id: bpData.checkout_request_id ?? null,
        provider_reference: bpData.account_reference ?? null,
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