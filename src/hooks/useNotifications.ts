import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserSettings } from '../types/settings';

export type AppNotificationType = 'reminder' | 'session' | 'system';

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export type NewAppNotification = Omit<AppNotification, 'id' | 'createdAt' | 'read'>;

interface UseNotificationsOptions {
  userId: string | null | undefined;
  settings: Partial<UserSettings>;
}

const MAX_STORED_NOTIFICATIONS = 50;

function storageKey(userId: string | null | undefined, suffix: string): string {
  return `immigo_${suffix}_${userId ?? 'guest'}`;
}

function readStoredNotifications(key: string): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AppNotification => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<AppNotification>;
      return typeof candidate.id === 'string' &&
        typeof candidate.title === 'string' &&
        typeof candidate.body === 'string' &&
        typeof candidate.createdAt === 'string';
    });
  } catch {
    return [];
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Device-local notification centre with a once-daily practice reminder.
 *
 * Notifications persist per user in localStorage so no additional backend
 * table is required. Browser notifications are shown while ImmiGo is open;
 * true background push would require a service worker and push subscription.
 */
export function useNotifications({ userId, settings }: UseNotificationsOptions) {
  const { t } = useTranslation('common');
  const notificationKey = storageKey(userId, 'notifications');
  const seededKey = storageKey(userId, 'notifications_seeded');
  const reminderStampKey = storageKey(userId, 'reminder_last_sent');

  const [notifications, setNotifications] = useState<AppNotification[]>(() => readStoredNotifications(notificationKey));
  const activeKeyRef = useRef(notificationKey);

  // Reload the mailbox when the authenticated user changes (e.g. account switch).
  useEffect(() => {
    if (activeKeyRef.current === notificationKey) return;
    activeKeyRef.current = notificationKey;
    setNotifications(readStoredNotifications(notificationKey));
  }, [notificationKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(notificationKey, JSON.stringify(notifications));
    } catch {
      // Storage can be unavailable in private browsing; notifications still work in-memory.
    }
  }, [notificationKey, notifications]);

  const addNotification = useCallback((input: NewAppNotification): void => {
    setNotifications(previous => [
      {
        ...input,
        id: makeId(),
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...previous,
    ].slice(0, MAX_STORED_NOTIFICATIONS));
  }, []);

  const markRead = useCallback((id: string): void => {
    setNotifications(previous => previous.map(item => item.id === id ? { ...item, read: true } : item));
  }, []);

  const markAllRead = useCallback((): void => {
    setNotifications(previous => previous.map(item => item.read ? item : { ...item, read: true }));
  }, []);

  const clearAll = useCallback((): void => {
    setNotifications([]);
  }, []);

  // Seed a single welcome notification per account so the bell has a clear
  // purpose on first visit without pretending a server event occurred.
  useEffect(() => {
    if (!userId) return;
    try {
      if (window.localStorage.getItem(seededKey) === 'true') return;
      window.localStorage.setItem(seededKey, 'true');
    } catch {
      // If storage is unavailable, seed once for this mount only.
    }
    // Seed once per account; disabling preserves the explicit one-time gate above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    addNotification({
      type: 'system',
      title: t('notifications.welcomeTitle'),
      body: t('notifications.welcomeBody'),
    });
  }, [userId, seededKey, addNotification, t]);

  const remindersEnabled = Boolean(settings.notifications_enabled);
  const reminderTime = settings.reminder_time || '19:00';

  useEffect(() => {
    if (!userId || !remindersEnabled) return;

    const checkReminder = () => {
      const [hourText, minuteText] = reminderTime.split(':');
      const hour = Number(hourText);
      const minute = Number(minuteText);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;

      const now = new Date();
      const minutesNow = now.getHours() * 60 + now.getMinutes();
      if (minutesNow < hour * 60 + minute) return;

      const today = localDateKey(now);
      try {
        if (window.localStorage.getItem(reminderStampKey) === today) return;
        window.localStorage.setItem(reminderStampKey, today);
      } catch {
        // Without storage the interval guard below still prevents rapid duplicates.
      }

      const title = t('notifications.reminderTitle');
      const body = t('notifications.reminderBody');
      addNotification({ type: 'reminder', title, body });

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            tag: 'immigo-practice-reminder',
            icon: '/favicon.ico',
          });
        } catch {
          // Some browsers only allow notifications from a service worker; the
          // in-app notification above is the fallback.
        }
      }
    };

    checkReminder();
    const interval = window.setInterval(checkReminder, 60_000);
    return () => window.clearInterval(interval);
  }, [userId, remindersEnabled, reminderTime, reminderStampKey, addNotification, t]);

  const unreadCount = useMemo(
    () => notifications.reduce((count, item) => count + (item.read ? 0 : 1), 0),
    [notifications],
  );

  return {
    notifications,
    unreadCount,
    addNotification,
    markRead,
    markAllRead,
    clearAll,
  };
}
