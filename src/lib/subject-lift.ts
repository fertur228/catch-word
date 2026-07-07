/**
 * Нативная вырезка фона (iOS 17+): фото → прозрачный PNG с предметом.
 *
 * Реализация — Swift-модуль `modules/subject-lift` (Vision). До нативной
 * пересборки и в Expo Go модуль недоступен → возвращаем null, и поток
 * откатывается на кроп по рамке. Так JS работает на любой стадии.
 */
import { requireOptionalNativeModule } from 'expo';

interface SubjectLiftNative {
  liftToPNG(uri: string): Promise<string>;
}

const native = requireOptionalNativeModule<SubjectLiftNative>('SubjectLift');

/** Встроена ли нативная вырезка в текущую сборку. */
export function isSubjectLiftAvailable(): boolean {
  return native != null;
}

/** Вырезать предмет из фона → file:// PNG. null, если недоступно / не получилось. */
export async function liftToPNG(uri: string): Promise<string | null> {
  if (!native?.liftToPNG) {
    // Модуль не вкомпилирован в текущий бинарник (Expo Go / старая сборка без
    // pod install). Видно в dev-логах — сигнал сделать чистую пересборку.
    if (__DEV__) console.warn('[subject-lift] нативный модуль SubjectLift недоступен в этой сборке');
    return null;
  }
  try {
    return await native.liftToPNG(uri);
  } catch (e) {
    // Частая причина — NO_SUBJECT (Vision не нашёл чёткий предмет на фото).
    if (__DEV__) console.warn('[subject-lift] вырезка не удалась:', e);
    return null;
  }
}
