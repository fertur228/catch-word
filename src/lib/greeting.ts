/**
 * Приветствие пользователя по имени — общее для Коллекции и Повторения,
 * чтобы приложение «общалось» с юзером единообразно.
 */
import type { User } from '@supabase/supabase-js';

/** Приветствие по времени суток. */
export function greetingByHour(hour: number): string {
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

/** Имя для обращения: из email-регистрации (first_name) или из Google-профиля (full_name). */
export function firstNameOf(user: User | null | undefined): string {
  return (
    (user?.user_metadata?.first_name as string | undefined) ||
    (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ||
    ''
  );
}
