import { supabase } from './supabase-client.js';
import { requireAuth, wireLogoutButton } from './auth.js';
import { CATEGORIES, catInfo, esc, productUrl } from './utils.js';

let allProducts = [];
let categoryFilter = 'all';

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
    <div class="card-media"${p.image_url ? ` style="background:none;padding:0;"` : ''}>
      <span class="status-flag ${p.status}">${p.status === 'available' ? 'Available' : 'Sold'}</span>
      ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}" style="width:100%;height:100%;object-fit:cover;">` : c.icon}
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

function renderGrid() {
  const grid = document.getElementById('grid');
  const list = allProducts.filter(p => categoryFilter === 'all' || p.category === categoryFilter);
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

  renderCategoryPills();
  allProducts = await loadProducts();
  renderGrid();

  // Keep the feed live: pick up new/changed listings from other users.
  supabase
    .channel('products-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
      allProducts = await loadProducts();
      renderGrid();
    })
    .subscribe();
}

init();