import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Builds the WebView editor into ONE self-contained HTML file (JS + CSS
 * inlined), which `scripts/build-editor.sh` then converts into a TS module so
 * Metro can import it as a string for tentap's `customSource`.
 */
export default defineConfig({
  root: __dirname,
  plugins: [react(), viteSingleFile()],
  resolve: {
    // @10play/tentap-editor ships a NESTED react-dom@18, while the app is on
    // React 19. Without deduping, the bundle ends up with react-dom 18 running
    // against React 19 and dies on `ReactCurrentBatchConfig` (a React 18
    // internal that no longer exists), leaving a blank editor. Force one copy.
    dedupe: ['react', 'react-dom', '@tiptap/core', '@tiptap/react', '@tiptap/pm'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Inline everything; no separate chunks the WebView could never fetch.
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
});
