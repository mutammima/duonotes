import React from 'react';
import { createRoot } from 'react-dom/client';

import Tiptap from './Tiptap';

declare global {
  interface Window {
    contentInjected: boolean | undefined;
  }
}

/**
 * There is no console in this WebView, so an uncaught error here would show up
 * as a silently blank note — the worst possible failure. Surface it as text
 * instead so it is diagnosable from a screenshot alone.
 */
function showFatal(message: string) {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML =
    '<pre style="font:12px -apple-system,monospace;white-space:pre-wrap;padding:12px;color:#E5484D">' +
    'The editor failed to load.\n\n' +
    message +
    '</pre>';
}

const editorMounted = () => !!document.querySelector('.ProseMirror');

/**
 * React 19's concurrent renderer, combined with tiptap creating its
 * ProseMirror EditorView synchronously (and our drawing NodeView building its
 * SVG synchronously), throws once during the concurrent pass and then RECOVERS
 * by re-rendering the whole root synchronously — surfacing as a window 'error'
 * whose message is "There was an error during concurrent rendering but React
 * was able to recover…". That is benign: the editor mounts fine afterwards.
 *
 * So a window 'error' is only genuinely fatal if the editor never actually
 * mounts. Don't paint the fatal screen the instant an error fires (that error
 * arrives mid-recovery, before `.ProseMirror` exists, and would clobber a
 * perfectly working editor a beat later). Instead defer the verdict until the
 * synchronous recovery has had a chance to produce `.ProseMirror`, and only
 * then decide. A real bootstrap crash never mounts, so it still reports.
 */
let lastError: string | null = null;
window.addEventListener('error', (ev) => {
  lastError = String((ev as ErrorEvent).error?.stack ?? (ev as ErrorEvent).message);
  setTimeout(() => {
    if (lastError && !editorMounted()) showFatal(lastError);
  }, 600);
});

/**
 * react-native-webview can inject window content AFTER load (an Android race,
 * see react-native-webview#2960), so mounting immediately can yield an editor
 * with no content. Mirror tentap's own entry and wait for the native side to
 * signal `contentInjected` first.
 */
let ticks = 0;
const interval = setInterval(() => {
  if (!window.contentInjected) {
    // Don't spin silently forever if the native side never injects.
    if (++ticks > 3000) {
      clearInterval(interval);
      showFatal('Timed out waiting for content injection from the app.');
    }
    return;
  }
  clearInterval(interval);
  try {
    createRoot(document.getElementById('root')!).render(<Tiptap />);
  } catch (e) {
    showFatal(String((e as Error)?.stack ?? e));
  }
}, 1);
