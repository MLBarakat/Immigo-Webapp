import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useNotifications } from '../useNotifications';

function removeStoredNotifications(): void {
  window.localStorage.clear();
}

beforeEach(() => {
  removeStoredNotifications();
});

afterEach(() => {
  cleanup();
  removeStoredNotifications();
});

describe('useNotifications', () => {
  it('seeds one welcome notification and supports read/clear actions', async () => {
    const { result } = renderHook(() => useNotifications({
      userId: 'user-a',
      settings: { notifications_enabled: false },
    }));

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].title).toBe('Welcome to ImmiGO');
    expect(result.current.unreadCount).toBe(1);

    act(() => result.current.markRead(result.current.notifications[0].id));
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications[0].read).toBe(true);

    act(() => result.current.addNotification({ type: 'session', title: 'Session complete', body: 'Nice work.' }));
    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.unreadCount).toBe(1);

    act(() => result.current.clearAll());
    expect(result.current.notifications).toHaveLength(0);
  });

  it('creates a daily reminder once when the configured time has passed', async () => {
    const now = new Date();
    const reminderTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const { result, rerender } = renderHook(
      ({ enabled }) => useNotifications({
        userId: 'user-b',
        settings: { notifications_enabled: enabled, reminder_time: reminderTime },
      }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.notifications.some(item => item.type === 'reminder')).toBe(true));
    const reminderCount = result.current.notifications.filter(item => item.type === 'reminder').length;
    expect(reminderCount).toBe(1);

    rerender({ enabled: true });
    await Promise.resolve();
    expect(result.current.notifications.filter(item => item.type === 'reminder')).toHaveLength(1);
  });

  it('does not leak one account notifications into another', async () => {
    const first = renderHook(() => useNotifications({
      userId: 'user-c',
      settings: { notifications_enabled: false },
    }));
    await waitFor(() => expect(first.result.current.notifications).toHaveLength(1));
    act(() => first.result.current.addNotification({ type: 'system', title: 'Only for C', body: 'Private.' }));
    expect(first.result.current.notifications).toHaveLength(2);
    first.unmount();

    const second = renderHook(() => useNotifications({
      userId: 'user-d',
      settings: { notifications_enabled: false },
    }));
    await waitFor(() => expect(second.result.current.notifications).toHaveLength(1));
    expect(second.result.current.notifications[0].title).toBe('Welcome to ImmiGO');
    expect(second.result.current.notifications.some(item => item.title === 'Only for C')).toBe(false);
  });
});
