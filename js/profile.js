import { supabase } from './supabase-client.js';
import { requireAuth, wireLogoutButton } from './auth.js';
import { esc } from './utils.js';

let profile;

function renderUserChip(p) {
  const chip = document.getElementById('userChip');
  chip.innerHTML = `
    <div class="avatar">${esc((p.username || p.email || '?').slice(0, 2).toUpperCase())}</div>
    <span>${esc(p.username || p.email)}</span>
  `;
  document.getElementById('logoutSection').style.display = 'block';
  wireLogoutButton(document.getElementById('logoutBtn'));
}

function fillForm(p) {
  document.getElementById('usernameInput').value = p.username || '';
  document.getElementById('phoneInput').value = p.phone || '';
  document.getElementById('institutionInput').value = p.institution || '';
  document.getElementById('townInput').value = p.town || '';
}

async function handleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('saveBtn');
  const status = document.getElementById('saveStatus');
  status.textContent = '';
  status.className = 'status-note';

  const newUsername = document.getElementById('usernameInput').value.trim();
  const phone = document.getElementById('phoneInput').value.trim();
  const institution = document.getElementById('institutionInput').value.trim();
  const town = document.getElementById('townInput').value.trim();

  if (!newUsername) {
    status.textContent = 'Username is required.';
    status.className = 'status-note fail';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  // Only check uniqueness if the username actually changed.
  if (newUsername !== profile.username) {
    const { data: taken, error: lookupErr } = await supabase.rpc('username_exists', { p_username: newUsername });
    if (lookupErr) {
      status.textContent = 'Could not verify username. Try again.';
      status.className = 'status-note fail';
      btn.disabled = false;
      btn.textContent = 'Save changes';
      return;
    }
    if (taken) {
      status.textContent = 'That username is already taken.';
      status.className = 'status-note fail';
      btn.disabled = false;
      btn.textContent = 'Save changes';
      return;
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ username: newUsername, phone, institution, town })
    .eq('id', profile.id);

  if (error) {
    status.textContent = 'Something went wrong saving your profile.';
    status.className = 'status-note fail';
    btn.disabled = false;
    btn.textContent = 'Save changes';
    return;
  }

  profile.username = newUsername;
  profile.phone = phone;
  profile.institution = institution;
  profile.town = town;

  status.textContent = 'Saved!';
  status.className = 'status-note success';
  btn.disabled = false;
  btn.textContent = 'Save changes';
  renderUserChip(profile);
}

async function init() {
  profile = await requireAuth();
  if (!profile) return; // requireAuth already redirected to login

  renderUserChip(profile);
  fillForm(profile);
  document.getElementById('profileForm').addEventListener('submit', handleSubmit);
}

init();