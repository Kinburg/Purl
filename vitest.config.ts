import { defineConfig } from 'vitest/config';

// Pure-function unit tests (no DOM needed) for the export/validation/stats utils.
// Tests live under src/test/ and are excluded from the production tsc build
// (see tsconfig.app.json) — Vitest transpiles them with esbuild.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
});
