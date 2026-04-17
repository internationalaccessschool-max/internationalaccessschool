// Self-unregistering stub. This file used to be a Firebase Messaging SW that
// competed with OneSignal's SW for the same scope. Now we use OneSignal only.
// When a browser that previously registered this SW fetches the updated file,
// the activate handler below will unregister it and release scope to OneSignal.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => self.clients.claim())
  );
});
