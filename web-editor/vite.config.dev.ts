/**
 * TEMPORARY debug config — builds the same bundle against React's *development*
 * build so errors are readable instead of "Minified React error #NNN".
 * Not used by `npm run build:editor`.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: __dirname,
  plugins: [react(), viteSingleFile()],
  define: { 'process.env.NODE_ENV': '"development"' },
  resolve: {
    dedupe: ['react', 'react-dom', '@tiptap/core', '@tiptap/react', '@tiptap/pm'],
    conditions: ['development', 'browser', 'module', 'import', 'default'],
  },
  build: {
    outDir: 'dist-dev',
    emptyOutDir: true,
    minify: false,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: { input: `${__dirname}/index.dev.html` },
  },
});
