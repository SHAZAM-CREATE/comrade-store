export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://fttwibvdjqegngthpbtx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bwd54nGvG3yRU5IQn3aNbw_Y8kOoafg';

export default async function handler(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  // Fetch the static HTML shell you already have
  const shellRes = await fetch(new URL('/product-page.html', url.origin));
  let html = await shellRes.text();

  if (product) {
  const title = `${product.title} — Comrade Store`;
  const desc = `${product.title} — KES ${Number(product.price).toLocaleString()} in ${product.location_name || 'Kenya'}. ${(product.description || '').slice(0, 140)}`;
  const image = product.image_url || 'https://comradestore.co.ke/default-og.jpg';

  html = html
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${escapeHtml(desc)}">`)
    .replace(/<meta property="og:type" content="product">/, `
      <meta property="og:title" content="${escapeHtml(title)}">
      <meta property="og:description" content="${escapeHtml(desc)}">
      <meta property="og:image" content="${escapeHtml(image)}">
      <meta property="og:type" content="product">`);
}