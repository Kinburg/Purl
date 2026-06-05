import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useProjectStore } from './store/projectStore';
import { useEditorStore } from './store/editorStore';
import { useEditorPrefsStore } from './store/editorPrefsStore';
import { usePluginStore } from './store/pluginStore';
import { Header } from './components/layout/Header';
import { WorkspaceLayout } from './components/layout/WorkspaceLayout';

// Modals are lazy-loaded: they each pull in their own dependencies (icon
// generators, prefs UI, plugin builder…) that are useless until the user
// opens them. Each becomes its own chunk fetched on first open.
const ProjectSettingsModal = lazy(() => import('./components/project/ProjectSettingsModal').then(m => ({ default: m.ProjectSettingsModal })));
const EditorPrefsModal     = lazy(() => import('./components/editor/EditorPrefsModal').then(m => ({ default: m.EditorPrefsModal })));
const AISettingsModal      = lazy(() => import('./components/editor/LLMSettingsModal').then(m => ({ default: m.AISettingsModal })));
const PluginEditorModal    = lazy(() => import('./components/plugins/PluginEditorModal').then(m => ({ default: m.PluginEditorModal })));
const ReplaceModal         = lazy(() => import('./components/editor/ReplaceModal').then(m => ({ default: m.ReplaceModal })));

import { useAutosave } from './hooks/useAutosave';
import { Toaster, toast } from 'sonner';
import { useT } from './i18n';
import { fsApi, joinPath, safeName } from './lib/fsApi';
import { pickNewProjectDir } from './lib/projectDir';
import { FolderConflictModal } from './components/shared/FolderConflictModal';
import { injectPreviewCSS } from './utils/previewCss';
import { useDebouncedValue } from './utils/useDebouncedValue';

