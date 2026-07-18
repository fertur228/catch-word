/**
 * Локальные пуш-напоминания (натив). Разрешение, настройки категорий и
 * пересчёт расписания через expo-notifications. Всё офлайн — без сервера и APNs.
 *
 * Логика «какие пуши и когда» — в чистом планировщике (notification-plan.ts);
 * тут только исполнение: спросить разрешение, прочитать настройки, пересобрать
 * расписание из состояния обучения. Любая ошибка глотается — пуши никогда не
 * ломают приложение.
 *
 * Настройки живут в локальном key_value (свойство устройства, не аккаунта):
 *   notif_master  — мастер-тумблер (по умолчанию выкл, пока не включат явно)
 *   notif_review / notif_streak / notif_quest / notif_winback — категории (вкл)
 */
import * as Notifications from 'expo-notifications';

import * as db from '@/lib/db';
import { getLang } from '@/lib/i18n';
import { planNotifications, type LearningState } from '@/lib/notification-plan';

export type { LearningState } from '@/lib/notification-plan';

const KEY_MASTER = 'notif_master';
const KEY_REVIEW = 'notif_review';
const KEY_STREAK = 'notif_streak';
const KEY_QUEST = 'notif_quest';
const KEY_WINBACK = 'notif_winback';

const QUIET_START = 22;
const QUIET_END = 8;

/** Настройки пушей (мастер + категории). */
export interface NotifPrefs {
  master: boolean;
  review: boolean;
  streak: boolean;
  quest: boolean;
  winback: boolean;
}

// Пока приложение открыто, напоминания не всплывают (они про «вернись», а ты уже тут).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Прочитать настройки пушей (дефолт: мастер выкл, категории вкл). */
export async function getNotifPrefs(): Promise<NotifPrefs> {
  try {
    const [m, r, s, q, w] = await Promise.all([
      db.getPref(KEY_MASTER),
      db.getPref(KEY_REVIEW),
      db.getPref(KEY_STREAK),
      db.getPref(KEY_QUEST),
      db.getPref(KEY_WINBACK),
    ]);
    return {
      master: m === '1',
      review: r !== '0',
      streak: s !== '0',
      quest: q !== '0',
      winback: w !== '0',
    };
  } catch {
    return { master: false, review: true, streak: true, quest: true, winback: true };
  }
}

const CAT_KEY: Record<keyof Omit<NotifPrefs, 'master'>, string> = {
  review: KEY_REVIEW,
  streak: KEY_STREAK,
  quest: KEY_QUEST,
  winback: KEY_WINBACK,
};

/** Переключить одну категорию и запомнить. */
export async function setNotifCategory(cat: keyof Omit<NotifPrefs, 'master'>, on: boolean): Promise<void> {
  try {
    await db.setPref(CAT_KEY[cat], on ? '1' : '0');
  } catch {
    // не сохранилось — переживём
  }
}

/** Выдано ли системное разрешение на уведомления. */
export async function isPermissionGranted(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Включить напоминания: спросить разрешение (системный диалог) и, если дали,
 * поднять мастер-тумблер. Возвращает, включилось ли. Расписание пересобирает
 * вызывающий (у него состояние обучения).
 */
export async function enableNotifications(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const { status } = await Notifications.requestPermissionsAsync();
      granted = status === 'granted';
    }
    if (granted) await db.setPref(KEY_MASTER, '1');
    return granted;
  } catch {
    return false;
  }
}

/** Выключить напоминания: опустить мастер и снять всё запланированное. */
export async function disableNotifications(): Promise<void> {
  try {
    await db.setPref(KEY_MASTER, '0');
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // best-effort
  }
}

/**
 * Пересобрать всё расписание из текущего состояния обучения. Зовётся при любой
 * значимой активности (открытие приложения, скан, конец повторения, смена
 * настроек) — так «возвращалки» отодвигаются, пока пользователь в деле.
 *
 * Сначала ВСЕГДА гасим старое расписание, затем ставим новое (если мастер+
 * разрешение на месте). Идемпотентно.
 */
export async function rescheduleAll(learning: LearningState): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const prefs = await getNotifPrefs();
    if (!prefs.master) return;
    if (!(await isPermissionGranted())) return;

    const plan = planNotifications(
      {
        ...learning,
        lang: getLang(),
        enabled: { review: prefs.review, streak: prefs.streak, quest: prefs.quest, winback: prefs.winback },
        quietStartHour: QUIET_START,
        quietEndHour: QUIET_END,
      },
      Date.now(),
    );

    const now = Date.now();
    for (const n of plan) {
      if (n.fireAt <= now) continue; // на всякий — не ставим в прошлое
      await Notifications.scheduleNotificationAsync({
        content: { title: n.title, body: n.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(n.fireAt) },
      });
    }
  } catch {
    // пуши никогда не роняют приложение
  }
}
