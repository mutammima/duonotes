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

window.addEventListener('error', (ev) =>
  showFatal(String((ev as ErrorEvent).error?.stack ?? (ev as ErrorEvent).message)),
);

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
