import { registerUser } from './auth.js';

function showError(msg) {
  const box = document.getElementById('errorBox');
  if (!msg) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.textContent = msg;
}

async function handleRegister(ev) {
  ev.preventDefault();
  showError(null);
  const f = new FormData(ev.target);
  const btn = ev.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Creating account…';
  try {
    await registerUser({
      username: f.get('username').trim(),
      email: f.get('email').trim(),
      phone: f.get('phone').trim(),
      password: f.get('password'),
    });
    window.location.href = 'login.html?registered=1';
  } catch (e) {
    showError(e.message || 'Could not create account.');
    btn.disabled = false;
    btn.textContent = 'Create account';
  }
}

document.getElementById('registerForm').addEventListener('submit', handleRegister);