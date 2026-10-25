import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  BellRing,
  CalendarCheck,
  CheckCheck,
  Clock3,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { AppNotification } from '../hooks/useNotifications';
import type { UserSettings } from '../types/settings';
import { analytics } from '../analytics';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  settings: Partial<UserSettings>;
  onSettingChange: (key: keyof UserSettings, value: unknown) => void;
}

type PermissionState = NotificationPermission | 'unsupported';

function readPermission(): PermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

const TYPE_ICONS = {
  reminder: CalendarCheck,
  session: Sparkles,
  system: Bell,
} as const;

export function NotificationsPanel({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  settings,
  onSettingChange,
}: NotificationsPanelProps): JSX.Element | null {
  const { t, i18n } = useTranslation('common');
  const modalRef = useFocusTrap(isOpen);
  const [permission, setPermission] = useState<PermissionState>(() => readPermission());

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    // Re-read permission whenever the panel opens; users may have changed it
    // in browser settings while the app stayed open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(readPermission());
  }, [isOpen]);

  const requestBrowserPermission = useCallback(async (): Promise<void> => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      analytics.track('notifications_permission', { result });
    } catch {
      setPermission(Notification.permission);
    }
  }, []);

  if (!isOpen) return null;

  const remindersEnabled = Boolean(settings.notifications_enabled);

  return (
    <div className="fixed inset-0 z-[60] bg-black/50" role="presentation" onClick={handleClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-star-white shadow-2xl outline-none dark:bg-gray-800 rtl:left-0 rtl:right-auto"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-immigo-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-art-blue-600" />
            <h2 id="notifications-title" className="text-lg font-bold text-deep-navy dark:text-gray-100">{t('notifications.title')}</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-art-blue-600 px-2 py-0.5 text-xs font-bold text-white">{unreadCount}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('notifications.close')}
            className="rounded-full p-2 text-immigo-gray-600 hover:bg-immigo-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <section aria-labelledby="notifications-list-title">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="notifications-list-title" className="text-sm font-bold uppercase tracking-wide text-immigo-gray-600 dark:text-gray-400">
                {t('notifications.notificationsSection')}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  disabled={unreadCount === 0}
                  aria-label={t('notifications.markAllRead')}
                  title={t('notifications.markAllRead')}
                  className="rounded-full p-1.5 text-immigo-gray-600 hover:bg-immigo-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  disabled={notifications.length === 0}
                  aria-label={t('notifications.clearAll')}
                  title={t('notifications.clearAll')}
                  className="rounded-full p-1.5 text-immigo-gray-600 hover:bg-immigo-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {notifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-immigo-gray-300 p-6 text-center dark:border-gray-600">
                <Bell className="mx-auto h-8 w-8 text-immigo-gray-500 dark:text-gray-400" />
                <p className="mt-2 text-sm font-semibold text-deep-navy dark:text-gray-100">{t('notifications.empty')}</p>
                <p className="mt-1 text-xs text-immigo-gray-600 dark:text-gray-400">{t('notifications.emptyHint')}</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {notifications.map(notification => {
                  const Icon = TYPE_ICONS[notification.type] ?? Bell;
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => onMarkRead(notification.id)}
                        className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${notification.read
                          ? 'border-immigo-gray-200 bg-star-white hover:bg-immigo-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/50'
                          : 'border-art-blue-200 bg-art-blue-50 hover:bg-art-blue-100 dark:border-art-blue-800 dark:bg-art-blue-900/20 dark:hover:bg-art-blue-900/30'}`}
                      >
                        <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${notification.read
                          ? 'bg-immigo-gray-100 text-immigo-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-art-blue-600 text-white'}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm font-bold text-deep-navy dark:text-gray-100">{notification.title}</span>
                            {!notification.read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-art-blue-600" aria-label={t('notifications.unread')} />}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-immigo-gray-700 dark:text-gray-300">{notification.body}</span>
                          <span className="mt-1 flex items-center gap-1 text-[11px] text-immigo-gray-500 dark:text-gray-400">
                            <Clock3 className="h-3 w-3" />
                            {new Date(notification.createdAt).toLocaleString(i18n.language, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="notifications-reminders-title" className="rounded-xl border border-immigo-gray-200 p-4 dark:border-gray-700">
            <h3 id="notifications-reminders-title" className="text-sm font-bold uppercase tracking-wide text-immigo-gray-600 dark:text-gray-400">
              {t('notifications.remindersSection')}
            </h3>

            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-deep-navy dark:text-gray-100">{t('notifications.remindersTitle')}</p>
                <p className="mt-0.5 text-xs text-immigo-gray-600 dark:text-gray-400">{t('notifications.remindersDescription')}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={remindersEnabled}
                aria-label={t('notifications.remindersTitle')}
                onClick={() => onSettingChange('notifications_enabled', !remindersEnabled)}
                className={`flex h-6 w-12 flex-shrink-0 items-center rounded-full p-1 transition-colors ${remindersEnabled ? 'justify-end bg-art-blue-600' : 'justify-start bg-immigo-gray-300 dark:bg-gray-600'}`}
              >
                <span className="h-4 w-4 rounded-full bg-white shadow-md" />
              </button>
            </div>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-semibold text-deep-navy dark:text-gray-100">{t('notifications.reminderTime')}</span>
              <input
                type="time"
                value={settings.reminder_time ?? '19:00'}
                onChange={event => onSettingChange('reminder_time', event.target.value)}
                disabled={!remindersEnabled}
                className="w-full rounded-lg border-2 border-immigo-gray-300 bg-star-white p-2 text-sm text-deep-navy disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </label>

            <div className="mt-4 rounded-lg bg-immigo-gray-50 p-3 dark:bg-gray-900/40">
              <p className="text-sm font-semibold text-deep-navy dark:text-gray-100">{t('notifications.browserTitle')}</p>
              <p className="mt-0.5 text-xs text-immigo-gray-600 dark:text-gray-400">{t('notifications.browserDescription')}</p>

              {permission === 'unsupported' && (
                <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">{t('notifications.browserUnsupported')}</p>
              )}
              {permission === 'default' && (
                <button
                  type="button"
                  onClick={() => { void requestBrowserPermission(); }}
                  className="mt-2 rounded-lg border border-art-blue-600 px-3 py-1.5 text-xs font-bold text-art-blue-700 hover:bg-art-blue-50 dark:text-art-blue-200 dark:hover:bg-art-blue-900/30"
                >
                  {t('notifications.browserEnable')}
                </button>
              )}
              {permission === 'granted' && (
                <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t('notifications.browserGranted')}</p>
              )}
              {permission === 'denied' && (
                <p className="mt-2 text-xs font-medium text-art-red-700 dark:text-art-red-300">{t('notifications.browserDenied')}</p>
              )}
              <p className="mt-2 text-[11px] text-immigo-gray-500 dark:text-gray-400">{t('notifications.browserWhileOpen')}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
