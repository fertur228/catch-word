/**
 * Навигатор публичных (маркетинговых) страниц — без заголовка и без табов.
 * Только веб; на нативе сюда нет ссылок.
 */
import { Stack } from 'expo-router';

export default function MarketingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
