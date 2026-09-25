export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://fttwibvdjqegngthpbtx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bwd54nGvG3yRU5IQn3aNbw_Y8kOoafg';

export default async function handler(req) {
  try {
    const q = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,created_at&status=eq.available`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );

    const rawText = await q.text();

    if (!q.ok) {
      return new Response(`Supabase error: ${q.status} - ${rawText}`, { status: 500 });
    }

    const products = JSON.parse(rawText);

    if (!Array.isArray(products)) {
      return new Response(`Unexpected response shape: ${rawText}`, { status: 500 });
    }

    const urls = products.map(p => `
  <url>
    <loc>https://comradestore.co.ke/product?id=${p.id}</loc>
    <lastmod>${p.created_at || ''}</lastmod>
  </url>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://comradestore.co.ke/index</loc></url>${urls}
</urlset>`;

    return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
  } catch (err) {
    return new Response(`Function crashed: ${err.message}\n${err.stack}`, { status: 500 });
  }
}