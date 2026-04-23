importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAESzsip2HRLHSULKLdOeMSFwi0F8LBBKM",
  authDomain: "gen-lang-client-0814607711.firebaseapp.com",
  projectId: "gen-lang-client-0814607711",
  storageBucket: "gen-lang-client-0814607711.firebasestorage.app",
  messagingSenderId: "1064307372341",
  appId: "1:1064307372341:web:2fef62d5fdb9150cae9c7c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  if (payload.data && payload.data.type === 'incoming_call') {
    const notificationTitle = 'Incoming Call';
    const notificationOptions = {
      body: payload.data.callerName + ' is calling you...',
      icon: '/favicon.ico',
      tag: 'incoming-call-' + payload.data.callId,
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: 'answer', title: 'Answer', icon: '/icons/accept.png' },
        { action: 'decline', title: 'Decline', icon: '/icons/decline.png' }
      ],
      data: {
        callId: payload.data.callId,
        type: 'incoming_call'
      }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const callId = event.notification.data.callId;
  const action = event.action;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then(c => {
            c.postMessage({ type: 'NOTIFICATION_CLICKED', action, callId });
          });
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/?callId=' + callId + '&action=' + (action || 'answer'));
      }
    })
  );
});
