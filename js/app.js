import { supabase } from './supabase-client.js';
import { getOptionalProfile, wireLogoutButton } from './auth.js';
import { CATEGORIES, KENYA_COUNTIES, catInfo, esc, productUrl, PRODUCT_PUBLIC_COLUMNS } from './utils.js';

const PAGE_SIZE = 12;

let categoryFilter = 'all';
let countyFilter = 'all';
let institutionFilter = 'all';
let locationSearch = '';
let productSearch = '';

let currentPage = 1;
let totalCount = 0;

function escapeLike(term) {
  return term.replace(/[%_]/g, m => '\\' + m);
}

function sanitizeForOr(term) {
  return escapeLike(term.replace(/[,()]/g, ' ').trim());
}

function buildQuery() {
  let query = supabase
    .from('products')
    .select(PRODUCT_PUBLIC_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false });

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

async function fetchPage(page) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error, count } = await buildQuery().range(from, to);
  if (error) { console.error(error); return { items: [], count: 0 }; }
  return { items: data, count: count ?? 0 };
}

function cardHtml(p) {
  const c = catInfo(p.category);
  return `
  <a class="card" href="${productUrl(p.id)}" style="text-decoration:none;color:inherit;">
    <div class="card-media">
      <span class="status-flag ${p.status}">${p.status === 'available' ? 'Available' : 'Sold'}</span>
      ${p.video_url ? '<span class="video-badge">🎥</span>' : ''}
      ${p.image_url ? `<img src="${esc(p.thumbnail_url || p.image_url)}" alt="${esc(p.title)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">` : c.icon}
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
      goToPage(1);
    });
  });
}

async function renderFilterBar() {
  const countySel = document.getElementById('countyFilterSelect');
  const instSel = document.getElementById('institutionFilterSelect');
  const searchInput = document.getElementById('locationSearchInput');

  countySel.innerHTML = `<option value="all">All counties</option>` +
    KENYA_COUNTIES.map(c => `<option value="${esc(c)}" ${countyFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('');

  const { data: institutions } = await supabase.rpc('distinct_institutions');
  instSel.innerHTML = `<option value="all">All institutions</option>` +
    (institutions || []).map(i => `<option value="${esc(i)}" ${institutionFilter === i ? 'selected' : ''}>${esc(i)}</option>`).join('');

  countySel.onchange = () => { countyFilter = countySel.value; goToPage(1); };
  instSel.onchange = () => { institutionFilter = instSel.value; goToPage(1); };

  let debounceTimer;
  searchInput.value = locationSearch;
  const triggerLocationSearch = () => {
    clearTimeout(debounceTimer);
    locationSearch = searchInput.value;
    goToPage(1);
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
    goToPage(1);
  };
  nameSearchInput.addEventListener('input', () => {
    clearTimeout(nameDebounceTimer);
    nameDebounceTimer = setTimeout(triggerProductSearch, 400);
  });
  nameSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); triggerProductSearch(); } });
  document.getElementById('productSearchBtn').addEventListener('click', triggerProductSearch);
}

function renderPagination() {
  const wrap = document.getElementById('pagination');
  if (!wrap) return;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  if (totalPages <= 1) { wrap.innerHTML = ''; return; }

  let buttons = '';
  buttons += `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`;

  for (let i = 1; i <= totalPages; i++) {
    buttons += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  buttons += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next ›</button>`;

  wrap.innerHTML = buttons;
  wrap.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = Number(btn.dataset.page);
      if (page >= 1 && page <= totalPages) goToPage(page);
    });
  });
}

async function goToPage(page) {
  currentPage = page;
  const grid = document.getElementById('grid');
  grid.innerHTML = '<div class="loading-state">Loading…</div>';

  const { items, count } = await fetchPage(page);
  totalCount = count;

  document.getElementById('emptyState').style.display = items.length === 0 ? 'block' : 'none';
  grid.innerHTML = items.map(cardHtml).join('');

  renderPagination();
  window.scrollTo({ top: document.getElementById('grid').offsetTop - 80, behavior: 'smooth' });
}

function renderUserChip(profile) {
  const chip = document.getElementById('userChip');
  if (profile) {
    chip.innerHTML = `
      <div class="avatar" id="userChipAvatar">${esc((profile.username || profile.email || '?').slice(0, 2).toUpperCase())}</div>
      <span id="userChipName">${esc(profile.username || profile.email)}</span>
      <a class="linkbtn" id="adminLink" href="admin" style="display:${profile.is_admin ? 'inline' : 'none'};margin-right:4px;">Admin</a>
    `;
    document.getElementById('logoutSection').style.display = 'block';
    wireLogoutButton(document.getElementById('logoutBtn'));
  } else {
    chip.innerHTML = `
      <a class="linkbtn" href="login" style="margin-right:12px;">Log in</a>
      <a class="btn btn-gold" href="register" style="padding:8px 16px;font-size:13px;">Sign up</a>
    `;
    document.getElementById('logoutSection').style.display = 'none';
  }
}

async function init() {
  const profile = await getOptionalProfile();
  renderUserChip(profile);

  renderCategoryPills();
  await renderFilterBar();
  await goToPage(1);

  supabase
    .channel('products-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
      goToPage(currentPage);
    })
    .subscribe();
}

init();