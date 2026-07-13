import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Read-only formatted view of a note's Markdown (the syntax used by the editor
 * toolbar): `*bold*`, `_italic_`, `~strike~`, `# heading`, `- bullet`, and
 * `- [ ] checkbox`. Checkboxes are tappable; `onToggleCheck(lineIndex)` reports
 * which source line was tapped.
 */
export function MarkdownView({
  value,
  onToggleCheck,
}: {
  value: string;
  onToggleCheck: (lineIndex: number) => void;
}) {
  const theme = useTheme();
  const lines = value.split('\n');

  return (
    <View style={styles.container}>
      {lines.map((line, i) => {
        const key = `l${i}`;

        const check = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (check) {
          const done = check[2].toLowerCase() === 'x';
          return (
            <Pressable key={key} style={styles.checkRow} onPress={() => onToggleCheck(i)} hitSlop={6}>
              <Ionicons
                name={done ? 'checkbox' : 'square-outline'}
                size={20}
                color={done ? theme.accent : theme.textSecondary}
                style={styles.checkIcon}
              />
              <Text style={[styles.body, { color: done ? theme.textSecondary : theme.text }, done && styles.strike]}>
                {renderInline(check[3], theme.text)}
              </Text>
            </Pressable>
          );
        }

        const h = line.match(/^(#{1,2})\s+(.*)$/);
        if (h) {
          return (
            <Text key={key} style={[h[1].length === 1 ? styles.h1 : styles.h2, { color: theme.text }]}>
              {renderInline(h[2], theme.text)}
            </Text>
          );
        }

        const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={key} style={styles.bulletRow}>
              <Text style={[styles.body, styles.bulletDot, { color: theme.text }]}>{'•'}</Text>
              <Text style={[styles.body, { color: theme.text }]}>{renderInline(bullet[2], theme.text)}</Text>
            </View>
          );
        }

        if (line.trim() === '') return <View key={key} style={styles.blank} />;

        return (
          <Text key={key} style={[styles.body, { color: theme.text }]}>
            {renderInline(line, theme.text)}
          </Text>
        );
      })}
    </View>
  );
}

/** Parse inline *bold* / _italic_ / ~strike~ into styled <Text> spans. */
function renderInline(text: string, color: string) {
  const nodes: React.ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    const token = m[0];
    const inner = token.slice(1, -1);
    const style =
      token[0] === '*'
        ? { fontWeight: '700' as const, color }
        : token[0] === '_'
          ? { fontStyle: 'italic' as const, color }
          : { textDecorationLine: 'line-through' as const, color };
    nodes.push(
      <Text key={key++} style={style}>
        {inner}
      </Text>,
    );
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return nodes;
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one, paddingBottom: Spacing.four },
  body: { fontSize: 17, lineHeight: 26 },
  h1: { fontSize: 24, fontWeight: '700', lineHeight: 32, marginTop: Spacing.two },
  h2: { fontSize: 20, fontWeight: '700', lineHeight: 28, marginTop: Spacing.one },
  bulletRow: { flexDirection: 'row', gap: Spacing.two, paddingLeft: Spacing.one },
  bulletDot: { lineHeight: 26 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingVertical: 2 },
  checkIcon: { marginTop: 3 },
  strike: { textDecorationLine: 'line-through' },
  blank: { height: Spacing.two },
});
