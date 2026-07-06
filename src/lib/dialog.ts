/**
 * Кросс-платформенные диалоги (нативная версия — поверх Alert из react-native).
 * Нужно, потому что Alert.alert с кнопками не работает в react-native-web —
 * у веба свой вариант (dialog.web.ts) на window.confirm/alert. Один и тот же
 * вызов `confirmAsync`/`alertAsync` работает и на телефоне, и в браузере.
 */
import { Alert } from 'react-native';
import { t } from '@/lib/i18n';

/** Информационное окно с кнопкой OK. */
export function alertAsync(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
      onDismiss: () => resolve(),
    });
  });
}

/** Подтверждение: true — нажали действие, false — отмена/закрытие. */
export function confirmAsync(
  title: string,
  message?: string,
  confirmText = 'OK',
  destructive = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: t('Отмена'), style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { onDismiss: () => resolve(false) },
    );
  });
}
