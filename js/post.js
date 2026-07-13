import { supabase } from './supabase-client.js';
import { requireAuth, wireLogoutButton } from './auth.js';
import { NAIROBI_FALLBACK, getBrowserLocation } from './utils.js';

let map, marker, draftLoc = null, myLocation = null, profile = null;

function initMap() {
  const start = draftLoc || myLocation || NAIROBI_FALLBACK;
  map = L.map('postMap', { zoomControl: false }).setView([start.lat, start.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(map);
  draftLoc = { lat: start.lat, lng: start.lng };

  map.on('click', e => {
    marker.setLatLng(e.latlng);
    draftLoc = { lat: e.latlng.lat, lng: e.latlng.lng };
  });
  marker.on('dragend', () => {
    const ll = marker.getLatLng();
    draftLoc = { lat: ll.lat, lng: ll.lng };
  });
  setTimeout(() => map.invalidateSize(), 150);
}

async function useMyLocation() {
  const loc = await getBrowserLocation();
  if (loc) {
    myLocation = loc;
    draftLoc = loc;
    map.setView([loc.lat, loc.lng], 15);
    marker.setLatLng([loc.lat, loc.lng]);
  } else {
    alert("Couldn't access your location — you can still click the map to set a pin.");
  }
}

function showError(msg) {
  const box = document.getElementById('errorBox');
  if (!msg) { box.style.display = 'none'; box.textContent = ''; return; }
  box.style.display = 'block';
  box.textContent = msg;
}

async function handleSubmit(ev) {
  ev.preventDefault();
  showError(null);
  const f = new FormData(ev.target);
  const loc = draftLoc || myLocation || NAIROBI_FALLBACK;

  const product = {
    seller_id: profile.id,
    title: f.get('title').trim(),
    description: f.get('description').trim(),
    category: f.get('category'),
    price: Number(f.get('price')),
    condition: f.get('condition'),
    quantity: Number(f.get('quantity')),
    status: f.get('status'),
    contact: f.get('contact').trim(),
    location_name: f.get('locationName').trim(),
    lat: loc.lat,
    lng: loc.lng,
  };

  const submitBtn = ev.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Publishing…';

  const { error } = await supabase.from('products').insert(product);
  if (error) {
    showError(error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Publish listing';
    return;
  }
  window.location.href = 'index.html';
}

async function init() {
  profile = await requireAuth();
  if (!profile) return;
  document.getElementById('userChipName').textContent = profile.username || profile.email;
  document.getElementById('userChipAvatar').textContent = (profile.username || profile.email || '?').slice(0, 2).toUpperCase();
  wireLogoutButton(document.getElementById('logoutBtn'));
  document.getElementById('contact').value = profile.phone || '';

  initMap();
  document.getElementById('useLocationBtn').addEventListener('click', useMyLocation);
  document.getElementById('postForm').addEventListener('submit', handleSubmit);
}

init();