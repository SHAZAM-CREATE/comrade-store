import { supabase } from './supabase-client.js';
import { requireAuth, wireLogoutButton } from './auth.js';
import { CATEGORIES, KENYA_COUNTIES, catInfo, esc, productUrl } from './utils.js';

let allProducts = [];
let categoryFilter = 'all';
let countyFilter = 'all';
let institutionFilter = 'all';
let townFilter = 'all';

async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

function cardHtml(p) {
  const c = catInfo(p.category);
  return `
  <a class="card" href="${productUrl(p.id)}" style="text-decoration:none;color:inherit;">
    <div class="card-media">
      <span class="status-flag ${p.status}">${p.status === 'available' ? 'Available' : 'Sold'}</span>
      ${c.icon}
      <div class="pricetag">KES ${Number(p.price).toLocaleString()}</div>
    </div>
    <div class="card-body">
      <h3>${esc(p.title)}</h3>
      <div class="card-meta">
        <span class="tagchip">${c.icon} ${c.label}</span>
        <span class="tagchip">${p.condition === 'new' ? 'New' : 'Used'}</span>
        <span class="tagchip">Qty ${esc(p.quantity)}</span>
      </div>
      <div class="card-desc">${esc((p.description || '').slice(0, 90))}${(p.description || '').length > 90 ? '…' : ''}</div>
      <div class="card-loc">📍 ${esc(p.location_name || 'Location set')}</div>
    </div>
  </a>`;
}

function renderCategoryPills() {
  const wrap = document.getElementById('categories');
  wrap.innerHTML = `
    <button class="pill ${categoryFilter === 'all' ? 'active' : ''}" data-cat="all">All</button>
    ${CATEGORIES.map(c => `<button class="pill ${categoryFilter === c.id ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join('')}
  `;
  wrap.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      categoryFilter = btn.dataset.cat;
      renderCategoryPills();
      renderGrid();
    });
  });
}

function distinctSorted(list, key) {
  return [...new Set(list.map(p => p[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function renderFilterBar() {
  const countySel = document.getElementById('countyFilterSelect');
  const instSel = document.getElementById('institutionFilterSelect');
  const townSel = document.getElementById('townFilterSelect');

  countySel.innerHTML = `<option value="all">All counties</option>` +
    KENYA_COUNTIES.map(c => `<option value="${esc(c)}" ${countyFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('');

  const institutions = distinctSorted(allProducts, 'institution');
  instSel.innerHTML = `<option value="all">All institutions</option>` +
    institutions.map(i => `<option value="${esc(i)}" ${institutionFilter === i ? 'selected' : ''}>${esc(i)}</option>`).join('');

  const towns = distinctSorted(allProducts, 'town');
  townSel.innerHTML = `<option value="all">All towns</option>` +
    towns.map(t => `<option value="${esc(t)}" ${townFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('');

  countySel.onchange = () => { countyFilter = countySel.value; renderGrid(); };
  instSel.onchange = () => { institutionFilter = instSel.value; renderGrid(); };
  townSel.onchange = () => { townFilter = townSel.value; renderGrid(); };
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const list = allProducts.filter(p =>
    (categoryFilter === 'all' || p.category === categoryFilter) &&
    (countyFilter === 'all' || p.county === countyFilter) &&
    (institutionFilter === 'all' || p.institution === institutionFilter) &&
    (townFilter === 'all' || p.town === townFilter)
  );
  if (list.length === 0) {
    grid.innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
    return;
  }
  document.getElementById('emptyState').style.display = 'none';
  grid.innerHTML = list.map(cardHtml).join('');
}

async function init() {
  const profile = await requireAuth();
  if (!profile) return;
  document.getElementById('userChipName').textContent = profile.username || profile.email;
  document.getElementById('userChipAvatar').textContent = (profile.username || profile.email || '?').slice(0, 2).toUpperCase();
  wireLogoutButton(document.getElementById('logoutBtn'));
  if (profile.is_admin) document.getElementById('adminLink').style.display = 'inline';

  renderCategoryPills();
  allProducts = await loadProducts();
  renderFilterBar();
  renderGrid();

  // Keep the feed live: pick up new/changed listings from other users.
  supabase
    .channel('products-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
      allProducts = await loadProducts();
      renderFilterBar();
      renderGrid();
    })
    .subscribe();
}

init();