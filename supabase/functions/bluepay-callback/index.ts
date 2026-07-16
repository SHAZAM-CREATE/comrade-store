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
    const event = payload.event as string;
    const accountReference = payload.data?.account_reference;

    if (!accountReference) {
      return new Response(JSON.stringify({ error: 'Missing account_reference' }), { status: 400 });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const succeeded = event === 'mpesa.payment.received';
    const newStatus = succeeded ? 'success' : 'failed';

    const { data: payment, error: updateErr } = await admin
      .from('payments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', accountReference)
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