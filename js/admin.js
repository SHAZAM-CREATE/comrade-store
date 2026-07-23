import { supabase } from './supabase-client.js';
import { requireAuth, wireLogoutButton } from './auth.js';
import { esc, PRODUCT_PUBLIC_COLUMNS, compressImage } from './utils.js';

let users = [], payments = [], soldProducts = [], emailLogs = [];

function fmtKES(n) {
  return `KES ${Number(n || 0).toLocaleString()}`;
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

async function loadAll() {
  const [{ data: userRows, error: userErr }, { data: paymentRows, error: payErr }, { data: soldRows, error: soldErr }, { data: emailRows, error: emailErr }] = await Promise.all([
    supabase.rpc('admin_list_users'),
    supabase.from('payments').select('*, products(title), profiles(username)').order('created_at', { ascending: false }),
    supabase.from('products').select(`${PRODUCT_PUBLIC_COLUMNS}, profiles(username)`).eq('status', 'sold').order('created_at', { ascending: false }),
    supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  if (userErr) console.error(userErr);
  if (payErr) console.error(payErr);
  if (soldErr) console.error(soldErr);
  if (emailErr) console.error(emailErr);
  users = userRows || [];
  payments = paymentRows || [];
  soldProducts = soldRows || [];
  emailLogs = emailRows || [];
}

function renderStats() {
  const successful = payments.filter(p => p.status === 'success');
  const totalRevenue = successful.reduce((sum, p) => sum + Number(p.amount), 0);
  const thisYear = new Date().getFullYear();
  const thisYearRevenue = successful.filter(p => new Date(p.created_at).getFullYear() === thisYear).reduce((sum, p) => sum + Number(p.amount), 0);

  const cards = [
    { label: 'Total users', value: users.length },
    { label: 'All-time revenue', value: fmtKES(totalRevenue) },
    { label: `Revenue in ${thisYear}`, value: fmtKES(thisYearRevenue) },
    { label: 'Successful payments', value: successful.length },
    { label: 'Sold items', value: soldProducts.length },
  ];
  document.getElementById('statGrid').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-label">${esc(c.label)}</div>
      <div class="stat-value">${esc(c.value)}</div>
    </div>`).join('');
}

function renderMonthlyRevenue() {
  const successful = payments.filter(p => p.status === 'success');
  const byMonth = {};
  for (const p of successful) {
    const key = monthKey(p.created_at);
    byMonth[key] = (byMonth[key] || 0) + Number(p.amount);
  }
  const keys = Object.keys(byMonth).sort().reverse();
  const table = document.getElementById('monthlyTable');
  if (keys.length === 0) { table.innerHTML = `<tr><td class="admin-empty">No successful payments yet.</td></tr>`; return; }
  table.innerHTML = `
    <thead><tr><th>Month</th><th>Revenue</th></tr></thead>
    <tbody>${keys.map(k => `<tr><td>${esc(monthLabel(k))}</td><td class="num">${fmtKES(byMonth[k])}</td></tr>`).join('')}</tbody>`;
}

function renderYearlyRevenue() {
  const successful = payments.filter(p => p.status === 'success');
  const byYear = {};
  for (const p of successful) {
    const y = new Date(p.created_at).getFullYear();
    byYear[y] = (byYear[y] || 0) + Number(p.amount);
  }
  const years = Object.keys(byYear).sort().reverse();
  const table = document.getElementById('yearlyTable');
  if (years.length === 0) { table.innerHTML = `<tr><td class="admin-empty">No successful payments yet.</td></tr>`; return; }
  table.innerHTML = `
    <thead><tr><th>Year</th><th>Revenue</th></tr></thead>
    <tbody>${years.map(y => `<tr><td>${esc(y)}</td><td class="num">${fmtKES(byYear[y])}</td></tr>`).join('')}</tbody>`;
}

function renderUsers() {
  const table = document.getElementById('usersTable');
  if (users.length === 0) { table.innerHTML = `<tr><td class="admin-empty">No users found.</td></tr>`; return; }
  table.innerHTML = `
    <thead><tr><th>Username</th><th>Email</th><th>Phone</th><th>Joined</th><th>Role</th></tr></thead>
    <tbody>${users.map(u => `
      <tr>
        <td>${esc(u.username)}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.phone || '—')}</td>
        <td>${fmtDate(u.created_at)}</td>
        <td>${u.is_admin ? '<span class="badge admin">Admin</span>' : '—'}</td>
      </tr>`).join('')}</tbody>`;
}

function renderPayments() {
  const table = document.getElementById('paymentsTable');
  if (payments.length === 0) { table.innerHTML = `<tr><td class="admin-empty">No payments yet.</td></tr>`; return; }
  table.innerHTML = `
    <thead><tr><th>Date</th><th>Buyer</th><th>Item</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody>${payments.map(p => `
      <tr>
        <td>${fmtDate(p.created_at)}</td>
        <td>${esc(p.profiles?.username || '—')}</td>
        <td>${esc(p.products?.title || '—')}</td>
        <td class="num">${fmtKES(p.amount)}</td>
        <td><span class="badge ${p.status}">${esc(p.status)}</span></td>
      </tr>`).join('')}</tbody>`;
}

function renderSold() {
  const table = document.getElementById('soldTable');
  if (soldProducts.length === 0) { table.innerHTML = `<tr><td class="admin-empty">No sold items.</td></tr>`; return; }
  table.innerHTML = `
    <thead><tr><th>Item</th><th>Seller</th><th>Price</th><th>Posted</th><th></th></tr></thead>
    <tbody>${soldProducts.map(p => `
      <tr>
        <td>${esc(p.title)}</td>
        <td>${esc(p.profiles?.username || '—')}</td>
        <td class="num">${fmtKES(p.price)}</td>
        <td>${fmtDate(p.created_at)}</td>
        <td><button class="icon-btn" data-id="${p.id}">Delete</button></td>
      </tr>`).join('')}</tbody>`;
  table.querySelectorAll('button.icon-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
  });
}

async function deleteProduct(id) {
  if (!confirm('Delete this listing permanently?')) return;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  soldProducts = soldProducts.filter(p => p.id !== id);
  renderSold();
  renderStats();
}

function renderEmails() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const sentToday = emailLogs.filter(e => new Date(e.created_at) >= startOfToday).length;
  const sentThisMonth = emailLogs.filter(e => new Date(e.created_at) >= startOfMonth).length;

  const DAILY_LIMIT = 100;
  const MONTHLY_LIMIT = 3000;

  const cards = [
    { label: 'Sent today', value: `${sentToday} / ${DAILY_LIMIT}`, warn: sentToday >= DAILY_LIMIT * 0.8 },
    { label: 'Sent this month', value: `${sentThisMonth} / ${MONTHLY_LIMIT}`, warn: sentThisMonth >= MONTHLY_LIMIT * 0.8 },
    { label: 'Total logged', value: emailLogs.length },
  ];
  document.getElementById('emailStatGrid').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-label">${esc(c.label)}</div>
      <div class="stat-value" style="${c.warn ? 'color:var(--rust);' : ''}">${esc(c.value)}</div>
      ${c.warn ? '<div class="stat-sub" style="color:var(--rust);">Approaching Resend free-plan limit</div>' : ''}
    </div>`).join('');

  const table = document.getElementById('emailsTable');
  if (emailLogs.length === 0) { table.innerHTML = `<tr><td class="admin-empty">No emails logged yet.</td></tr>`; return; }
  table.innerHTML = `
    <thead><tr><th>Date</th><th>Type</th><th>Recipient</th></tr></thead>
    <tbody>${emailLogs.slice(0, 50).map(e => `
      <tr>
        <td>${fmtDate(e.created_at)}</td>
        <td><span class="badge admin">${esc(e.email_type)}</span></td>
        <td>${esc(e.recipient)}</td>
      </tr>`).join('')}</tbody>`;
}

async function fetchImageAsBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not fetch original image');
  return res.blob();
}

async function makeThumbnailFromUrl(imageUrl, productId) {
  const blob = await fetchImageAsBlob(imageUrl);
  const compressed = await compressImage(blob, 480, 0.7);
  const path = `backfill/${productId}-${Date.now()}-thumb.jpg`;
  const { error } = await supabase.storage.from('product-images').upload(path, compressed, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  });
  if (error) throw error;
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

async function backfillThumbnails() {
  const statusEl = document.getElementById('backfillStatus');
  const btn = document.getElementById('backfillBtn');
  btn.disabled = true;
  statusEl.textContent = 'Finding listings without a thumbnail…';

  const { data: rows, error } = await supabase
    .from('products')
    .select('id, image_url')
    .is('thumbnail_url', null)
    .not('image_url', 'is', null);

  if (error) {
    statusEl.textContent = 'Error: ' + error.message;
    btn.disabled = false;
    return;
  }
  if (!rows || rows.length === 0) {
    statusEl.textContent = 'Nothing to do — every listing already has a thumbnail.';
    btn.disabled = false;
    return;
  }

  let done = 0, failed = 0;
  for (const row of rows) {
    statusEl.textContent = `Processing ${done + failed + 1} of ${rows.length}…`;
    try {
      const thumbUrl = await makeThumbnailFromUrl(row.image_url, row.id);
      const { error: updateErr } = await supabase.from('products').update({ thumbnail_url: thumbUrl }).eq('id', row.id);
      if (updateErr) throw updateErr;
      done++;
    } catch (e) {
      console.error('Backfill failed for product', row.id, e);
      failed++;
    }
  }
  statusEl.textContent = `Done — ${done} thumbnail${done === 1 ? '' : 's'} created${failed ? `, ${failed} failed (check browser console)` : ''}.`;
  btn.disabled = false;
}

function renderAll() {
  renderStats();
  renderMonthlyRevenue();
  renderYearlyRevenue();
  renderUsers();
  renderPayments();
  renderSold();
  renderEmails();
}

function wireTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.panel).classList.add('active');
    });
  });
}

async function init() {
  const profile = await requireAuth();
  if (!profile) return;
  if (!profile.is_admin) { window.location.href = 'index'; return; }

  document.getElementById('userChipName').textContent = profile.username || profile.email;
  document.getElementById('userChipAvatar').textContent = (profile.username || profile.email || '?').slice(0, 2).toUpperCase();
  wireLogoutButton(document.getElementById('logoutBtn'));

  wireTabs();
  document.getElementById('backfillBtn').addEventListener('click', backfillThumbnails);
  await loadAll();
  renderAll();
}

init();