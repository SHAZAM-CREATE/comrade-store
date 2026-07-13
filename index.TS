// supabase/functions/payhero-initiate/index.ts
//
// Called by the browser (js/payment.js) via supabase.functions.invoke().
// Creates a `payments` row, then asks PayHero to send an M-Pesa STK push
// to the buyer's phone. PayHero will later POST the result to
// payhero-callback, which flips the row to success/failed and — on
// success — inserts the matching `unlocks` row.
//
// Deploy with:
//   supabase functions deploy payhero-initiate
// Required secrets (set with `supabase secrets set KEY=value`):
//   PAYHERO_USERNAME        — API username from your PayHero portal
//   PAYHERO_PASSWORD        — API password from your PayHero portal
//   PAYHERO_CHANNEL_ID      — your registered payment channel id
//   SUPABASE_URL            — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase
//   PUBLIC_CALLBACK_URL     — https://<project-ref>.functions.supabase.co/payhero-callback

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';

    // Client bound to the caller's own JWT, so we can verify who's asking
    // and rely on RLS for the `select` below.
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
      .insert({ user_id: user.id, product_id: productId, amount, phone, provider: 'payhero', status: 'pending' })
      .select()
      .single();
    if (insertErr) return json({ error: insertErr.message }, 500);

    const authToken = btoa(`${Deno.env.get('PAYHERO_USERNAME')}:${Deno.env.get('PAYHERO_PASSWORD')}`);

    const phResponse = await fetch('https://backend.payhero.co.ke/api/v2/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authToken}`,
      },
      body: JSON.stringify({
        amount,
        phone_number: phone,
        channel_id: Number(Deno.env.get('PAYHERO_CHANNEL_ID')),
        provider: 'm-pesa',
        external_reference: payment.id,
        callback_url: Deno.env.get('PUBLIC_CALLBACK_URL'),
      }),
    });
    const phData = await phResponse.json();

    if (!phResponse.ok || phData.success === false) {
      await admin.from('payments').update({ status: 'failed', provider_reference: phData.reference ?? null }).eq('id', payment.id);
      return json({ error: 'PayHero rejected the request', details: phData }, 502);
    }

    await admin
      .from('payments')
      .update({ provider_reference: phData.reference ?? null, checkout_request_id: phData.CheckoutRequestID ?? null })
      .eq('id', payment.id);

    return json({ paymentId: payment.id, reference: phData.reference });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}