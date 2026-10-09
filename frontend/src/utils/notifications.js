// Real-Time Mobile & Desktop Push Notification Helper

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser.');
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

export async function sendMobileNotification(title, options = {}) {
  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    const defaultOptions = {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: options.tag || 'abhigam-pass-alert',
      renotify: true,
      requireInteraction: false,
      ...options,
    };

    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.showNotification) {
        await registration.showNotification(title, defaultOptions);
        return;
      }
    }

    // Fallback to standard Notification
    new Notification(title, defaultOptions);
  } catch (err) {
    console.error('Failed to trigger mobile notification:', err);
  }
}
