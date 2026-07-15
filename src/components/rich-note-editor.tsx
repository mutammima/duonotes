import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  defaultEditorTheme,
  RichText,
  Toolbar,
  useEditorBridge,
  useEditorContent,
} from '@10play/tentap-editor';

import { DrawingCanvas } from '@/components/drawing-canvas';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * True WYSIWYG note body: a TipTap rich-text editor running in a WebView, so
 * text is styled (bold / italic / headings / lists) live as you type — no marks,
 * no preview toggle. Content is HTML, stored in the note's `body`.
 *
 * tentap's `theme` prop only styles the native WebView bezel + toolbar chrome —
 * it does NOT set in-document text/background color (confirmed: its own
 * `darkEditorCss` export is never auto-injected). We build and inject our own
 * stylesheet from the app's actual theme tokens so the editor content matches
 * the app (and stays readable in dark mode) instead of tentap's hardcoded
 * light-only defaults.
 */
export function RichNoteEditor({
  initialHtml,
  onChangeHtml,
}: {
  initialHtml: string;
  onChangeHtml: (html: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showDrawing, setShowDrawing] = useState(false);

  // Track keyboard height directly rather than relying on KeyboardAvoidingView,
  // whose automatic shift-up doesn't reliably reach an absolutely-positioned
  // child nested this deep — this keeps the toolbar's position deterministic.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates.height));
    const onHide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  // The toolbar CHROME (icons/background) is a separate theme from the
  // in-document CSS injected below — override it here so it matches the app
  // instead of tentap's hardcoded light-only defaults.
  const editorTheme = {
    ...defaultEditorTheme,
    webview: { backgroundColor: theme.background },
    toolbar: {
      ...defaultEditorTheme.toolbar,
      toolbarBody: {
        ...defaultEditorTheme.toolbar.toolbarBody,
        backgroundColor: theme.backgroundElement,
        borderTopColor: theme.backgroundSelected,
        borderBottomColor: theme.backgroundSelected,
      },
      toolbarButton: { ...defaultEditorTheme.toolbar.toolbarButton, backgroundColor: theme.backgroundElement },
      iconWrapper: { ...defaultEditorTheme.toolbar.iconWrapper, backgroundColor: theme.backgroundElement },
      iconWrapperActive: { ...defaultEditorTheme.toolbar.iconWrapperActive, backgroundColor: theme.accentSoft },
      icon: { ...defaultEditorTheme.toolbar.icon, tintColor: theme.text },
    },
  };

  const editor = useEditorBridge({
    autofocus: false,
    avoidIosKeyboard: true,
    initialContent: initialHtml || '',
    theme: editorTheme,
  });

  const content = useEditorContent(editor, { type: 'html', debounceInterval: 500 });
  useEffect(() => {
    if (content !== undefined) onChangeHtml(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // Re-inject whenever the theme changes (initial load, or a live Settings toggle).
  // `onLoad` on the underlying WebView is not a reliable "ready" signal here — it
  // can fire before the page's JS has actually finished setting up (or not fire
  // at all for a reused instance), silently dropping the injection. `injectCSS`
  // itself is a no-op if the WebView ref isn't ready yet, so it's safe to fire
  // repeatedly; retrying at staggered delays guarantees it lands.
  useEffect(() => {
    const css = `
      html, body, .ProseMirror {
        background-color: ${theme.background};
        color: ${theme.text};
        font-family: -apple-system, system-ui, sans-serif;
        font-size: 17px;
        line-height: 1.5;
      }
      .ProseMirror { padding: 4px 24px 40px; }
      .ProseMirror p.is-editor-empty:first-child::before {
        color: ${theme.textSecondary};
        content: attr(data-placeholder);
        float: left;
        pointer-events: none;
        height: 0;
      }
      a { color: ${theme.accent}; }
      blockquote {
        border-left: 3px solid ${theme.backgroundSelected};
        padding-left: 1rem;
        color: ${theme.textSecondary};
      }
      code, pre {
        background-color: ${theme.backgroundElement};
        border-radius: 4px;
      }
      hr { border-color: ${theme.backgroundSelected}; }
      ::selection { background-color: ${theme.accentSoft}; }
      ul[data-type="taskList"] {
        list-style: none;
        padding-left: 0;
      }
      ul[data-type="taskList"] li {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
      }
      ul[data-type="taskList"] li > label {
        flex-shrink: 0;
        margin-top: 0.2rem;
        user-select: none;
      }
      ul[data-type="taskList"] li > div {
        flex: 1;
      }
      ul[data-type="taskList"] li > div > p {
        margin: 0;
      }
      ul[data-type="taskList"] li[data-checked="true"] > div > p {
        text-decoration: line-through;
        color: ${theme.textSecondary};
      }
      ul[data-type="taskList"] input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: ${theme.accent};
      }
    `;
    const inject = () => editor.injectCSS(css, 'duonotes-theme');
    inject();
    const timers = [100, 400, 900, 1800].map((ms) => setTimeout(inject, ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.background, theme.text, theme.accent, theme.textSecondary, theme.backgroundElement, theme.backgroundSelected]);

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset?.base64) {
      editor.setImage(`data:image/jpeg;base64,${asset.base64}`);
    }
  }

  return (
    <View style={styles.flex}>
      <RichText editor={editor} />
      {!showDrawing && (
        <View style={[styles.toolbar, { bottom: keyboardHeight, paddingBottom: keyboardHeight === 0 ? insets.bottom : 0 }]}>
          <View style={[styles.attachRow, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <Pressable onPress={pickImage} hitSlop={8} style={styles.attachButton}>
              <Ionicons name="image-outline" size={20} color={theme.text} />
            </Pressable>
            <Pressable
              onPress={() => {
                // Dismiss the keyboard/editor focus first — the sketch overlay
                // takes over the same screen space, not a separate modal.
                editor.blur();
                setShowDrawing(true);
              }}
              hitSlop={8}
              style={styles.attachButton}>
              <Ionicons name="brush-outline" size={20} color={theme.text} />
            </Pressable>
          </View>
          <Toolbar editor={editor} hidden={false} />
        </View>
      )}
      <DrawingCanvas
        visible={showDrawing}
        onCancel={() => setShowDrawing(false)}
        onSave={(dataUri) => {
          editor.setImage(dataUri);
          setShowDrawing(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: { position: 'absolute', width: '100%', bottom: 0 },
  attachRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachButton: { padding: Spacing.one },
});
