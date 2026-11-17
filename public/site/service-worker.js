// Developer: Mohamed Dah Agove
const ISCAE_SW_BUILD = "iscae-shell-cache-v11-fast-20261117";
const ISCAE_CACHE_PREFIX = "iscae-app-shell-";
const ISCAE_CACHE_NAME = `${ISCAE_CACHE_PREFIX}${ISCAE_SW_BUILD}`;
const ISCAE_CDN_CACHE = "iscae-cdn-libs-v1";
const ISCAE_SHELL_URL = new URL("./index.html", self.registration.scope).href;
/* إن تأخرت الشبكة أكثر من هذه المدة نعرض النسخة المخزّنة فوراً ونحدّثها في الخلفية */
const NETWORK_TIMEOUT_MS = 1800;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(ISCAE_CACHE_NAME);
        await cache.add(new Request(ISCAE_SHELL_URL, { cache: "reload" }));
      } catch (error) {
        console.warn("[Service Worker] Shell precache skipped", error);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const previousCaches = cacheNames.filter(
        (name) => name.startsWith(ISCAE_CACHE_PREFIX) && name !== ISCAE_CACHE_NAME,
      );
      const currentCache = await caches.open(ISCAE_CACHE_NAME);
      await Promise.all(previousCaches.map(async (name) => {
        const previousCache = await caches.open(name);
        for (const request of await previousCache.keys()) {
          if (await currentCache.match(request)) continue;
          const response = await previousCache.match(request);
          if (response) await currentCache.put(request, response);
        }
        await caches.delete(name);
      }));
      await self.clients.claim();
    })(),
  );
});

/* مكتبات CDN المثبّتة على إصدار محدد (supabase / xlsx / html5-qrcode): ثابتة، فنخزّنها ونقدّمها فوراً بعد أول تحميل */
const CDN_HOSTS = /^(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)$/i;
const PINNED_CDN_PATH = /@\d+\.\d+\.\d+/;

async function cdnCacheFirst(request) {
  const cache = await caches.open(ISCAE_CDN_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    try { await cache.put(request, response.clone()); } catch (_) {}
  }
  return response;
}

/* الشبكة أولاً (لضمان أحدث نسخة) مع مهلة قصيرة تُرجع النسخة المخزّنة إن كانت الشبكة بطيئة */
async function networkWithTimeout(event, request, cacheKey) {
  const cache = await caches.open(ISCAE_CACHE_NAME);
  const cached = (await cache.match(cacheKey || request)) || (await cache.match(ISCAE_SHELL_URL));
  const network = fetch(new Request(request, { cache: "reload" })).then(async (response) => {
    if (response && response.ok && response.type === "basic") await cache.put(cacheKey || request, response.clone());
    return response;
  });
  event.waitUntil(network.catch(() => null));
  if (!cached) return network.catch(() => Response.error());
  return Promise.race([
    network.catch(() => cached),
    new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS)),
  ]);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (CDN_HOSTS.test(url.hostname) && PINNED_CDN_PATH.test(url.pathname)) {
    event.respondWith(cdnCacheFirst(request).catch(() => fetch(request)));
    return;
  }

  // لا نتدخل في Supabase أو APIs أو أي مصدر خارجي آخر: البيانات والرموز تبقى دائماً عبر الشبكة.
  if (url.origin !== self.location.origin || /\/api\//i.test(url.pathname)) return;
  const inScope = url.href.startsWith(self.registration.scope);
  if (!inScope) return;
  const isAppNavigation =
    request.mode === "navigate" &&
    (url.pathname.endsWith("/index.html") || url.pathname.endsWith("/site/"));
  if (isAppNavigation) {
    event.respondWith(networkWithTimeout(event, request, request));
    return;
  }
  // ملفات ثابتة من نفس التطبيق فقط؛ لا تُخزّن manifest أو الصور/الشعارات الديناميكية.
  const isVersionedAsset =
    /\.(?:css|js|woff2?|ttf|otf)$/i.test(url.pathname) &&
    !/service-worker\.js$/i.test(url.pathname);
  if (!isVersionedAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(ISCAE_CACHE_NAME);
    const cached = await cache.match(request);
    const network = fetch(new Request(request, { cache: "reload" })).then(async (response) => {
      if (response && response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    });
    event.waitUntil(network.catch(() => null));
    if (!cached) return network.catch(() => Response.error());
    return Promise.race([
      network.catch(() => cached),
      new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS)),
    ]);
  })());
});

/* WEB PUSH — إشعارات المشرف الرئيسي */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "Graduation platform", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || payload.institution || "Graduation platform";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "./icons/icon-192.png",
    badge: payload.badge || "./icons/favicon-32.png",
    dir: "auto",
    lang: payload.lang || "ar",
    tag: payload.tag || "promo-notif-" + (payload.id || Date.now()),
    renotify: true,
    requireInteraction: false,
    data: { url: payload.url || "./index.html", id: payload.id || null },
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./index.html";
  event.waitUntil(
    (async () => {
      const url = new URL(target, self.registration.scope).href;
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch (e) {}
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

/* انتهاء صلاحية الاشتراك لدى خدمة Push: نعيد الاشتراك بنفس المفتاح ونُعلم الصفحة لتحفظه في قاعدة البيانات */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        let key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
        if (!key) {
          const res = await fetch("/api/public/push/vapid-key", { headers: { accept: "application/json" } });
          const data = res.ok ? await res.json() : null;
          if (data && data.publicKey) {
            const padding = "=".repeat((4 - (data.publicKey.length % 4)) % 4);
            const raw = atob((data.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
            key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
          }
        }
        if (key) await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      } catch (error) {
        console.warn("[Service Worker] resubscribe failed", error);
      }
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clientList.forEach((client) => client.postMessage({ type: "pm-push-resubscribed" }));
    })(),
  );
});
