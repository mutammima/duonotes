import { BridgeExtension } from '@10play/tentap-editor';

/** Mirror of the web-side type (web-editor/drawing-node.ts). */
export type SerializedStroke = { d: string; c: string; w: number };
export type DrawingAttrs = { strokes: SerializedStroke[]; w: number; h: number };

export enum DrawingActionType {
  Insert = 'drawing-insert',
}

type DrawingMessage = {
  type: DrawingActionType.Insert;
  payload: DrawingAttrs;
};

type DrawingEditorInstance = {
  /** Insert a vector drawing at the cursor. */
  setDrawing: (drawing: DrawingAttrs) => void;
};

declare module '@10play/tentap-editor' {
  interface EditorBridge extends DrawingEditorInstance {}
}

/**
 * Native half of the drawing bridge. It carries no tiptapExtension (the schema
 * lives in the web bundle) but MUST share the web bridge's name — tentap builds
 * `window.whiteListBridgeExtensions` from these names, and a name the web side
 * doesn't match means the `drawing` node is unknown there, gets stripped on
 * load, and autosave persists the loss.
 */
export const DrawingBridge = new BridgeExtension<{}, DrawingEditorInstance, DrawingMessage>({
  forceName: 'drawing',
  extendEditorInstance: (sendBridgeMessage) => ({
    setDrawing: (drawing) =>
      sendBridgeMessage({ type: DrawingActionType.Insert, payload: drawing }),
  }),
  extendEditorState: () => ({}),
});
