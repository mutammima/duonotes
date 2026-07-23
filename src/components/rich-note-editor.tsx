import { Ionicons } from '@expo/vector-icons';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CoreEditorActionType,
  defaultEditorTheme,
  RichText,
  TenTapStartKit,
  Toolbar,
  useEditorBridge,
  useEditorContent,
} from '@10play/tentap-editor';

import { DrawingCanvas } from '@/components/drawing-canvas';
import { Spacing } from '@/constants/theme';
import { DrawingBridge } from '@/lib/drawing-bridge';
import { editorHtml } from '@/lib/editor-html';
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
  children,
}: {
  initialHtml: string;
  onChangeHtml: (html: string) => void;
  /** Rendered above the note body, INSIDE the same scrollable region — so it
   *  scrolls away with the body instead of staying pinned (e.g. the note's
   *  Title input + shared banner, owned by the screen that renders us). */
  children?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showDrawing, setShowDrawing] = useState(false);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const [anchorOffset, setAnchorOffset] = useState({ x: 0, y: 0 });
  const scrollRef = useRef<ScrollView>(null);
  const rootRef = useRef<View>(null);
  const richTextWrapperRef = useRef<View>(null);
  // Set while waiting for the keyboard to fully close before opening
  // DrawingCanvas — see `openDrawing` below.
  const pendingOpenRef = useRef(false);

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

  // A tap on the brush icon calls `editor.blur()` immediately (to dismiss the
  // keyboard), but the keyboard's own dismiss animation is asynchronous — if
  // we measured and opened DrawingCanvas right away, the measurement would be
  // taken against a screen that's mid-animation and about to resize. Wait for
  // `keyboardHeight` (the already-tracked, real signal for "the keyboard has
  // actually finished closing") to settle at 0 before measuring.
  useEffect(() => {
    if (pendingOpenRef.current && keyboardHeight === 0) {
      pendingOpenRef.current = false;
      measureAndShowDrawing();
    }
  }, [keyboardHeight]);

  function measureAndShowDrawing() {
    rootRef.current?.measureInWindow((rootX, rootY) => {
      richTextWrapperRef.current?.measureInWindow((rtX, rtY) => {
        setAnchorOffset({ x: rtX - rootX, y: rtY - rootY });
        setShowDrawing(true);
      });
    });
  }

  function openDrawing() {
    // Dismiss the keyboard/editor focus first — the sketch overlay takes
    // over the same screen space, not a separate modal.
    editor.blur();
    if (keyboardHeight === 0) {
      measureAndShowDrawing();
    } else {
      pendingOpenRef.current = true;
      Keyboard.dismiss();
    }
  }

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
    // Size the WebView to its real content height instead of flex-filling the
    // screen, so it has nothing left to scroll internally — the outer
    // ScrollView below becomes the ONE scroll container for Title+banner+body,
    // unifying them into a single continuous page (Apple Notes-style) instead
    // of the note body scrolling independently underneath a fixed header.
    dynamicHeight: true,
    initialContent: initialHtml || '',
    theme: editorTheme,
    // Our own editor bundle (web-editor/, built by `npm run build:editor`)
    // instead of tentap's prebuilt one. Phase 1 is byte-for-byte the same
    // extension set, so this is a no-op for users — it exists so we can add
    // custom nodes/plugins (drawing, partner cursors) that the prebuilt
    // bundle gives no way to inject.
    customSource: editorHtml,
    // MUST mirror the bundle's bridge list (web-editor/Tiptap.tsx). tentap
    // builds `whiteListBridgeExtensions` from these names and the web side
    // filters on it, so omitting DrawingBridge here makes the `drawing` node
    // unknown in the editor — it would be stripped on load and autosaved away.
    bridgeExtensions: [...TenTapStartKit, DrawingBridge],
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

  // `dynamicHeight` (above) removes the WebView's own internal scroll, which
  // is what tentap's `avoidIosKeyboard` normally relies on to keep the typing
  // caret visible above the keyboard — with nothing scrollable left inside
  // the document, that mechanism goes inert. This covers the common case
  // (typing at the end of the note): whenever the editor's real content
  // height changes while the keyboard is up, follow it to the bottom of the
  // now-taller ScrollView. Precise mid-document caret-following would need a
  // dedicated caret-position bridge — not built yet; see if this heuristic
  // proves sufficient on a real device first.
  const handleRichTextMessage = (event: WebViewMessageEvent) => {
    if (typeof event.nativeEvent.data !== 'string') return;
    let message: { type?: string } = {};
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === CoreEditorActionType.DocumentHeight && keyboardHeight > 0 && !showDrawing) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  };

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    // Deliberately DON'T pass base64 here: base64-encoding a full-resolution
    // (12MP+) photo runs synchronously while the picker is still up, which
    // freezes it on older phones so Cancel/X appears dead. `quality` still
    // compresses the file the picker writes; we then read that file's base64
    // after the picker has dismissed, off its critical path.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    const base64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
    if (base64) editor.setImage(`data:image/jpeg;base64,${base64}`);
  }

  return (
    <View style={styles.flex} ref={rootRef}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: showDrawing ? 0 : keyboardHeight + toolbarHeight }}
        // Apple Notes locks the page while its markup tool is active; this
        // also keeps the scroll offset stable for the duration of a sketch,
        // which matters once a drawing's screen position needs to map back
        // to a document position (see DrawingCanvas/onExit).
        scrollEnabled={!showDrawing}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={false}>
        {children}
        <View ref={richTextWrapperRef}>
          <RichText
            editor={editor}
            onMessage={handleRichTextMessage}
            // RichText's own onMessage handling (which reads the
            // 'document-height' message to size the WebView for dynamicHeight)
            // is SKIPPED whenever a custom onMessage is passed, unless this is
            // explicitly set to false — easy to miss, and silently breaks
            // dynamicHeight (the WebView would never resize) if forgotten.
            exclusivelyUseCustomOnMessage={false}
          />
        </View>
      </ScrollView>
      {!showDrawing && (
        <View
          onLayout={(e) => setToolbarHeight(e.nativeEvent.layout.height)}
          style={[styles.toolbar, { bottom: keyboardHeight, paddingBottom: keyboardHeight === 0 ? insets.bottom : 0 }]}>
          <View style={[styles.attachRow, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <Pressable onPress={pickImage} hitSlop={8} style={styles.attachButton}>
              <Ionicons name="image-outline" size={20} color={theme.text} />
            </Pressable>
            <Pressable onPress={openDrawing} hitSlop={8} style={styles.attachButton}>
              <Ionicons name="brush-outline" size={20} color={theme.text} />
            </Pressable>
            {keyboardHeight > 0 && (
              <Pressable
                onPress={() => {
                  // Drop focus (and the keyboard) without leaving the note.
                  editor.blur();
                  Keyboard.dismiss();
                }}
                hitSlop={8}
                style={[styles.attachButton, styles.dismissKeyboard]}>
                <Ionicons name="chevron-down-circle-outline" size={22} color={theme.accent} />
              </Pressable>
            )}
          </View>
          <Toolbar editor={editor} hidden={false} />
        </View>
      )}
      {showDrawing && (
        <DrawingCanvas
          anchorOffset={anchorOffset}
          onExit={(drawing) => {
            if (drawing) editor.setDrawing(drawing);
            setShowDrawing(false);
          }}
        />
      )}
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
  dismissKeyboard: { marginLeft: 'auto' },
});
