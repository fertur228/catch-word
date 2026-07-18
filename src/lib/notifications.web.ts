/**
 * Веб-заглушка пушей: те же экспорты, что в notifications.ts, но без действий.
 * Локальные пуш-напоминания — фича мобильного приложения; на вебе их нет.
 */
export type { LearningState } from '@/lib/notification-plan';

export interface NotifPrefs {
  master: boolean;
  review: boolean;
  streak: boolean;
  quest: boolean;
  winback: boolean;
}

export async function getNotifPrefs(): Promise<NotifPrefs> {
  return { master: false, review: true, streak: true, quest: true, winback: true };
}

export async function setNotifCategory(): Promise<void> {
  // no-op на вебе
}

export async function isPermissionGranted(): Promise<boolean> {
  return false;
}

export async function enableNotifications(): Promise<boolean> {
  return false;
}

export async function disableNotifications(): Promise<void> {
  // no-op на вебе
}

export async function rescheduleAll(): Promise<void> {
  // no-op на вебе
}
