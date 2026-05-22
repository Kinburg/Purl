import { useEffect, useState } from 'react';
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

export default function App() {
  const { fixVariableNames, undo, redo, projectDir, project, setProjectDir } = useProjectStore();
  const {
    projectSettingsOpen, setProjectSettingsOpen,
    editorPrefsOpen, setEditorPrefsOpen,
    llmSettingsOpen, setLLMSettingsOpen,
  } = useEditorStore();
  const { compactMode, saveOnExit } = useEditorPrefsStore();
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
  useEffect(() => {
    injectPreviewCSS(project);
  }, [project.characters, project.scenes, project.settings]);

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
