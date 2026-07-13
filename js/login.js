import { supabase } from './supabase-client.js';
import { loginWithUsername } from './auth.js';

function showError(msg) {
  const box = document.getElementById('errorBox');
  if (!msg) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.textContent = msg;
}

async function handleLogin(ev) {
  ev.preventDefault();
  showError(null);
  const f = new FormData(ev.target);
  const btn = ev.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Logging in…';
  try {
    await loginWithUsername({ username: f.get('username').trim(), password: f.get('password') });
    window.location.href = 'index.html';
  } catch (e) {
    showError(e.message || 'Could not log in.');
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
}

async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = 'index.html';
}

redirectIfLoggedIn();
document.getElementById('loginForm').addEventListener('submit', handleLogin);