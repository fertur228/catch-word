/**
 * Приветствие пользователя по имени — общее для Коллекции и Повторения,
 * чтобы приложение «общалось» с юзером единообразно.
 */
import type { User } from '@supabase/supabase-js';
import { t } from '@/lib/i18n';

/** Приветствие по времени суток. */
export function greetingByHour(hour: number): string {
  if (hour < 5) return t('Доброй ночи');
  if (hour < 12) return t('Доброе утро');
  if (hour < 18) return t('Добрый день');
  return t('Добрый вечер');
}

/** Имя для обращения: из email-регистрации (first_name) или из Google-профиля (full_name). */
export function firstNameOf(user: User | null | undefined): string {
  return (
    (user?.user_metadata?.first_name as string | undefined) ||
    (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ||
    ''
  );
}
