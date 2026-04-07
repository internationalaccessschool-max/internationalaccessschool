importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBnardmc017DwxLkGSj-NopIRp94Ho41BQ",
  authDomain: "international-access-school.firebaseapp.com",
  projectId: "international-access-school",
  storageBucket: "international-access-school.firebasestorage.app",
  messagingSenderId: "891809929028",
  appId: "1:891809929028:web:422f555289880bb021a911"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || "New Notification";
  const notificationOptions = {
    body: payload.notification?.body || "Tap to view",
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    requireInteraction: true,
    data: payload.data || {},
    actions: [
      { action: 'view', title: 'View Attendance' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = '/student/attendance';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
