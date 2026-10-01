const CACHE_NAME = 'qg-padel-v5'
const APP_SHELL = ['/index.html', '/style.css', '/script.js', '/logo.png', '/manifest.json', '/players-directory.js', '/fft-import.js', '/convocation-pdf.js']

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

// Navigation (ouverture/rafraichissement d'une route type /accueil, /tournoi16-1...) :
// reseau d'abord, puis repli sur la coquille index.html mise en cache (le routeur
// cote client de script.js prend le relais une fois charge). Autres requetes GET :
// cache d'abord (affichage instantane), mise a jour en arriere-plan si le reseau repond.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')))
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)
      return cached || networkFetch
    })
  )
})
