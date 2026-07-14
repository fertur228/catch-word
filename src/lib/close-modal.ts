/**
 * Закрыть модалку (пейволл и т.п.). На вебе после прямого захода/редиректа
 * истории может не быть — тогда уводим на камеру, чтобы юзер не запирался
 * на экране без выхода (фидбэк тестеров 14.07).
 */
import { router } from 'expo-router';

export function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
