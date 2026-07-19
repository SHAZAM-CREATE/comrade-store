import { supabase } from './supabase-client.js';

// ---- registration ----------------------------------------------------
// Supabase Auth is email/password under the hood, so we still collect a
// username (shown throughout the app) and store it in a `profiles` row
// linked 1:1 to the auth user.
export async function registerUser({ username, email, phone, password, county, institution, town }) {
  const { data: taken, error: lookupErr } = await supabase.rpc('username_exists', { p_username: username });
  if (lookupErr) throw lookupErr;
  if (taken) throw new Error('That username is already taken.');

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, phone, county, institution, town } },
  });
  if (error) throw error;

  // If email confirmation is switched off in your Supabase project,
  // data.session will already be set and we can create the profile now.
  // If confirmation is required, the profile row is instead created the
  // first time the confirmed user logs in (see ensureProfile below).
  if (data.user) {
    await ensureProfile(data.user, { username, phone, county, institution, town });
  }
  return data;
}

async function ensureProfile(user, fallback = {}) {
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (existing) return;
  await supabase.from('profiles').insert({
    id: user.id,
    username: fallback.username ?? user.user_metadata?.username,
    phone: fallback.phone ?? user.user_metadata?.phone,
    county: fallback.county ?? user.user_metadata?.county,
    institution: fallback.institution ?? user.user_metadata?.institution,
    town: fallback.town ?? user.user_metadata?.town,
  });
}

// ---- login -------------------------------------------------------------
// The user types a username, so we first resolve it to an email via a
// SECURITY DEFINER Postgres function (see sql/schema.sql), then sign in
// normally with Supabase Auth.
export async function loginWithUsername({ username, password }) {
  const { data: email, error: rpcErr } = await supabase.rpc('get_email_by_username', { p_username: username });
  if (rpcErr) throw rpcErr;
  if (!email) throw new Error('No account with that username.');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Incorrect username or password.');
  await ensureProfile(data.user);
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
}

// ---- password reset ------------------------------------------------------
// Uses Supabase's built-in email flow: we ask it to email a link that
// lands on reset-password.html with a recovery session already attached.
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('reset-password', window.location.href).toString(),
  });
  if (error) throw error;
}

export async function setNewPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ---- session helpers -----------------------------------------------------
export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  return profile ? { ...profile, email: user.email } : { id: user.id, email: user.email };
}

// Call at the top of any page that requires a logged-in user.
// Redirects to login.html if there's no session, otherwise resolves
// with the user's profile.
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login';
    return null;
  }
  return getCurrentProfile();
}

export function wireLogoutButton(el) {
  if (!el) return;
  el.addEventListener('click', async () => {
    await logout();
    window.location.href = 'login';
  });
}