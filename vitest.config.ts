import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests are run with `npx vitest run`. There is deliberately no "test" script in
// package.json: scripts are an input to the update fingerprint (AGENTS.md).
export default defineConfig({
  resolve: { alias: { '@': path.resolve('src') } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
