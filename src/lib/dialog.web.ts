/**
 * Веб-вариант диалогов (window.alert / window.confirm). Те же сигнатуры, что и
 * в dialog.ts — потребители (settings, paywall) не меняются между платформами.
 * confirmText/destructive на вебе не применимы (нативный confirm), но в сигнатуре
 * сохранены ради совместимости.
 */
export function alertAsync(title: string, message?: string): Promise<void> {
  if (typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
  }
  return Promise.resolve();
}

export function confirmAsync(
  title: string,
  message?: string,
  _confirmText?: string,
  _destructive?: boolean,
): Promise<boolean> {
  const ok =
    typeof window !== 'undefined' ? window.confirm(message ? `${title}\n\n${message}` : title) : true;
  return Promise.resolve(ok);
}
