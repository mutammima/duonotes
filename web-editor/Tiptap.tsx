import { EditorContent } from '@tiptap/react';
import React from 'react';

import { TenTapStartKit, useTenTap } from '@10play/tentap-editor/web';

/**
 * DuoNotes' own editor bundle (shipped to the WebView via `customSource`).
 *
 * Phase 1 deliberately mirrors tentap's stock editor exactly, so swapping to a
 * custom bundle is a no-op for users. Custom nodes (drawing) and plugins
 * (partner cursors) get added here on top of this known-good baseline.
 *
 * NOTE: the native side filters bridges via `window.whiteListBridgeExtensions`;
 * any extension listed here must ALSO be passed to `useEditorBridge({
 * bridgeExtensions })` on the native side or `useTenTap` drops it.
 */
const extensions = TenTapStartKit.filter(
  (e) => !window.whiteListBridgeExtensions || window.whiteListBridgeExtensions.includes(e.name),
);

export default function Tiptap() {
  const editor = useTenTap({ bridges: extensions });

  return (
    <EditorContent editor={editor} className={window.dynamicHeight ? 'dynamic-height' : undefined} />
  );
}