export default function App() {
  // Use narrow selectors instead of destructuring the whole store — the previous
  // `const { ... } = useProjectStore()` subscribed to every project change,
  // which forced the whole shell (Header + WorkspaceLayout) to re-render on
  // every keystroke. Action references are stable, project is split per-field.
  const fixVariableNames = useProjectStore(s => s.fixVariableNames);
  const projectDir       = useProjectStore(s => s.projectDir);
  const project          = useProjectStore(s => s.project);
  const setProjectDir    = useProjectStore(s => s.setProjectDir);

  const projectSettingsOpen    = useEditorStore(s => s.projectSettingsOpen);
  const setProjectSettingsOpen = useEditorStore(s => s.setProjectSettingsOpen);
  const editorPrefsOpen        = useEditorStore(s => s.editorPrefsOpen);
  const setEditorPrefsOpen     = useEditorStore(s => s.setEditorPrefsOpen);
  const llmSettingsOpen        = useEditorStore(s => s.llmSettingsOpen);
  const setLLMSettingsOpen     = useEditorStore(s => s.setLLMSettingsOpen);
  const replaceOpen            = useEditorStore(s => s.replaceOpen);
  // PluginEditorModal manages its own visibility via this target — render it
  // only while target is set so the chunk loads on-demand AND the React tree
  // unmounts when the editor closes (frees its draft state).
  const pluginEditorTarget     = useEditorStore(s => s.pluginEditorTarget);

  const compactMode = useEditorPrefsStore(s => s.compactMode);
  const knitTheme   = useEditorPrefsStore(s => s.knitTheme);
  const saveOnExit  = useEditorPrefsStore(s => s.saveOnExit);

  const t = useT();
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [savingOnExit, setSavingOnExit]     = useState(false);
  useAutosave();

  // Migrate any legacy Cyrillic variable names to ASCII on every mount.
  // This covers HMR reloads where onRehydrateStorage doesn't re-run.
  useEffect(() => { fixVariableNames(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load plugins from disk whenever projectDir changes.
  useEffect(() => {
    usePluginStore.getState().loadFromDisk(projectDir);
  }, [projectDir]);

  // Inject story preview CSS into the editor whenever the relevant project state
  // changes. Covers characters (dialogue cascade), scenes (per-block Std + spot
  // styles), and settings (project-wide Common defaults / bound overrides).
  //
  // Debounced: the styleCascade pipeline walks every scene + every block and is
  // expensive on big projects. Rebuilding on every keystroke (scenes ref changes
  // when typing into a TextBlock) was visibly laggy. 300ms feels live but cuts
  // recomputes by ~10×.
  const cssSnapshot = useMemo(
    () => ({ characters: project.characters, scenes: project.scenes, settings: project.settings }),
    [project.characters, project.scenes, project.settings],
  );
  const debouncedCssSnapshot = useDebouncedValue(cssSnapshot, 300);
  useEffect(() => {
    injectPreviewCSS({ ...project, ...debouncedCssSnapshot });
    // project intentionally not in deps — we only react to the debounced parts;
    // the full project object is only used to merge non-style fields for the call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedCssSnapshot]);

  // Show project settings modal on first launch (no folder selected = brand new session)
  useEffect(() => {
    if (!projectDir) {
      setProjectSettingsOpen(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for close-requested from Electron. preload returns an unsubscribe
  // function — wire it into the effect cleanup so HMR re-runs don't pile up
  // duplicate listeners (also makes this match standard React effect hygiene).
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onCloseRequested) return;
    const unsubscribe = api.onCloseRequested(() => setCloseModalOpen(true));
    return unsubscribe;
  }, []);

  async function handleSaveAndExit() {
    setSavingOnExit(true);
    try {
      let dir = projectDir;
      if (!dir) {
        dir = await pickNewProjectDir(project.title);
        if (!dir) { setSavingOnExit(false); return; }
        setProjectDir(dir);
      }
      await fsApi.mkdir(joinPath(dir, 'release', 'assets'));
      await fsApi.writeFile(joinPath(dir, `${safeName(project.title)}.purl`), JSON.stringify(project, null, 2));
    } catch { /* proceed with exit even if save fails */ }
    window.electronAPI?.confirmClose();
  }

  function handleExitWithoutSaving() {
    setCloseModalOpen(false);
    window.electronAPI?.confirmClose();
  }

  function handleCancelClose() {
    setCloseModalOpen(false);
    window.electronAPI?.cancelClose();
  }

  // When saveOnExit is on: auto-save then just confirm directly
  async function handleCloseWithSaveOnExit() {
    await handleSaveAndExit();
  }

  // Global keyboard shortcuts (see Editor Preferences → Shortcuts). Store access goes
  // through getState() so the listener never needs re-subscribing on project changes.
  useEffect(() => {
    const saveProject = async () => {
      const { project: p, projectDir: savedDir, setProjectDir: setDir } = useProjectStore.getState();
      try {
        let dir = savedDir;
        if (!dir) {
          dir = await pickNewProjectDir(p.title);
          if (!dir) return;
          setDir(dir);
        }
        await fsApi.mkdir(joinPath(dir, 'release', 'assets'));
        await fsApi.writeFile(joinPath(dir, `${safeName(p.title)}.purl`), JSON.stringify(p, null, 2));
        toast.success(t.header.successSave);
      } catch (err) {
        toast.error(t.header.errorSave(String(err)));
      }
    };

    // Ctrl+F → focus the scene-list search (the app's "find"). Switch to the
    // Scenes tab first, then poll briefly for the (possibly lazy-mounted) input.
    const focusSceneSearch = () => {
      useProjectStore.getState().setSidebarTab('scenes');
      let tries = 0;
      const tryFocus = () => {
        const el = document.getElementById('purl-scene-search') as HTMLInputElement | null;
        if (el) { el.focus(); el.select(); return; }
        if (tries++ < 20) setTimeout(tryFocus, 25);
      };
      setTimeout(tryFocus, 0);
    };

    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle to the next / previous scene.
      if (e.key === 'Tab') {
        e.preventDefault();
        const ps = useProjectStore.getState();
        const list = ps.project.scenes;
        if (!list.length) return;
        const idx = list.findIndex(sc => sc.id === ps.activeSceneId);
        const next = e.shiftKey
          ? (idx <= 0 ? list.length - 1 : idx - 1)
          : (idx === list.length - 1 ? 0 : idx + 1);
        ps.setActiveScene(list[next].id);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          if (e.shiftKey) useProjectStore.getState().redo();
          else useProjectStore.getState().undo();
          break;
        case 'y':
          e.preventDefault();
          useProjectStore.getState().redo();
          break;
        case 's':
          e.preventDefault();
          void saveProject();
          break;
        case ',':
          e.preventDefault();
          useEditorStore.getState().setEditorPrefsOpen(true);
          break;
        case 'p':
          if (e.shiftKey) { e.preventDefault(); useEditorStore.getState().setProjectSettingsOpen(true); }
          break;
        case 'f':
          if (!e.shiftKey) { e.preventDefault(); focusSceneSearch(); }
          break;
        case 'r':
          if (!e.shiftKey) { e.preventDefault(); useEditorStore.getState().setReplaceOpen(true); }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [t]);

  return (
    <div className={`app-shell flex flex-col h-screen overflow-hidden${compactMode ? ' compact' : ''}${knitTheme ? ' knit' : ''}`}>
      <Header />
      <WorkspaceLayout />
      <Suspense fallback={null}>
        {projectSettingsOpen && (
          <ProjectSettingsModal
            mode={projectDir ? 'edit' : 'create'}
            onClose={() => setProjectSettingsOpen(false)}
          />
        )}
        {editorPrefsOpen && (
          <EditorPrefsModal onClose={() => setEditorPrefsOpen(false)} />
        )}
        {llmSettingsOpen && (
          <AISettingsModal onClose={() => setLLMSettingsOpen(false)} />
        )}
        {pluginEditorTarget !== null && <PluginEditorModal />}
        {replaceOpen && <ReplaceModal />}
      </Suspense>

      {/* Close confirmation modal */}
      {closeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-[380px] p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-white">{t.header.closeConfirmTitle}</h2>
            <p className="text-xs text-slate-400">
              {saveOnExit ? t.header.closeConfirmSaveMessage : t.header.closeConfirmMessage}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors cursor-pointer"
                onClick={handleCancelClose}
              >
                {t.common.cancel}
              </button>
              {!saveOnExit && (
                <button
                  className="px-3 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors cursor-pointer"
                  onClick={handleExitWithoutSaving}
                >
                  {t.header.closeConfirmExit}
                </button>
              )}
              <button
                className="px-3 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                onClick={saveOnExit ? handleCloseWithSaveOnExit : handleSaveAndExit}
                disabled={savingOnExit}
              >
                {saveOnExit ? t.header.closeConfirmExit : t.header.closeConfirmSaveAndExit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project-folder collision prompt (driven by useFolderConflictStore). */}
      <FolderConflictModal />

      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#e2e8f0',
          },
        }}
      />
    </div>
  );
}
