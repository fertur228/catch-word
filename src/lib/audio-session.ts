/**
 * Аудио-сессия iOS для озвучки. Переводит звук в режим «воспроизведение»,
 * чтобы произношение (expo-speech) звучало ДАЖЕ в беззвучном режиме — как в
 * Duolingo/ELSA. Реализация — нативный модуль `modules/audio-session`.
 *
 * До нативной пересборки / в Expo Go модуль недоступен → no-op (звук тогда
 * подчиняется переключателю «без звука», как раньше).
 */
import { requireOptionalNativeModule } from 'expo';

interface AudioSessionNative {
  configureForPlayback(): boolean;
}

const native = requireOptionalNativeModule<AudioSessionNative>('AudioSession');

/** Настроить аудио так, чтобы озвучка играла даже в беззвучном режиме. */
export function configurePlayback(): boolean {
  if (!native?.configureForPlayback) return false;
  try {
    return native.configureForPlayback();
  } catch {
    return false;
  }
}
