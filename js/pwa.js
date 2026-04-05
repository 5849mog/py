// 页面关闭时强制立即保存（绕过 debounce）
window.addEventListener('beforeunload', () => {
  clearTimeout(_saveTimer);
  saveState();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(r => console.log('[SW] registered:', r.scope))
      .catch(e => console.warn('[SW] register failed:', e));
  });
}

let _deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt = e;
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'flex';
});
window.addEventListener('appinstalled', () => {
  _deferredPrompt = null;
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
  showToast('✓ PyRunner 已安装到桌面');
});
function installPWA() {
  if (!_deferredPrompt) {
    showToast('请使用浏览器菜单中的「安装」或「添加到主屏幕」');
    return;
  }
  _deferredPrompt.prompt();
  _deferredPrompt.userChoice.then(() => {
    _deferredPrompt = null;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
  });
}
