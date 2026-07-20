import { supabase } from './supabase-client.js';
import { getOptionalProfile, wireLogoutButton, loginUrlWithReturn } from './auth.js';
import { catInfo, esc, haversineKm, TRAVEL_MODES, fmtTime, getBrowserLocation, PRODUCT_PUBLIC_COLUMNS } from './utils.js';
import { unlockContactWithPayment } from './payment.js';
import { UNLOCK_FEE_KES } from './config.js';

let profile, product, revealedContact = null;

function productIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

async function loadProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .select(`${PRODUCT_PUBLIC_COLUMNS}, profiles(username)`)
    .eq('id', id)
    .maybeSingle();
  if (error) console.error(error);
  if (data) data.seller_username = data.profiles?.username;
  return data;
}

async function fetchRevealedContact(productId) {
  const { data, error } = await supabase.rpc('get_product_contact', { p_product_id: productId });
  if (error) { console.error(error); return null; }
  return data;
}

async function isUnlocked(productId, userId) {
  const { data } = await supabase
    .from('unlocks')
    .select('id')
    .eq('product_id', productId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

function setMetaDescription(content) {
  let tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'description');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function renderHeader(p) {
  const c = catInfo(p.category);
  document.title = `${p.title} — Comrade Store`;
  setMetaDescription(
    `${p.title} — KES ${Number(p.price).toLocaleString()} in ${esc(p.location_name || p.town || 'Kenya')}. ${(p.description || '').slice(0, 140)}`
  );
  document.getElementById('catChip').innerHTML = `${c.icon} ${c.label}`;
  document.getElementById('title').textContent = p.title;
  document.getElementById('price').textContent = `KES ${Number(p.price).toLocaleString()}`;
  document.getElementById('metaRow').innerHTML = `
    <span class="tagchip">${p.condition === 'new' ? '✨ New' : '♻️ Used'}</span>
    <span class="tagchip">Qty: ${esc(p.quantity)}</span>
    <span class="tagchip">${p.status === 'available' ? '🟢 Available' : '🔴 Sold'}</span>
  `;
  document.getElementById('desc').textContent = p.description;
  document.getElementById('sellerRow').innerHTML = `👤 Sold by <strong>${esc(p.seller_username || 'a comrade')}</strong> · 📍 ${esc(p.location_name)}`;
  document.getElementById('statusFlag').textContent = p.status === 'available' ? 'Available' : 'Sold';
  document.getElementById('statusFlag').className = `status-flag ${p.status}`;
  const mediaEl = document.getElementById('mediaIcon');
  if (p.image_url) {
    mediaEl.outerHTML = `<img id="mediaIcon" src="${esc(p.image_url)}" alt="${esc(p.title)}">`;
  } else {
    mediaEl.textContent = c.icon;
  }

  const carousel = document.getElementById('mediaCarousel');
  const hint = document.getElementById('mediaHint');
  ['photo2Slide', 'videoSlide'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  if (p.image_url_2) {
    const slide2 = document.createElement('div');
    slide2.className = 'media-slide';
    slide2.id = 'photo2Slide';
    slide2.innerHTML = `<img src="${esc(p.image_url_2)}" alt="${esc(p.title)} (second photo)">`;
    carousel.appendChild(slide2);
  }

  if (p.video_url) {
    const slideV = document.createElement('div');
    slideV.className = 'media-slide';
    slideV.id = 'videoSlide';
    slideV.innerHTML = `<video controls playsinline preload="metadata"><source src="${esc(p.video_url)}"></video>`;
    carousel.appendChild(slideV);
  }

  if (p.image_url_2 && p.video_url) {
    hint.textContent = '📸🎥 Swipe right for more photos & the video →';
    hint.style.display = 'block';
  } else if (p.video_url) {
    hint.textContent = '🎥 Swipe right to watch the video →';
    hint.style.display = 'block';
  } else if (p.image_url_2) {
    hint.textContent = '📸 Swipe right for another photo →';
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

function renderContactLocked() {
  document.getElementById('contactBox').innerHTML = `
    <div class="contact-locked">
      <div class="lock-ic">🔒</div>
      <p>Seller contact is hidden. Unlock it to see their phone number instantly.</p>
      <div class="field" style="text-align:left;"><label>M-Pesa number to pay from</label><input id="payPhone" value="${esc(profile.phone || '')}"></div>
      <button class="btn btn-gold btn-block" id="unlockBtn">Unlock contact — KES ${UNLOCK_FEE_KES}</button>
      <div id="payStatus" class="status-note"></div>
    </div>`;
  document.getElementById('unlockBtn').addEventListener('click', startUnlock);
}

function renderContactLockedGuest() {
  document.getElementById('contactBox').innerHTML = `
    <div class="contact-locked">
      <div class="lock-ic">🔒</div>
      <p>Log in to unlock this seller's contact and arrange a purchase.</p>
      <a class="btn btn-gold btn-block" href="${loginUrlWithReturn()}">Log in to unlock</a>
    </div>`;
}

function renderContactUnlocked() {
  document.getElementById('contactBox').innerHTML = `
    <div class="contact-unlocked">📞 ${esc(revealedContact || 'Loading…')}
      <div class="sub">Contact unlocked — reach out directly to arrange the purchase.</div>
    </div>`;
}

async function startUnlock() {
  const phone = document.getElementById('payPhone').value.trim();
  const btn = document.getElementById('unlockBtn');
  const statusEl = document.getElementById('payStatus');
  if (!phone) { statusEl.textContent = 'Enter the M-Pesa number to pay from.'; statusEl.className = 'status-note fail'; return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Check your phone for the M-Pesa prompt…';
  statusEl.textContent = '';
  statusEl.className = 'status-note';

  try {
    const status = await unlockContactWithPayment({
      productId: product.id,
      phone,
      onStatus: (s) => {
        if (s === 'pending') statusEl.textContent = 'Enter your M-Pesa PIN on your phone to complete payment.';
      },
    });
    if (status === 'success') {
      revealedContact = await fetchRevealedContact(product.id);
      renderContactUnlocked();
    } else if (status === 'timeout') {
      statusEl.textContent = "Didn't get a confirmation in time. If you completed the payment, refresh this page.";
      statusEl.className = 'status-note fail';
      btn.disabled = false;
      btn.textContent = `Unlock contact — KES ${UNLOCK_FEE_KES}`;
    } else {
      statusEl.textContent = 'Payment was not completed. You can try again.';
      statusEl.className = 'status-note fail';
      btn.disabled = false;
      btn.textContent = `Unlock contact — KES ${UNLOCK_FEE_KES}`;
    }
  } catch (e) {
    statusEl.textContent = 'Something went wrong starting the payment. Please try again.';
    statusEl.className = 'status-note fail';
    btn.disabled = false;
    btn.textContent = `Unlock contact — KES ${UNLOCK_FEE_KES}`;
  }
}

function renderTravelInfo(myLoc, denied) {
  const box = document.getElementById('travelInfo');
  if (denied) { box.innerHTML = `<div class="dist-note">Enable location access in your browser to see live distance and travel times from where you are.</div>`; return; }
  if (!myLoc) { box.innerHTML = `<div class="dist-note">Locating you…</div>`; return; }
  const km = haversineKm(myLoc.lat, myLoc.lng, product.lat, product.lng);
  box.innerHTML = `
    <div class="travel-grid">
      ${TRAVEL_MODES.map(m => `
        <div class="travel-opt">
          <div class="ic">${m.icon}</div>
          <div class="mode">${m.label}</div>
          <div class="time">${fmtTime((km / m.speed) * 60)}</div>
        </div>`).join('')}
    </div>
    <div class="dist-note">Straight-line distance: ~${km.toFixed(1)} km from your current location. Actual travel time depends on real routes and traffic.</div>`;
}

async function initMap() {
  const map = L.map('detailMap', { zoomControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  L.marker([product.lat, product.lng]).addTo(map).bindPopup(esc(product.title));
  map.setView([product.lat, product.lng], 13);
  renderTravelInfo(null);

  const loc = await getBrowserLocation();
  if (!loc) { renderTravelInfo(null, true); return; }
  const meIcon = L.divIcon({ className: '', html: '<div style="width:16px;height:16px;background:#2A9D8F;border:3px solid white;border-radius:50%;box-shadow:0 0 0 2px #2A9D8F;"></div>', iconSize: [16, 16] });
  L.marker([loc.lat, loc.lng], { icon: meIcon }).addTo(map).bindPopup('You are here');
  const bounds = L.latLngBounds([[product.lat, product.lng], [loc.lat, loc.lng]]);
  map.fitBounds(bounds, { padding: [30, 30] });
  L.polyline([[loc.lat, loc.lng], [product.lat, product.lng]], { color: '#C9821B', dashArray: '6,6', weight: 2 }).addTo(map);
  renderTravelInfo(loc);
  setTimeout(() => map.invalidateSize(), 150);
}

function renderUserChip(p) {
  const chip = document.getElementById('userChip');
  if (p) {
    chip.innerHTML = `
      <div class="avatar" id="userChipAvatar">${esc((p.username || p.email || '?').slice(0, 2).toUpperCase())}</div>
      <span id="userChipName">${esc(p.username || p.email)}</span>
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
  profile = await getOptionalProfile();
  renderUserChip(profile);

  const id = productIdFromUrl();
  if (!id) { document.getElementById('detailRoot').innerHTML = `<div class="empty-state">No item specified.</div>`; return; }
  product = await loadProduct(id);
  if (!product) { document.getElementById('detailRoot').innerHTML = `<div class="empty-state">Item not found.<br><a class="btn btn-outline" style="margin-top:12px;display:inline-flex;" href="index">Back to feed</a></div>`; return; }

  renderHeader(product);
  if (!profile) {
    renderContactLockedGuest();
  } else {
    const unlocked = product.seller_id === profile.id || await isUnlocked(product.id, profile.id);
    if (unlocked) {
      revealedContact = await fetchRevealedContact(product.id);
      renderContactUnlocked();
    } else {
      renderContactLocked();
    }
  }
  renderSellerControls();
  initMap();
}

function renderSellerControls() {
  const box = document.getElementById('sellerControls');
  if (!profile || product.seller_id !== profile.id) { box.innerHTML = ''; return; }

  const nextStatus = product.status === 'available' ? 'sold' : 'available';
  const label = product.status === 'available' ? 'Mark as sold' : 'Mark as available';
  const btnClass = product.status === 'available' ? 'btn-outline' : 'btn-teal';

  box.innerHTML = `<button class="btn ${btnClass} btn-block" id="toggleStatusBtn" style="margin-top:10px;">${label}</button>`;
  document.getElementById('toggleStatusBtn').addEventListener('click', async () => {
    const btn = document.getElementById('toggleStatusBtn');
    btn.disabled = true;
    const { error } = await supabase.from('products').update({ status: nextStatus }).eq('id', product.id);
    if (error) { alert(error.message); btn.disabled = false; return; }
    product.status = nextStatus;
    renderHeader(product);
    renderSellerControls();
  });
}

init();