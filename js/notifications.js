// Push Notifications Manager for VoiceNotes
// Sends hourly reminders to review notes

class NotificationManager {
  constructor() {
    this.notificationsEnabled = localStorage.getItem('voiceNotes_notificationsEnabled') === 'true';
    this.lastNotificationTime = parseInt(localStorage.getItem('voiceNotes_lastNotificationTime')) || 0;
    this.notificationInterval = null;
    this.init();
  }

  async init() {
    // Request notification permission if not already granted
    if (this.notificationsEnabled && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await this.requestPermission();
      }
    }
    
    // Check service worker availability for background notifications
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.ready;
      } catch (error) {
        console.log('Service Worker not available for notifications');
      }
    }
    
    this.startNotificationSchedule();
  }

  async requestPermission() {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('Notification permission granted');
        return true;
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
    return false;
  }

  startNotificationSchedule() {
    // Clear existing interval
    if (this.notificationInterval) {
      clearInterval(this.notificationInterval);
    }

    if (!this.notificationsEnabled) {
      return;
    }

    // Check every minute if it's time to send notification
    this.notificationInterval = setInterval(() => {
      this.checkAndSendNotification();
    }, 60000); // Check every minute

    // Also check immediately on startup
    this.checkAndSendNotification();
  }

  checkAndSendNotification() {
    const now = Date.now();
    const lastNotif = this.lastNotificationTime;
    const oneHourInMs = 60 * 60 * 1000;

    // Send notification if it's been more than an hour
    if (now - lastNotif >= oneHourInMs) {
      this.sendNotification();
      this.lastNotificationTime = now;
      localStorage.setItem('voiceNotes_lastNotificationTime', now.toString());
    }
  }

  sendNotification() {
    if (!this.notificationsEnabled) return;

    const title = '📝 Time to Review Your Notes';
    const options = {
      body: 'Check out your latest voice notes and memories!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag: 'voicenotes-reminder',
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };

    // Send notification via Notifications API
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, options);
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }

    // Also try to send via service worker if available
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title: title,
        options: options
      });
    }
  }

  toggleNotifications(enable) {
    this.notificationsEnabled = enable;
    localStorage.setItem('voiceNotes_notificationsEnabled', enable.toString());

    if (enable) {
      this.requestPermission().then(() => {
        this.startNotificationSchedule();
        this.sendNotification(); // Send immediate notification to confirm
      });
    } else {
      if (this.notificationInterval) {
        clearInterval(this.notificationInterval);
      }
    }
  }

  isEnabled() {
    return this.notificationsEnabled;
  }

  getPermissionStatus() {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'denied';
  }
}

// Initialize on load
const notificationManager = new NotificationManager();
