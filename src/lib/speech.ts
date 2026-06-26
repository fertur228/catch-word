/**
 * Озвучка слова системным голосом (спека §2: отстройка от «робо-голоса»
 * конкурента — используем нативный `expo-speech`).
 */
import * as Speech from 'expo-speech';

/**
 * Произнести слово на изучаемом языке.
 * @param text   что произнести
 * @param language BCP-47 код, напр. 'en-US' — задаёт акцент/голос
 */
export function speakWord(text: string, language = 'en-US') {
  // Прерываем предыдущее произношение, чтобы не накладывалось.
  Speech.stop();
  Speech.speak(text, { language, rate: 0.95, pitch: 1.0 });
}
