// Keeps the ?redirect=... param attached as someone moves between the
// login/register/reset-password pages, so "log in to unlock this
// contact" style flows still land back where they started even if the
// visitor clicks "Create an account" or "Forgot password" along the way.
const redirect = new URLSearchParams(window.location.search).get('redirect');
if (redirect) {
  document.querySelectorAll('a[href="login"], a[href="register"]').forEach(a => {
    const url = new URL(a.href);
    url.searchParams.set('redirect', redirect);
    a.href = url.pathname + url.search;
  });
}