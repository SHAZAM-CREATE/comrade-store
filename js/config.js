// ============================================================
// Comrade Store — configuration
// Fill these in with your own project values. This is the only
// file you should need to edit to point the app at your backend.
// ============================================================

// Supabase project settings: Project Settings → API in your Supabase dashboard.
export const SUPABASE_URL = "https://fttwibvdjqegngthpbtx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_bwd54nGvG3yRU5IQn3aNbw_Y8kOoafg";

// Price (in KES) charged to unlock a seller's contact details.
export const UNLOCK_FEE_KES = 20;

// Name of the Supabase Edge Function that starts an STK push.
// See /supabase/functions/payhero-initiate for the server-side code
// (that function holds your real PayHero username/password — never
// put those secrets in this file, since this file ships to the browser).
export const PAYMENT_INITIATE_FUNCTION = "payhero-initiate";