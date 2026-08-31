(function(){
  'use strict';
  if (document.getElementById('smtWhatsappFloat')) return;

  var phone = '6287821697442';
  var page = document.title ? document.title.trim() : 'website';
  var message = 'Halo Subur Mujur Tani, saya mau bertanya tentang produk.';
  if (page) message += '\n\nSaya melihat halaman: ' + page;

  var a = document.createElement('a');
  a.id = 'smtWhatsappFloat';
  a.className = 'smt-wa-float';
  a.href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', 'Chat WhatsApp Subur Mujur Tani');
  a.title = 'Tanya lewat WhatsApp';
  a.innerHTML = '<span class="smt-wa-icon" aria-hidden="true">' +
    '<svg viewBox="0 0 32 32" role="img"><path fill="currentColor" d="M19.11 17.2c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.12-.41-2.13-1.31-.79-.7-1.32-1.57-1.47-1.83-.15-.27-.02-.41.11-.54.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.02-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27 0 1.34.98 2.63 1.11 2.81.14.18 1.92 2.94 4.65 4.12.65.28 1.16.45 1.56.58.66.21 1.26.18 1.74.11.53-.08 1.6-.66 1.82-1.29.23-.63.23-1.17.16-1.29-.07-.11-.25-.18-.52-.32z"/><path fill="currentColor" d="M16.02 3.2c-7.06 0-12.8 5.73-12.8 12.79 0 2.25.59 4.45 1.72 6.39L3.1 28.8l6.57-1.72a12.75 12.75 0 0 0 6.35 1.68h.01c7.05 0 12.78-5.74 12.78-12.79S23.08 3.2 16.02 3.2zm0 23.42h-.01c-2 0-3.96-.54-5.67-1.55l-.41-.24-3.9 1.02 1.04-3.8-.27-.39a10.6 10.6 0 0 1-1.63-5.67c0-5.88 4.79-10.67 10.68-10.67 2.85 0 5.53 1.11 7.55 3.13a10.6 10.6 0 0 1 3.12 7.55c0 5.88-4.79 10.67-10.67 10.67z"/></svg>' +
    '</span><span class="smt-wa-label">Tanya via WhatsApp</span>';

  var style = document.createElement('style');
  style.id = 'smtWhatsappFloatStyle';
  style.textContent = '\
    .smt-wa-float{position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;align-items:center;gap:8px;padding:9px 12px 9px 9px;border-radius:999px;background:#25D366;color:#fff;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.22);font:600 13px/1.1 Arial,sans-serif;transition:transform .15s ease,box-shadow .15s ease}\
    .smt-wa-float:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.27);color:#fff}\
    .smt-wa-icon{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#25D366;flex:0 0 27px}\
    .smt-wa-icon svg{width:19px;height:19px}\
    .smt-wa-label{white-space:nowrap}\
    @media(max-width:480px){.smt-wa-float{right:12px;bottom:12px;padding:8px;border-radius:50%;width:44px;height:44px;justify-content:center;gap:0}.smt-wa-icon{width:28px;height:28px}.smt-wa-label{display:none}}\
    @media(prefers-reduced-motion:reduce){.smt-wa-float{transition:none}}\
  ';
  document.head.appendChild(style);
  document.body.appendChild(a);
})();
