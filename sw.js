
importScripts("https://www.gstatic.com/firebasejs/13.2.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.2.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBJFCyGS-cEaEm0_c_-p0CzunNcME9-u7Q",
  authDomain: "mon-transport-ci.firebaseapp.com",
  projectId: "mon-transport-ci",
  storageBucket: "mon-transport-ci.firebasestorage.app",
  messagingSenderId: "326599026854",
  appId: "1:326599026854:web:73a33f95f427854aec6c67"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const notification = payload.notification || {};
  const title = notification.title || "Mon Quotidien CI";
  const options = {
    body: notification.body || "Une nouvelle information vous attend.",
    icon: "./E806C6C4-A1B3-469C-9D73-7EC9FBC1899C.png",
    badge: "./E806C6C4-A1B3-469C-9D73-7EC9FBC1899C.png",
    data: payload.data || {}
  };
  return self.registration.showNotification(title, options);
});

const CACHE_NAME = "mon-quotidien-ci-shell-v29";
const APP_SHELL = "./";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(APP_SHELL, copy));
          }
          return response;
        })
        .catch(() => caches.match(APP_SHELL))
    );
  }
});