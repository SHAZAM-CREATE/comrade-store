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

function wireSecondMediaToggle() {
  const radios = document.querySelectorAll('input[name=secondMediaType]');
  const imgInput = document.getElementById('imageInput2');
  const vidInput = document.getElementById('videoInput');
  const vidHint = document.getElementById('videoHintText');

  radios.forEach(r => r.addEventListener('change', () => {
    if (!r.checked) return;
    if (r.value === 'photo') {
      imgInput.style.display = 'block';
      vidInput.style.display = 'none';
      vidHint.style.display = 'none';
      vidInput.value = '';
    } else if (r.value === 'video') {
      vidInput.style.display = 'block';
      vidHint.style.display = 'block';
      imgInput.style.display = 'none';
      imgInput.value = '';
    } else {
      imgInput.style.display = 'none';
      vidInput.style.display = 'none';
      vidHint.style.display = 'none';
      imgInput.value = '';
      vidInput.value = '';
    }
  }));
}

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error('Could not read that video file.'));
    video.src = URL.createObjectURL(file);
  });
}

async function uploadFile(bucket, file, profileId) {
  const path = `${profileId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw new Error(error.message);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

async function handleSubmit(ev) {
  ev.preventDefault();
  showError(null);
  const f = new FormData(ev.target);
  const loc = draftLoc || myLocation || NAIROBI_FALLBACK;

  const submitBtn = ev.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Publishing…';

  let imageUrl = null, imageUrl2 = null, videoUrl = null;
  try {
    const file1 = document.getElementById('imageInput').files[0];
    if (file1) imageUrl = await uploadFile('product-images', file1, profile.id);

    const file2 = document.getElementById('imageInput2').files[0];
    if (file2) imageUrl2 = await uploadFile('product-images', file2, profile.id);

    const videoFile = document.getElementById('videoInput').files[0];
    if (videoFile) {
      const duration = await getVideoDuration(videoFile);
      if (duration > 15.5) {
        throw new Error(`Video must be 15 seconds or shorter (yours is ${duration.toFixed(1)}s).`);
      }
      videoUrl = await uploadFile('product-videos', videoFile, profile.id);
    }
  } catch (e) {
    showError(e.message || 'Upload failed. Please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Publish listing';
    return;
  }

  const product = {
    seller_id: profile.id,
    county: profile.county || null,
    institution: profile.institution || null,
    town: profile.town || null,
    image_url: imageUrl,
    image_url_2: imageUrl2,
    video_url: videoUrl,
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

  const { error } = await supabase.from('products').insert(product);
  if (error) {
    showError(error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Publish listing';
    return;
  }
  window.location.href = 'index';
}

async function init() {
  profile = await requireAuth();
  if (!profile) return;
  document.getElementById('userChipName').textContent = profile.username || profile.email;
  document.getElementById('userChipAvatar').textContent = (profile.username || profile.email || '?').slice(0, 2).toUpperCase();
  wireLogoutButton(document.getElementById('logoutBtn'));
  document.getElementById('contact').value = profile.phone || '';

  initMap();
  wireSecondMediaToggle();
  document.getElementById('useLocationBtn').addEventListener('click', useMyLocation);
  document.getElementById('postForm').addEventListener('submit', handleSubmit);
}

init();