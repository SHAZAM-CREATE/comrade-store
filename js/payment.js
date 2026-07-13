import { supabase } from './supabase-client.js';
import { PAYMENT_INITIATE_FUNCTION, UNLOCK_FEE_KES } from './config.js';

// Kicks off an M-Pesa STK push for unlocking a product's contact details.
// The actual call to PayHero (which needs a secret API username/password)
// happens server-side in the Supabase Edge Function named in config.js —
// this file never touches those credentials.
//
// onStatus(status) is called with 'pending' | 'success' | 'failed' | 'timeout'.
export async function unlockContactWithPayment({ productId, phone, onStatus }) {
  onStatus('pending');

  const { data, error } = await supabase.functions.invoke(PAYMENT_INITIATE_FUNCTION, {
    body: { productId, phone, amount: UNLOCK_FEE_KES },
  });

  if (error || !data?.paymentId) {
    onStatus('failed');
    throw error || new Error('Could not start the payment.');
  }

  return watchPayment(data.paymentId, onStatus);
}

function watchPayment(paymentId, onStatus) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearInterval(poller);
      supabase.removeChannel(channel);
      onStatus(status);
      resolve(status);
    };

    // Realtime push the moment the payhero-callback function updates the row.
    const channel = supabase
      .channel(`payment-${paymentId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'payments', filter: `id=eq.${paymentId}`,
      }, (payload) => {
        if (payload.new.status === 'success' || payload.new.status === 'failed') {
          finish(payload.new.status);
        }
      })
      .subscribe();

    // Fallback poll in case the realtime event is missed, and an
    // overall timeout in case the customer never completes the STK prompt.
    let elapsedMs = 0;
    const intervalMs = 3000;
    const timeoutMs = 90000;
    const poller = setInterval(async () => {
      elapsedMs += intervalMs;
      const { data } = await supabase.from('payments').select('status').eq('id', paymentId).maybeSingle();
      if (data && (data.status === 'success' || data.status === 'failed')) {
        finish(data.status);
      } else if (elapsedMs >= timeoutMs) {
        finish('timeout');
      }
    }, intervalMs);
  });
}