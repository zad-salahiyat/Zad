/* زاد — متابعة الصلاحيات: service worker
   غيّر رقم VERSION مع كل تحديث للموقع عشان الأجهزة تاخد النسخة الجديدة. */
const VERSION = 'zad-v1';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './maskable-192.png', './maskable-512.png'
];

/* مصادر خارجية بنخزنها عشان الموقع يشتغل أوفلاين: الخط، المكتبات، حزمة Firebase */
function isCacheableExternal(u) {
  return u.hostname === 'fonts.googleapis.com' ||
         u.hostname === 'fonts.gstatic.com' ||
         u.hostname === 'cdnjs.cloudflare.com' ||
         (u.hostname === 'www.gstatic.com' && u.pathname.indexOf('/firebasejs/') === 0);
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      return Promise.all(SHELL_FILES.map(function (f) {
        return c.add(f).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf(VERSION) !== 0;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* الصفحة بتبعت رابطها بعد التسجيل عشان يتخزن */
self.addEventListener('message', function (e) {
  var d = e.data;
  if (d && Array.isArray(d.cache)) {
    e.waitUntil(caches.open(SHELL).then(function (c) {
      return Promise.all(d.cache.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }));
  }
});

function networkFirst(req, fallbackKeys, timeoutMs) {
  return new Promise(function (resolve) {
    var done = false;
    function fromCache() {
      return caches.match(req, { ignoreSearch: true }).then(function (r) {
        if (r) return r;
        return fallbackKeys.reduce(function (p, k) {
          return p.then(function (x) { return x || caches.match(k); });
        }, Promise.resolve(null));
      });
    }
    var timer = setTimeout(function () {
      fromCache().then(function (r) { if (r && !done) { done = true; resolve(r); } });
    }, timeoutMs);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put(req, copy); });
      }
      if (!done) { done = true; resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      fromCache().then(function (r) {
        if (!done) { done = true; resolve(r || Response.error()); }
      });
    });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit || Response.error(); });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u = new URL(req.url);

  /* فتح الصفحة: الأحدث من النت لو متاح، وإلا النسخة المخزنة */
  if (req.mode === 'navigate' && u.origin === self.location.origin) {
    e.respondWith(networkFirst(req, ['./index.html', './'], 3500));
    return;
  }
  /* ملفات الموقع نفسه */
  if (u.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  /* الخط والمكتبات وحزمة Firebase */
  if (isCacheableExternal(u)) {
    e.respondWith(staleWhileRevalidate(req, RUNTIME));
    return;
  }
  /* أي حاجة تانية (Firestore، تسجيل الدخول...) تعدّي من غير تدخل */
});
