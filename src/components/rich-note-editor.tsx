import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import {
  darkEditorTheme,
  defaultEditorTheme,
  RichText,
  Toolbar,
  useEditorBridge,
  useEditorContent,
} from '@10play/tentap-editor';

import { useThemeScheme } from '@/context/theme-context';

/**
 * True WYSIWYG note body: a TipTap rich-text editor running in a WebView, so
 * text is styled (bold / italic / headings / lists) live as you type — no marks,
 * no preview toggle. Content is HTML, stored in the note's `body`.
 */
export function RichNoteEditor({
  initialHtml,
  onChangeHtml,
}: {
  initialHtml: string;
  onChangeHtml: (html: string) => void;
}) {
  const scheme = useThemeScheme();

  const editor = useEditorBridge({
    autofocus: false,
    avoidIosKeyboard: true,
    initialContent: initialHtml || '',
    theme: scheme === 'dark' ? darkEditorTheme : defaultEditorTheme,
  });

  const content = useEditorContent(editor, { type: 'html', debounceInterval: 500 });
  useEffect(() => {
    if (content !== undefined) onChangeHtml(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return (
    <View style={styles.flex}>
      <RichText editor={editor} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.toolbar}>
        <Toolbar editor={editor} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { position: 'absolute', width: '100%', bottom: 0 },
});
