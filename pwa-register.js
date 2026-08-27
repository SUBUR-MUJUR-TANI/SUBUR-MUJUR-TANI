/* SUBUR MUJUR TANI - PWA registration */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function (registration) {
        console.log('PWA service worker aktif:', registration.scope);
      })
      .catch(function (error) {
        console.error('PWA service worker gagal:', error);
      });
  });
})();
