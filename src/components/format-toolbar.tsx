import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Edit, toggleLinePrefix, wrapSelection } from '@/lib/markdown';

/**
 * Formatting bar shown above the keyboard while editing a note. Each button
 * transforms the Markdown source at the current selection and reports the new
 * text + caret position via `onApply`.
 */
export function FormatToolbar({
  value,
  selection,
  onApply,
}: {
  value: string;
  selection: { start: number; end: number };
  onApply: (edit: Edit) => void;
}) {
  const theme = useTheme();

  const wrap = (marker: string) => () =>
    onApply(wrapSelection(value, selection.start, selection.end, marker));
  const line = (prefix: string) => () => onApply(toggleLinePrefix(value, selection.start, prefix));

  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundElement, borderTopColor: theme.backgroundSelected }]}>
      <Btn onPress={wrap('*')} label="B" bold color={theme.text} />
      <Btn onPress={wrap('_')} label="I" italic color={theme.text} />
      <Btn onPress={wrap('~')} label="S" strike color={theme.text} />
      <Divider color={theme.backgroundSelected} />
      <Btn onPress={line('# ')} label="H" color={theme.text} />
      <Btn onPress={line('- ')} icon="list" color={theme.text} />
    </View>
  );
}

function Btn({
  onPress,
  label,
  icon,
  bold,
  italic,
  strike,
  color,
}: {
  onPress: () => void;
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }]}>
      {icon ? (
        <Ionicons name={icon} size={20} color={color} />
      ) : (
        <Text
          style={[
            styles.label,
            { color },
            bold && { fontWeight: '800' },
            italic && { fontStyle: 'italic', fontWeight: '600' },
            strike && { textDecorationLine: 'line-through', fontWeight: '600' },
          ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btn: { minWidth: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: Spacing.one },
  label: { fontSize: 17 },
  divider: { width: StyleSheet.hairlineWidth, height: 22, marginHorizontal: Spacing.one },
});
