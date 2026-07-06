/**
 * Rise (native-фолбэк). Лендинг /welcome на нативе недоступен (гейт уводит на
 * /sign-in), поэтому здесь просто прокидываем контент без анимации появления.
 */
import { View, type ViewStyle } from 'react-native';

export function Rise({
  children,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={style}>{children}</View>;
}
