/// <reference lib="webworker" />

/**
 * Service Worker próprio (estratégia `injectManifest`).
 * Recria manualmente o comportamento que o `generateSW` fazia sozinho
 * (precache, navegação offline, cache de assets/imagens) e acrescenta os
 * listeners de `push`/`notificationclick` que `generateSW` não permite.
 */

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const navigateFallbackDenylist = [/^\/~oauth/];

registerRoute(
  ({ request, sameOrigin, url }) =>
    sameOrigin &&
    request.mode === 'navigate' &&
    !navigateFallbackDenylist.some((re) => re.test(url.pathname)),
  new NetworkFirst({
    cacheName: 'html-navigations',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  })
);

registerRoute(
  ({ url, sameOrigin }) => sameOrigin && /\/assets\//.test(url.pathname),
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);

registerRoute(
  ({ url }) => /supabase\.co\/storage\//.test(url.href),
  new CacheFirst({
    cacheName: 'remote-images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Equivalente ao `navigateFallback: '/index.html'` do generateSW: só entra em
// jogo quando a rota de navegação acima falha (offline e sem nada em cache
// para este URL exacto) — garante que um deep-link nunca visitado antes
// (ex.: /pos) ainda abre a app offline em vez de dar erro de rede.
const navigationFallbackHandler = createHandlerBoundToURL('/index.html');
setCatchHandler(async (options) => {
  if (options.request.destination === 'document') {
    return navigationFallbackHandler(options);
  }
  return Response.error();
});

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }
  const title = payload.title ?? 'Sabor POS';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url ?? '/' },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(self.clients.openWindow(url));
});
