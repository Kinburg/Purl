import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';
import pkg from './package.json' with { type: 'json' };

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    // Expose just the version string at build time instead of importing the
    // full package.json into the renderer bundle (pulled in deps, build config,
    // etc. — ~5-10 KB of dead bytes).
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      '/pollinations': {
        target: 'https://gen.pollinations.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pollinations/, ''),
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
      },
      renderer: {},
    }),
  ],
  esbuild: mode === 'production' ? {
    // Strip `console.*` and `debugger` from production builds only — dev/HMR
    // keeps all logging intact. `console.error` inside autosave etc. is
    // useless in packaged Electron anyway (no DevTools available to the end
    // user) and bloats the bundle.
    drop: ['console', 'debugger'],
  } : {},
  build: {
    // Single-chunk renderer was 1.8 MB pre-split. manualChunks separates heavy
    // libs that aren't always needed at first paint — graph (xyflow + dagre)
    // and LLM SDK are the big wins. See plans/performance_optimizations_followup.md
    //
    // react/react-dom intentionally stay in the main chunk: Vite groups them with
    // their downstream-bound users automatically, and a stand-alone vendor chunk
    // came out empty under React 19 + the `react()` plugin's runtime.
    rollupOptions: {
      output: {
        manualChunks: {
          'graph':  ['@xyflow/react', '@dagrejs/dagre'],
          'dnd':    ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'llm':    ['@google/genai'],
          'panels': ['react-resizable-panels'],
          'toast':  ['sonner'],
        },
      },
    },
    chunkSizeWarningLimit: 1300,
  },
}));
