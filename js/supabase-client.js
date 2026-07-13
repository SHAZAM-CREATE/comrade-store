// Shared Supabase client used by every page.
// Uses the ESM build of supabase-js v2 straight from a CDN, so no
// bundler/build step is required — just open the .html files.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // needed for the password-reset email link
  },
});