import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import {
  MarkdownTextInput,
  type MarkdownStyle,
  parseExpensiMark,
} from '@expensify/react-native-live-markdown';

import { useTheme } from '@/hooks/use-theme';

/**
 * Falls back to whatever `fallback` renders if a child throws while rendering.
 * The live-markdown editor is a native component with a parser; this guarantees
 * a parser/render failure degrades to a plain text box instead of crashing the
 * whole note screen.
 */
class MarkdownBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Note body input that formats Markdown live as you type (bold / italic /
 * strikethrough / headings), with a plain-TextInput fallback for safety.
 * Accepts all the usual TextInput props (value, onChangeText, selection, …).
 */
export function LiveMarkdownInput(props: TextInputProps) {
  const theme = useTheme();

  const markdownStyle: MarkdownStyle = {
    syntax: { color: theme.textSecondary },
    h1: { fontSize: 24 },
    link: { color: '#3c87f7' },
    code: { color: theme.text, backgroundColor: theme.backgroundElement },
    blockquote: {
      borderColor: theme.backgroundSelected,
      borderWidth: 4,
      marginLeft: 6,
      paddingLeft: 8,
    },
  };

  return (
    <MarkdownBoundary fallback={<TextInput {...props} />}>
      <MarkdownTextInput parser={parseExpensiMark} markdownStyle={markdownStyle} {...props} />
    </MarkdownBoundary>
  );
}
