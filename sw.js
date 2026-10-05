const CACHE_NAME = 'qg-padel-v23'
const APP_SHELL = ['/index.html', '/style.css', '/script.js', '/logo.png', '/manifest.json', '/players-directory.js', '/fft-import.js', '/convocation-pdf.js', '/inventory.js']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

// Navigation et code de l'app (html/js/css/json) : reseau d'abord, repli sur
// le cache hors connexion. Indispensable pour que la page et script.js
// restent toujours de la meme version apres une mise a jour (avant, le JS
// etait servi depuis le cache alors que la page etait neuve : boutons morts).
// Librairies vendor/ et images : cache d'abord (lourdes, changent rarement).
function putInCache(request, response) {
  if (response && response.status === 200 && new URL(request.url).origin === self.location.origin) {
    const clone = response.clone()
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')))
    return
  }

  const url = new URL(event.request.url)
  const cacheFirst = url.pathname.startsWith('/vendor/') || /\.(png|jpe?g|svg|ico|webp)$/i.test(url.pathname)

  if (cacheFirst) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((r) => putInCache(event.request, r)))
    )
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((r) => putInCache(event.request, r))
      .catch(() => caches.match(event.request))
  )
})
