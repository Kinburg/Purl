import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';
import pkg from './package.json' with { type: 'json' };

// https://vite.dev/config/
export default defineConfig(() => ({
  define: {
    // Expose just the version string at build time instead of importing the
    // full package.json into the renderer bundle (pulled in deps, build config,
    // etc. — ~5-10 KB of dead bytes).
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // The committed sample project (resources/sample-project) is used for manual
    // dev testing. Its generated output (release/, history/, …) lives inside vite's
    // root, so exporting a story would write into the watched tree and trigger a
    // full page reload — which wipes in-progress UI (e.g. the "open export folder?"
    // prompt and toasts). Real projects live OUTSIDE the repo and never hit this.
    watch: { ignored: ['**/resources/sample-project/**'] },
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
  // NOTE: the previous `esbuild: { drop: ['console','debugger'] }` prod console-strip
  // was removed in the vite 8 migration — vite 8 bundles with rolldown (oxc), not
  // esbuild, so the `esbuild.drop` option no longer applies. It can be re-added via
  // rolldown's minify (`dropConsole` / `dropDebugger`) if desired; it's only a minor
  // bundle optimization (packaged Electron has no end-user DevTools anyway).
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
        // Function form (rolldown / vite 8 dropped the `{ name: [pkgs] }` object form).
        manualChunks: (id) => {
          if (id.includes('@xyflow/react') || id.includes('@dagrejs/dagre')) return 'graph';
          if (id.includes('@dnd-kit/')) return 'dnd';
          if (id.includes('@google/genai')) return 'llm';
          if (id.includes('react-resizable-panels')) return 'panels';
          if (id.includes('sonner')) return 'toast';
        },
      },
    },
    chunkSizeWarningLimit: 1300,
  },
}));
