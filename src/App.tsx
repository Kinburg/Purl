import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from './store/projectStore';
import { useEditorStore } from './store/editorStore';
import { useEditorPrefsStore } from './store/editorPrefsStore';
import { usePluginStore } from './store/pluginStore';
import { Header } from './components/layout/Header';
import { WorkspaceLayout } from './components/layout/WorkspaceLayout';

import { ProjectSettingsModal } from './components/project/ProjectSettingsModal';
import { EditorPrefsModal } from './components/editor/EditorPrefsModal';
import { AISettingsModal } from './components/editor/LLMSettingsModal';
import { PluginEditorModal } from './components/plugins/PluginEditorModal';
import { useAutosave } from './hooks/useAutosave';
import { Toaster } from 'sonner';
import { useT } from './i18n';
import { fsApi, joinPath, safeName } from './lib/fsApi';
import { injectPreviewCSS } from './utils/previewCss';
import { useDebouncedValue } from './utils/useDebouncedValue';

export default function App() {
  // Use narrow selectors instead of destructuring the whole store — the previous
  // `const { ... } = useProjectStore()` subscribed to every project change,
  // which forced the whole shell (Header + WorkspaceLayout) to re-render on
  // every keystroke. Action references are stable, project is split per-field.
  const fixVariableNames = useProjectStore(s => s.fixVariableNames);
  const undo             = useProjectStore(s => s.undo);
  const redo             = useProjectStore(s => s.redo);
  const projectDir       = useProjectStore(s => s.projectDir);
  const project          = useProjectStore(s => s.project);
  const setProjectDir    = useProjectStore(s => s.setProjectDir);

  const projectSettingsOpen    = useEditorStore(s => s.projectSettingsOpen);
  const setProjectSettingsOpen = useEditorStore(s => s.setProjectSettingsOpen);
  const editorPrefsOpen        = useEditorStore(s => s.editorPrefsOpen);
  const setEditorPrefsOpen     = useEditorStore(s => s.setEditorPrefsOpen);
  const llmSettingsOpen        = useEditorStore(s => s.llmSettingsOpen);
  const setLLMSettingsOpen     = useEditorStore(s => s.setLLMSettingsOpen);

  const compactMode = useEditorPrefsStore(s => s.compactMode);
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

  // Listen for close-requested from Electron
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onCloseRequested) return;
    api.onCloseRequested(() => setCloseModalOpen(true));
  }, []);

  async function handleSaveAndExit() {
    setSavingOnExit(true);
    try {
      let dir = projectDir;
      if (!dir) {
        dir = await fsApi.openFolderDialog();
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

  // Global keyboard shortcuts: Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === 'z' &&  e.shiftKey) { e.preventDefault(); redo(); }
      if (e.key === 'y' && !e.shiftKey) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <div className={`flex flex-col h-screen overflow-hidden${compactMode ? ' compact' : ''}`}>
      <Header />
      <WorkspaceLayout />
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
      <PluginEditorModal />

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
