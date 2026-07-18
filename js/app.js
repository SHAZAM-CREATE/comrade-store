import { supabase } from './supabase-client.js';
import { requireAuth, wireLogoutButton } from './auth.js';
import { CATEGORIES, KENYA_COUNTIES, catInfo, esc, productUrl } from './utils.js';

const PAGE_SIZE = 10;

let categoryFilter = 'all';
let countyFilter = 'all';
let institutionFilter = 'all';
let locationSearch = '';
let productSearch = '';

let offset = 0;
let loading = false;
let hasMore = true;

function escapeLike(term) {
  // Escape ILIKE wildcard characters so a search for e.g. "50%" or
  // "a_b" doesn't get interpreted as a pattern.
  return term.replace(/[%_]/g, m => '\\' + m);
}

// Strips characters that have special meaning inside a PostgREST
// .or() filter string (commas separate conditions, parens group them)
// so a search term can never break out of the intended filter.
function sanitizeForOr(term) {
  return escapeLike(term.replace(/[,()]/g, ' ').trim());
}

function buildQuery() {
  let query = supabase.from('products').select('*').order('created_at', { ascending: false });
  if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);
  if (countyFilter !== 'all') query = query.eq('county', countyFilter);
  if (institutionFilter !== 'all') query = query.eq('institution', institutionFilter);

  const locTerm = locationSearch.trim();
  if (locTerm) query = query.ilike('location_name', `%${escapeLike(locTerm)}%`);

  const nameTerm = productSearch.trim();
  if (nameTerm) {
    const safe = sanitizeForOr(nameTerm);
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  return query;
}

async function fetchPage() {
  const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
  if (error) { console.error(error); return []; }
  return data;
}

function cardHtml(p) {
  const c = catInfo(p.category);
  return `
  <a class="card" href="${productUrl(p.id)}" style="text-decoration:none;color:inherit;">
    <div class="card-media">
      <span class="status-flag ${p.status}">${p.status === 'available' ? 'Available' : 'Sold'}</span>
      ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}" style="width:100%;height:100%;object-fit:cover;">` : c.icon}
    </div>
    <div class="card-body">
      <h3>${esc(p.title)}</h3>
      <div class="card-price">KES ${Number(p.price).toLocaleString()}</div>
      <div class="card-meta-mini">
        <span class="cond">${p.condition === 'new' ? 'New' : 'Used'}</span>
        <span class="card-loc-mini">📍 ${esc(p.location_name || 'Location set')}</span>
      </div>
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
      resetAndLoad();
    });
  });
}

async function renderFilterBar() {
  const countySel = document.getElementById('countyFilterSelect');
  const instSel = document.getElementById('institutionFilterSelect');
  const searchInput = document.getElementById('locationSearchInput');

  countySel.innerHTML = `<option value="all">All counties</option>` +
    KENYA_COUNTIES.map(c => `<option value="${esc(c)}" ${countyFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('');

  // Small dedicated lookup — not the full product list — so this stays
  // fast no matter how many listings exist.
  const { data: institutions } = await supabase.rpc('distinct_institutions');
  instSel.innerHTML = `<option value="all">All institutions</option>` +
    (institutions || []).map(i => `<option value="${esc(i)}" ${institutionFilter === i ? 'selected' : ''}>${esc(i)}</option>`).join('');

  countySel.onchange = () => { countyFilter = countySel.value; resetAndLoad(); };
  instSel.onchange = () => { institutionFilter = instSel.value; resetAndLoad(); };

  let debounceTimer;
  searchInput.value = locationSearch;
  const triggerLocationSearch = () => {
    clearTimeout(debounceTimer);
    locationSearch = searchInput.value;
    resetAndLoad();
  };
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerLocationSearch, 400);
  });
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); triggerLocationSearch(); } });
  document.getElementById('locationSearchBtn').addEventListener('click', triggerLocationSearch);

  const nameSearchInput = document.getElementById('productSearchInput');
  let nameDebounceTimer;
  nameSearchInput.value = productSearch;
  const triggerProductSearch = () => {
    clearTimeout(nameDebounceTimer);
    productSearch = nameSearchInput.value;
    resetAndLoad();
  };
  nameSearchInput.addEventListener('input', () => {
    clearTimeout(nameDebounceTimer);
    nameDebounceTimer = setTimeout(triggerProductSearch, 400);
  });
  nameSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); triggerProductSearch(); } });
  document.getElementById('productSearchBtn').addEventListener('click', triggerProductSearch);
}

function setLoadMoreVisible(visible, busy = false) {
  const btn = document.getElementById('loadMoreBtn');
  btn.style.display = visible ? 'inline-flex' : 'none';
  btn.disabled = busy;
  btn.textContent = busy ? 'Loading…' : 'Load more';
}

async function loadNextPage() {
  if (loading || !hasMore) return;
  loading = true;
  setLoadMoreVisible(true, true);

  const items = await fetchPage();
  const grid = document.getElementById('grid');

  if (offset === 0) {
    document.getElementById('emptyState').style.display = items.length === 0 ? 'block' : 'none';
    grid.innerHTML = '';
  }
  grid.insertAdjacentHTML('beforeend', items.map(cardHtml).join(''));

  offset += items.length;
  hasMore = items.length === PAGE_SIZE;
  loading = false;
  setLoadMoreVisible(hasMore, false);
}

async function resetAndLoad() {
  offset = 0;
  hasMore = true;
  await loadNextPage();
}

async function init() {
  const profile = await requireAuth();
  if (!profile) return;
  document.getElementById('userChipName').textContent = profile.username || profile.email;
  document.getElementById('userChipAvatar').textContent = (profile.username || profile.email || '?').slice(0, 2).toUpperCase();
  wireLogoutButton(document.getElementById('logoutBtn'));
  if (profile.is_admin) document.getElementById('adminLink').style.display = 'inline';

  renderCategoryPills();
  await renderFilterBar();
  document.getElementById('loadMoreBtn').addEventListener('click', loadNextPage);
  await resetAndLoad();

  // Keep the feed live: a change anywhere just refreshes the current
  // filtered view from the top — cheap, since we only ever pull 10 rows
  // at a time rather than the whole table.
  supabase
    .channel('products-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
      resetAndLoad();
    })
    .subscribe();
}

init();