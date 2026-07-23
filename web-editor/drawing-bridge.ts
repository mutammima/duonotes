import { BridgeExtension } from '@10play/tentap-editor/web';

import { Drawing, type DrawingAttrs } from './drawing-node';

export enum DrawingActionType {
  Insert = 'drawing-insert',
}

export type DrawingMessage = {
  type: DrawingActionType.Insert;
  payload: DrawingAttrs;
};

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
      editor.chain().focus().insertContent({ type: 'drawing', attrs: message.payload }).run();
    }
    return false;
  },
  extendEditorState: () => ({}),
});
