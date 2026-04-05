// PyRunner Service Worker
// 缓存策略：Shell 文件强缓存，Pyodide/CDN 资源网络优先

const VERSION = 'v4';

// 需要预缓存的本地文件（App Shell）
const SHELL_CACHE = `pyrunner-shell-${VERSION}`;
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './sw.js',
];

// CDN 资源缓存（Pyodide 等大文件，网络优先 + 缓存兜底）
const CDN_CACHE = `pyrunner-cdn-${VERSION}`;
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'raw.githubusercontent.com',       // NotoSansSC 字体原始下载域
  'objects.githubusercontent.com',    // GitHub LFS / release 资源域
];

// ── Install：预缓存 App Shell ──
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(cache => {
      return cache.addAll(SHELL_FILES).catch(err => {
        console.warn('[SW] Shell cache failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate：清理旧版缓存 ──
self.addEventListener('activate', (e) => {
  const VALID_CACHES = [SHELL_CACHE, CDN_CACHE];
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !VALID_CACHES.includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

const isHtmlRequest = (request, url) =>
  request.mode === 'navigate' ||
  (request.destination === 'document') ||
  url.pathname === '/' ||
  url.pathname.endsWith('/index.html');

// ── Fetch：拦截请求 ──
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 非 GET 请求直接放行
  if (e.request.method !== 'GET') return;

  // App Shell:
  // - HTML/导航：网络优先，避免发布后看到旧页面
  // - 其他本地静态资源：缓存优先
  if (url.origin === self.location.origin) {
    if (isHtmlRequest(e.request, url)) {
      e.respondWith(
        fetch(e.request).then(resp => {
          if (resp && resp.ok) {
            caches.open(SHELL_CACHE).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        }).catch(() => caches.match(e.request).then(cached => cached || new Response('离线中', { status: 503 })))
      );
      return;
    }

    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (resp.ok) {
            caches.open(SHELL_CACHE).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        }).catch(() => cached || new Response('离线中', { status: 503 }));
      })
    );
    return;
  }

  // CDN 资源：网络优先，失败用缓存兜底
  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp.ok) {
          caches.open(CDN_CACHE).then(c => c.put(e.request, resp.clone()));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 其他请求（httpbin 等 API）直接走网络，不缓存
});
