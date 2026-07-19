import { supabase } from './supabase-client.js';
import { requestPasswordReset, setNewPassword } from './auth.js';

function showError(msg) {
  const box = document.getElementById('errorBox');
  if (!msg) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.textContent = msg;
}
function showInfo(msg) {
  const box = document.getElementById('infoBox');
  if (!msg) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.textContent = msg;
}

function showRequestForm() {
  document.getElementById('requestForm').style.display = 'block';
  document.getElementById('newPasswordForm').style.display = 'none';
  document.getElementById('subtext').textContent = "Enter your email and we'll send you a reset link.";
}
function showNewPasswordForm() {
  document.getElementById('requestForm').style.display = 'none';
  document.getElementById('newPasswordForm').style.display = 'block';
  document.getElementById('subtext').textContent = 'Choose a new password for your account.';
}

async function handleRequest(ev) {
  ev.preventDefault();
  showError(null); showInfo(null);
  const f = new FormData(ev.target);
  const btn = ev.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    await requestPasswordReset(f.get('email').trim());
    showInfo('Check your email for a password reset link.');
  } catch (e) {
    showError(e.message || 'Could not send reset email.');
  }
  btn.disabled = false;
  btn.textContent = 'Send reset link';
}

async function handleSetPassword(ev) {
  ev.preventDefault();
  showError(null); showInfo(null);
  const f = new FormData(ev.target);
  const btn = ev.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await setNewPassword(f.get('password'));
    showInfo('Password updated! Redirecting to login…');
    await supabase.auth.signOut();
    setTimeout(() => { window.location.href = 'login'; }, 1500);
  } catch (e) {
    showError(e.message || 'Could not update password.');
    btn.disabled = false;
    btn.textContent = 'Set new password';
  }
}

// Supabase fires PASSWORD_RECOVERY when the user arrives via the emailed
// link (it also attaches a temporary session so updateUser works).
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') showNewPasswordForm();
});

showRequestForm();
document.getElementById('requestForm').addEventListener('submit', handleRequest);
document.getElementById('newPasswordForm').addEventListener('submit', handleSetPassword);