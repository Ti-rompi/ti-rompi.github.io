// Ti rompi : fonctionnement hors connexion
const CACHE = 'ti-rompi-0987afb5bf';
const FICHIERS = ["./", "index.html", "manifest.webmanifest", "css/style.css", "js/moteur.js", "js/i18n.js", "js/app.js", "data/synaxaire.js", "data/rites.js", "data/paroisses.js", "data/saints.js", "data/icones.js", "data/version.js", "fonts/cs-avva-shenouda.ttf", "img/logo.svg", "img/icones/apple-touch-icon.png", "img/icones/icon-192.png", "img/icones/icon-512.png", "img/saints/samuel.jpg", "img/saints/moise.png", "img/saints/mercure.jpg", "img/saints/kyrillos.png", "img/saints/mina.jpg", "img/saints/marc.png", "img/saints/georges.png", "img/saints/judas.jpg", "img/saints/crucifixion.png", "img/saints/lakkan.png", "img/saints/antoine.png", "img/saints/raphael.jpg", "img/saints/jean.png", "img/saints/rameaux.jpg", "img/saints/michel.png", "img/saints/vierge.jpg", "img/saints/karas.jpg", "img/saints/bichoy.jpg", "img/saints/paul.jpg", "img/saints/pierrepaul.jpg"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const local = e.request.url.startsWith(self.location.origin);
  // Fichiers de l'app : réseau d'abord (mises à jour visibles tout de suite), copie locale si hors connexion
  if (local) {
    e.respondWith(fetch(e.request).then((rep) => {
      if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(e.request, copie)); }
      return rep;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
    return;
  }
  // Polices Google : copie locale d'abord (le reste, ex. miniatures YouTube, passe directement)
  if (!/fonts\.(googleapis|gstatic)\.com/.test(e.request.url)) return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((rep) => {
    if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(e.request, copie)); }
    return rep;
  })));
});
