export const CATEGORIES = [
  {id:'furniture', label:'Furniture', icon:'🛋️'},
  {id:'kitchen', label:'Kitchen', icon:'🍳'},
  {id:'clothes', label:'Clothes', icon:'👕'},
  {id:'shoes', label:'Shoes', icon:'👟'},
  {id:'electronics', label:'Electronics', icon:'🔌'},
  {id:'gaming', label:'Gaming', icon:'🎮'},
  {id:'books', label:'Books', icon:'📚'},
  {id:'beauty', label:'Beauty', icon:'💄'},
  {id:'services', label:'Services', icon:'🧰'},
  {id:'other', label:'Other', icon:'🏷️'},
];

export const NAIROBI_FALLBACK = {lat:-1.2833, lng:36.8167, name:'Nairobi CBD'};

export const KENYA_COUNTIES = [
  'Mombasa','Kwale','Kilifi','Tana River','Lamu','Taita Taveta','Garissa','Wajir','Mandera',
  'Marsabit','Isiolo','Meru','Tharaka-Nithi','Embu','Kitui','Machakos','Makueni','Nyandarua',
  'Nyeri','Kirinyaga',"Murang'a",'Kiambu','Turkana','West Pokot','Samburu','Trans Nzoia',
  'Uasin Gishu','Elgeyo-Marakwet','Nandi','Baringo','Laikipia','Nakuru','Narok','Kajiado',
  'Kericho','Bomet','Kakamega','Vihiga','Bungoma','Busia','Siaya','Kisumu','Homa Bay',
  'Migori','Kisii','Nyamira','Nairobi',
];

export const TRAVEL_MODES = [
  {id:'walk', label:'Walking', icon:'🚶', speed:5},
  {id:'boda', label:'Boda Boda', icon:'🏍️', speed:30},
  {id:'matatu', label:'Matatu', icon:'🚐', speed:20},
  {id:'car', label:'Driving', icon:'🚗', speed:25},
];

export function catInfo(id){
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

export function esc(s){
  return (s ?? '').toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

export function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function fmtTime(mins){
  if (mins < 1) return '<1 min';
  if (mins < 60) return Math.round(mins) + ' min';
  const h = Math.floor(mins/60), m = Math.round(mins % 60);
  return h + 'h ' + m + 'm';
}

export function getBrowserLocation(){
  return new Promise(resolve => {
    if (!navigator.geolocation){ resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
      () => resolve(null),
      {timeout: 6000}
    );
  });
}

// Small helper: builds a shareable link back to a product's own page.
export function productUrl(id){
  return `product?id=${encodeURIComponent(id)}`;
}