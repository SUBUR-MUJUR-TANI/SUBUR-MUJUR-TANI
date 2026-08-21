
/* =========================================================
   SUBUR MUJUR TANI — NAVIGASI BAWAH GLOBAL
   Dibuat sekali, dipakai semua halaman.
========================================================= */
(function () {
  function buildNavigation() {
    // Versi lama website pernah memiliki navigasi lain. Hapus semuanya agar
    // setiap halaman hanya memiliki SATU navigasi global di bagian bawah.
    document.querySelectorAll(
      'body > nav:not(.smt-bottom-nav), body > .pm-mobile-nav, body > .mobile-bottom-nav, body > .bottom-nav, body > .nav-bottom'
    ).forEach(el => el.remove());

    if (document.querySelector(".smt-bottom-nav")) return;

    const nav = document.createElement("nav");
    nav.className = "smt-bottom-nav";
    nav.setAttribute("aria-label", "Navigasi utama");

    nav.innerHTML = `
      <a href="index.html" data-page="home">
        <b>⌂</b><span>Beranda</span>
      </a>
      <a href="produk.html" data-page="produk">
        <b>🌱</b><span>Produk</span>
      </a>
      <a href="galeri.html" data-page="galeri">
        <b>🖼️</b><span>Galeri</span>
      </a>
      <a href="checkout.html" data-page="checkout">
        <b>🛒</b><span>Checkout</span>
      </a>
      <a href="lokasi.html" data-page="lokasi">
        <b>📍</b><span>Lokasi</span>
      </a>
      <a href="login.html" data-page="admin">
        <b>👤</b><span>Admin</span>
      </a>
    `;

    document.body.appendChild(nav);

    const file = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    let active = "home";
    if (file === "produk.html") active = "produk";
    else if (file === "galeri.html") active = "galeri";
    else if (file === "checkout.html") active = "checkout";
    else if (file === "lokasi.html") active = "lokasi";
    else if (file === "admin.html" || file === "login.html") active = "admin";

    nav.querySelector(`[data-page="${active}"]`)?.classList.add("active");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildNavigation, { once: true });
  } else {
    buildNavigation();
  }
})();
