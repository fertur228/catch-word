/**
 * Тонкая обёртка над SF Symbols (`expo-symbols`) с цветом из темы по умолчанию.
 * SF Symbols — нативные иконки Apple, выглядят «как в системном iOS».
 */
import type { ColorValue } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { useTheme } from '@/hooks/use-theme';

export function Icon({ name, size = 22, color }: { name: SFSymbol; size?: number; color?: ColorValue }) {
  const theme = useTheme();
  return <SymbolView name={name} size={size} tintColor={color ?? theme.text} />;
}
