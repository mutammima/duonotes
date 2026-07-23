import Gapcursor from '@tiptap/extension-gapcursor';
import React from 'react';
import { createRoot } from 'react-dom/client';

import { TenTapStartKit } from '@10play/tentap-editor/web';

import { DrawingBridge } from './drawing-bridge';
import Tiptap from './Tiptap';

/**
 * DEBUG entry — built by `npm run build:editor:dev` into `dist-dev/`, never
 * shipped. The real WebView has no console, so the only way to see a genuine
 * error is to load the SAME bundle in a desktop browser. This entry makes that
 * faithful:
 *
 *   1. It reconstructs the globals the native `useEditorBridge` injects (the
 *      per-bridge config map + whitelist), so bridge filtering behaves exactly
 *      as on-device — a fake/`__ALL__` map silently drops CoreBridge and
 *      produces misleading "Schema is missing its top node ('doc')" errors.
 *   2. It wraps the editor in an ErrorBoundary that renders the real error +
 *      component stack, instead of React's opaque "recovered by synchronously
 *      rendering" wrapper.
 *
 * Override the note body from the URL: `?content=<uri-encoded-html>`.
 */
class Boundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: any) {
    return { err: String(e?.stack ?? e) };
  }
  componentDidCatch(e: any, info: any) {
    this.setState({ err: String(e?.stack ?? e) + '\n\nCOMPONENT STACK:' + (info?.componentStack ?? '') });
  }
  render() {
    if (this.state.err) {
      return (
        <pre style={{ font: '12px monospace', whiteSpace: 'pre-wrap', padding: 12, color: '#E5484D' }}>
          {this.state.err}
        </pre>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

const SAMPLE =
  '<p>before</p>' +
  '<div data-drawing="" data-w="120" data-h="70" ' +
  "data-strokes='[{\"d\":\"5,5 40,60 110,15\",\"c\":\"#4a7bf7\",\"w\":4}]'></div>" +
  '<p>after</p>';

const allBridges = [...TenTapStartKit, DrawingBridge, { name: Gapcursor.name } as { name: string }];
const names = allBridges.map((b) => b.name);
const w = window as any;
w.whiteListBridgeExtensions = names;
w.bridgeExtensionConfigMap = JSON.stringify(
  Object.fromEntries(names.map((n) => [n, { optionsConfig: undefined, extendConfig: undefined }])),
);
w.editable = true;
w.platform = 'ios';
w.ReactNativeWebView = { postMessage: () => {} };
const params = new URLSearchParams(window.location.search);
w.initialContent = params.get('content') ? decodeURIComponent(params.get('content')!) : SAMPLE;
w.contentInjected = true;

createRoot(document.getElementById('root')!).render(
  <Boundary>
    <Tiptap />
  </Boundary>,
);
