import type { Editor } from '@tiptap/core';

import { BridgeExtension } from '@10play/tentap-editor/web';

import { Drawing, type DrawingAttrs } from './drawing-node';

export enum DrawingActionType {
  Insert = 'drawing-insert',
}

export type DrawingInsertPayload = DrawingAttrs & { anchor?: { x: number; y: number } };

export type DrawingMessage = {
  type: DrawingActionType.Insert;
  payload: DrawingInsertPayload;
};

/**
 * Resolve a WebView-viewport-relative point to the nearest BLOCK boundary,
 * so an atom node lands cleanly as its own block adjacent to the paragraph
 * the user was visually drawing near, instead of splitting text mid-word.
 * Walks up from the resolved position's own depth — a fixed depth (e.g.
 * always 1) breaks on anything nested more than one level, such as a
 * paragraph inside a task-list item, where it would insert after the whole
 * list rather than after that specific item.
 */
function blockEndNear(editor: Editor, x: number, y: number): number | null {
  const coords = editor.view.posAtCoords({ left: x, top: y });
  if (!coords) return null;
  try {
    const $pos = editor.state.doc.resolve(coords.pos);
    return $pos.after($pos.depth);
  } catch {
    return null;
  }
}

/**
 * Web half of the drawing bridge. The NATIVE half (src/lib/drawing-bridge.ts)
 * must be registered too and share this exact name — tentap filters extensions
 * by `window.whiteListBridgeExtensions`, so a mismatch means TipTap doesn't
 * know the `drawing` node, silently strips it on load, and autosave then
 * persists the stripped body. That would be permanent data loss.
 */
export const DrawingBridge = new BridgeExtension<{}, {}, DrawingMessage>({
  tiptapExtension: Drawing,
  onBridgeMessage: (editor, message) => {
    if (message.type === DrawingActionType.Insert) {
      const { anchor, ...drawingAttrs } = message.payload;
      const pos = anchor ? blockEndNear(editor, anchor.x, anchor.y) : null;
      // Fall back to end-of-document, NEVER to the old `insertContent` at the
      // current selection — that's today's exact bug (a drawing landing
      // wherever the text cursor happens to be, unrelated to where it was
      // drawn), and it's most likely to matter on precisely the edge cases
      // (no anchor, posAtCoords returning null) that reach this fallback.
      const insertAt = pos ?? editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(insertAt, { type: 'drawing', attrs: drawingAttrs }).run();
    }
    return false;
  },
  extendEditorState: () => ({}),
});
