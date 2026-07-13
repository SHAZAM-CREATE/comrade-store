// supabase/functions/payhero-callback/index.ts
//
// PayHero POSTs the outcome of an STK push to this URL (the same one
// passed as `callback_url` in payhero-initiate). It carries the
// `external_reference` we set to our internal payments.id, and a status
// telling us whether the customer completed or cancelled the payment.
//
// Deploy with:
//   supabase functions deploy payhero-callback --no-verify-jwt
// (--no-verify-jwt because PayHero calls this anonymously, not with a
// Supabase user JWT — the endpoint validates the payload shape instead.)
//
// Set PUBLIC_CALLBACK_URL in payhero-initiate's secrets to this
// function's deployed URL, and register the same URL as your default
// webhook in the PayHero dashboard as a fallback.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    // PayHero's callback body nests the transaction result — see their
    // docs for the exact shape; this reads the two fields we rely on.
    const externalReference = payload?.response?.ExternalReference ?? payload?.ExternalReference;
    const resultCode = payload?.response?.ResultCode ?? payload?.ResultCode;
    const checkoutRequestId = payload?.response?.CheckoutRequestID ?? payload?.CheckoutRequestID;

    if (!externalReference) {
      return new Response(JSON.stringify({ error: 'Missing ExternalReference' }), { status: 400 });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const succeeded = String(resultCode) === '0';
    const newStatus = succeeded ? 'success' : 'failed';

    const { data: payment, error: updateErr } = await admin
      .from('payments')
      .update({ status: newStatus, checkout_request_id: checkoutRequestId ?? null, updated_at: new Date().toISOString() })
      .eq('id', externalReference)
      .select()
      .single();

    if (updateErr || !payment) {
      return new Response(JSON.stringify({ error: updateErr?.message ?? 'Payment not found' }), { status: 404 });
    }

    if (succeeded) {
      await admin
        .from('unlocks')
        .upsert({ user_id: payment.user_id, product_id: payment.product_id }, { onConflict: 'user_id,product_id' });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});