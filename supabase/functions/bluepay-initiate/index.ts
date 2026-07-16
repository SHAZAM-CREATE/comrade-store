import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
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
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}