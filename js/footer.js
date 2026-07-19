import { SOCIAL_LINKS } from './config.js';
import { esc } from './utils.js';

function renderFooter() {
  const el = document.getElementById('footerRoot');
  if (!el) return;
  el.innerHTML = `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <div class="footer-logo"><span class="dot"></span>Comrade Store</div>
          <p class="footer-tagline">Buy and sell with fellow comrades, safely and simply.</p>
        </div>
        <nav class="footer-links" aria-label="Contact and social links">
          <a class="footer-link" href="${esc(SOCIAL_LINKS.whatsapp)}" target="_blank" rel="noopener noreferrer">
            <span class="footer-ic">💬</span> WhatsApp Channel
          </a>
          <a class="footer-link" href="mailto:${esc(SOCIAL_LINKS.email)}">
            <span class="footer-ic">✉️</span> Email Support
          </a>
          
      </div>
      <div class="footer-bottom">© ${new Date().getFullYear()} Comrade Store. All rights reserved.</div>
    </footer>`;
}

renderFooter();