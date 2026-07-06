/**
 * Native-фолбэк демо-видео. Лендинг /welcome на нативе фактически недоступен
 * (гейт уводит анонима на /sign-in, а не /welcome) — но файл должен собираться
 * под натив. Показываем аккуратную заглушку, чтобы Metro-бандл был валиден.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';

export function VideoDemo({ label }: { src: string; poster?: string; label?: string; maxWidth?: number }) {
  return (
    <View style={styles.box}>
      <View style={styles.play}>
        <Icon name="play.fill" size={18} color="#98989F" />
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    marginTop: 18,
    minHeight: 320,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#161619',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: 980,
    backgroundColor: '#232327',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 15, fontWeight: '600', color: '#F5F5F7', textAlign: 'center' },
});
