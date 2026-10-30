// Developer: Mohamed Dah Agove
const ISCAE_SW_BUILD = "iscae-shell-cache-v5-multi-university";
const ISCAE_CACHE_PREFIX = "iscae-app-shell-";
const ISCAE_CACHE_NAME = `${ISCAE_CACHE_PREFIX}${ISCAE_SW_BUILD}`;
const ISCAE_SHELL_URL = new URL("./index.html", self.registration.scope).href;

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
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(ISCAE_CACHE_PREFIX) && name !== ISCAE_CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // لا نتدخل في Supabase أو APIs أو أي مصدر خارجي: البيانات والرموز تبقى دائماً عبر الشبكة.
  if (url.origin !== self.location.origin || /\/api\//i.test(url.pathname)) return;
  const inScope = url.href.startsWith(self.registration.scope);
  if (!inScope) return;
  const isAppNavigation =
    request.mode === "navigate" &&
    (url.pathname.endsWith("/index.html") || url.pathname.endsWith("/site/"));
  if (isAppNavigation) {
    const cachePromise = caches.open(ISCAE_CACHE_NAME);
    const networkPromise = cachePromise.then((cache) =>
      fetch(request).then((response) => {
        if (response && response.ok && response.type === "basic")
          cache.put(request, response.clone()).catch(() => {});
        return response;
      }),
    );
    event.waitUntil(
      networkPromise.then(
        () => undefined,
        () => undefined,
      ),
    );
    event.respondWith(
      cachePromise.then(async (cache) => {
        const cached = (await cache.match(request)) || (await cache.match(ISCAE_SHELL_URL));
        return cached || networkPromise;
      }),
    );
    return;
  }
  // ملفات ثابتة من نفس التطبيق فقط؛ لا تُخزّن manifest أو الصور/الشعارات الديناميكية.
  const isVersionedAsset =
    /\.(?:css|js|woff2?|ttf|otf)$/i.test(url.pathname) &&
    !/service-worker\.js$/i.test(url.pathname);
  if (!isVersionedAsset) return;
  const cachePromise = caches.open(ISCAE_CACHE_NAME);
  const networkPromise = cachePromise.then((cache) =>
    fetch(request).then((response) => {
      if (response && response.ok && response.type === "basic")
        cache.put(request, response.clone()).catch(() => {});
      return response;
    }),
  );
  event.waitUntil(
    networkPromise.then(
      () => undefined,
      () => undefined,
    ),
  );
  event.respondWith(
    cachePromise.then(async (cache) => (await cache.match(request)) || networkPromise),
  );
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

self.addEventListener("pushsubscriptionchange", () => {
  console.log("[Service Worker] pushsubscriptionchange");
});
