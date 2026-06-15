import { useState, useEffect, memo } from 'react';
import { useProjectStore, isProjectFile } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { usePluginStore } from '../../store/pluginStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useT, useLocaleStore, getLocales } from '../../i18n';
import { useConfirm } from '../shared/ConfirmModal';
import { useDropdown } from '../shared/useDropdown';
import { generateStandaloneHtml } from '../../utils/exportToHtml';
import { exportToTwee } from '../../utils/exportToTwee';
import { importFromTweeSource, ImportError, type ImportResult } from '../../utils/importFromTwee';
import { importFromHtmlSource } from '../../utils/importFromHtml';
import { ImportSummaryModal } from '../import/ImportSummaryModal';
import { extractProjectStrings, applyTranslations, type TranslationMap } from '../../utils/i18nUtils';
import {
  hasSCTemplate, getSCTemplate, getSCVersion,
  parseSCFormatJs, storeSCTemplate, clearSCTemplate,
} from '../../utils/scRuntime';
import { fsApi, joinPath, safeName } from '../../lib/fsApi';
import { pickNewProjectDir } from '../../lib/projectDir';
import { toast } from 'sonner';
import { Icon } from './HeaderIcons';
import { LocaleSelect } from './LocaleSelect';

const PURL_EXT = 'purl';

function truncatePath(p: string, segments = 2): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  if (parts.length <= segments) return p;
  return '…/' + parts.slice(-segments).join('/');
}

function HeaderImpl() {
  // Selectors instead of destructuring — Header is 958 lines and re-renders on
  // every project change. Most fields are accessed only inside event handlers;
  // pulling them via selectors keeps Header subscribed to exactly what it reads.
  const project         = useProjectStore(s => s.project);
  const projectDir      = useProjectStore(s => s.projectDir);
  const setProjectTitle = useProjectStore(s => s.setProjectTitle);
  const setProjectDir   = useProjectStore(s => s.setProjectDir);
  const resetProject    = useProjectStore(s => s.resetProject);
  const loadProject     = useProjectStore(s => s.loadProject);
  const undo            = useProjectStore(s => s.undo);
  const redo            = useProjectStore(s => s.redo);
  const canUndo         = useProjectStore(s => s.canUndo);
  const canRedo         = useProjectStore(s => s.canRedo);

  const locale    = useLocaleStore(s => s.locale);
  const setLocale = useLocaleStore(s => s.setLocale);

  const setProjectSettingsOpen = useEditorStore(s => s.setProjectSettingsOpen);
  const setEditorPrefsOpen     = useEditorStore(s => s.setEditorPrefsOpen);
  const setLLMSettingsOpen     = useEditorStore(s => s.setLLMSettingsOpen);

  const confirmOpenFolderAfterExport = useEditorPrefsStore(s => s.confirmOpenFolderAfterExport);
  const panelLayout                  = useEditorPrefsStore(s => s.panelLayout);
  const togglePreviewPanel           = useEditorPrefsStore(s => s.togglePreviewPanel);
  const toggleGraphPanel             = useEditorPrefsStore(s => s.toggleGraphPanel);
  const togglePlayPanel              = useEditorPrefsStore(s => s.togglePlayPanel);

  const t = useT();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft]     = useState('');
  const [scReady, setScReady]           = useState(hasSCTemplate());
  const [scVersion, setScVersion]       = useState(getSCVersion());
  const [aboutOpen, setAboutOpen]       = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [isMaximized, setIsMaximized]   = useState(false);
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const { ask, modal: confirmModal }    = useConfirm();

  const exportDD = useDropdown<HTMLDivElement>();
  const fileDD   = useDropdown<HTMLDivElement>();
  const mainDD   = useDropdown<HTMLDivElement>();
  const scDD     = useDropdown<HTMLDivElement>();

  const isCustomTitleBar = typeof window !== 'undefined' && window.electronAPI?.titleBarStyle === 'custom';

  useEffect(() => {
    setScReady(hasSCTemplate());
    setScVersion(getSCVersion());
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.isWindowMaximized) return;
    api.isWindowMaximized().then(v => setIsMaximized(v));
    const unsubscribe = api.onWindowMaximized?.(v => setIsMaximized(v));
    return unsubscribe;
  }, []);

  // Handle Escape to close About modal
  useEffect(() => {
    if (!aboutOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAboutOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [aboutOpen]);

  // ─── Title ────────────────────────────────────────────────────────────────

  const handleTitleClick = () => {
    setTitleDraft(project.title);
    setEditingTitle(true);
  };

  const handleTitleBlur = () => {
    const newTitle = titleDraft.trim();
    if (!newTitle || newTitle === project.title) { setEditingTitle(false); return; }
    setProjectTitle(newTitle);
    setEditingTitle(false);
  };

  // ─── Save helpers ─────────────────────────────────────────────────────────

  async function doSaveToDir(dir: string): Promise<void> {
    await fsApi.mkdir(joinPath(dir, 'release', 'assets'));
    const content  = JSON.stringify(project, null, 2);
    const fileName = `${safeName(project.title)}.${PURL_EXT}`;
    await fsApi.writeFile(joinPath(dir, fileName), content);
  }

  async function ensureProjectDir(): Promise<string | null> {
    if (projectDir) {
      await fsApi.mkdir(joinPath(projectDir, 'release', 'assets'));
      return projectDir;
    }
    // No project dir yet: pick a parent folder + create a {parent}/{name} sub-folder.
    const dir = await pickNewProjectDir(project.title);
    if (!dir) return null;
    setProjectDir(dir);
    await fsApi.mkdir(joinPath(dir, 'release', 'assets'));
    return dir;
  }

  function unapprovedScenes(): string[] {
    return project.scenes
      .filter(scene => scene.blocks.some(b => (b.type === 'image-gen' || b.type === 'video-gen') && b.src.startsWith('history/')))
      .map(scene => scene.name);
  }

  // ─── Save / Open ──────────────────────────────────────────────────────────

  const handleSaveProject = async () => {
    fileDD.close();
    setBusy(true);
    try {
      let dir = projectDir;
      if (!dir) {
        dir = await pickNewProjectDir(project.title);
        if (!dir) return;
        setProjectDir(dir);
      }
      await doSaveToDir(dir);
      toast.success(t.header.successSave);
    } catch (e) {
      alert(t.header.errorSave(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProjectAs = async () => {
    fileDD.close();
    const dir = await pickNewProjectDir(project.title);
    if (!dir) return;
    setBusy(true);
    try {
      setProjectDir(dir);
      await doSaveToDir(dir);
      toast.success(t.header.successSave);
    } catch (e) {
      alert(t.header.errorSave(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenProject = async () => {
    fileDD.close();
    const filePath = await fsApi.openFileDialog({
      title: t.header.open,
      filters: [{ name: 'Purl Project', extensions: [PURL_EXT] }],
    });
    if (!filePath) return;
    try {
      const text   = await fsApi.readFile(filePath);
      const loaded = JSON.parse(text);
      // Reject a valid-JSON-but-not-a-Project file up front so we never replace the
      // open project with an empty one recovered from garbage.
      if (!isProjectFile(loaded)) throw new Error('Not a Purl project file');
      const dir = filePath.replace(/[/\\][^/\\]+$/, '');
      loadProject(loaded, dir);
    } catch {
      alert(t.header.errorInvalidProject);
    }
  };

  const handleNewProject = () => {
    fileDD.close();
    ask(
      { message: t.header.confirmNew },
      () => {
        resetProject();
        setProjectSettingsOpen(true);
      },
    );
  };

  const handleImportFromTwee = async () => {
    fileDD.close();
    const filePath = await fsApi.openFileDialog({
      title: t.header.dialogImportTwee,
      filters: [
        { name: 'Twee / Twine HTML', extensions: ['twee', 'tw', 'html', 'htm'] },
      ],
    });
    if (!filePath) return;
    setBusy(true);
    try {
      const text = await fsApi.readFile(filePath);
      const lower = filePath.toLowerCase();
      const result = (lower.endsWith('.html') || lower.endsWith('.htm'))
        ? importFromHtmlSource(text)
        : importFromTweeSource(text);
      setImportPreview(result);
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : String(e);
      alert(t.header.errorImport(msg));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = () => {
    if (!importPreview) return;
    loadProject(importPreview.project);
    setProjectDir(null);
    setImportPreview(null);
    toast.success(t.header.successImport);
  };

  const handleOpenProjectFolder = async () => {
    if (projectDir) await fsApi.openPath(projectDir);
  };

  // ─── Panel toggles ─────────────────────────────────────────────────────────

  const handleTogglePreview = () => togglePreviewPanel();
  const handleToggleGraph   = () => toggleGraphPanel();
  const handleTogglePlay    = () => togglePlayPanel();

  // ─── SC Runtime ───────────────────────────────────────────────────────────

  const handleLoadSCFormat = async () => {
    scDD.close();
    const filePath = await fsApi.openFileDialog({
      title: t.header.dialogSelectSC,
      filters: [{ name: 'JavaScript', extensions: ['js'] }],
    });
    if (!filePath) return;
    try {
      const text   = await fsApi.readFile(filePath);
      const result = parseSCFormatJs(text);
      if (!result) {
        alert(t.header.errorInvalidSC);
        return;
      }
      storeSCTemplate(result.source, result.version);
      setScReady(true);
      setScVersion(result.version);
      alert(t.header.scLoadedAlert(result.version));
    } catch (e) {
      alert(t.header.errorReadFile(String(e)));
    }
  };

  const handleClearSC = () => {
    scDD.close();
    ask(
      { message: t.header.confirmClearSC, variant: 'danger' },
      () => { clearSCTemplate(); setScReady(false); setScVersion(null); },
    );
  };

  // ─── Export ───────────────────────────────────────────────────────────────

  const handleExportHtml = async () => {
    const template = getSCTemplate();
    if (!template) return;
    exportDD.close();

    const doExport = async () => {
      setBusy(true);
      try {
        const dir = await ensureProjectDir();
        if (!dir) return;
        const releaseDir = joinPath(dir, 'release');

        const { html, css } = generateStandaloneHtml(
          project, template, usePluginStore.getState().plugins,
        );

        await fsApi.writeFile(joinPath(releaseDir, 'index.html'), html);
        await fsApi.writeFile(joinPath(releaseDir, 'story.css'), css);
        toast.success(t.header.successExportHtml);
        if (confirmOpenFolderAfterExport) {
          ask({ message: t.header.confirmHtmlSaved }, async () => { await fsApi.openPath(releaseDir); });
        }
      } catch (e) {
        alert(t.header.errorExportHtml(String(e)));
      } finally {
        setBusy(false);
      }
    };

    const badScenes = unapprovedScenes();
    if (badScenes.length > 0) {
      ask(
        { message: `${t.header.unapprovedImagesTitle}\n\n${t.header.unapprovedImagesMessage(badScenes)}` },
        doExport,
      );
      return;
    }

    await doExport();
  };

  const handleExportHtmlAs = async () => {
    const template = getSCTemplate();
    if (!template) return;
    exportDD.close();
    const defaultName = `${safeName(project.title)}.html`;
    const defaultPath = projectDir ? joinPath(projectDir, defaultName) : defaultName;
    const filePath = await fsApi.saveFileDialog({
      title: t.header.dialogSaveHtml,
      defaultPath,
      filters: [{ name: 'HTML File', extensions: ['html'] }],
    });
    if (!filePath) return;
    setBusy(true);
    try {
      const { html, css } = generateStandaloneHtml(project, template, usePluginStore.getState().plugins);
      const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
      const saveDir = lastSep >= 0 ? filePath.substring(0, lastSep) : '.';
      await fsApi.writeFile(filePath, html);
      await fsApi.writeFile(joinPath(saveDir, 'story.css'), css);
      toast.success(t.header.successExportHtml);
    } catch (e) {
      alert(t.header.errorExportHtml(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleExportTwee = async () => {
    exportDD.close();
    const defaultName = `${safeName(project.title)}.twee`;
    const defaultPath = projectDir ? joinPath(projectDir, defaultName) : defaultName;
    const filePath = await fsApi.saveFileDialog({
      title: t.header.dialogSaveTwee,
      defaultPath,
      filters: [{ name: 'Twee File', extensions: ['twee'] }],
    });
    if (!filePath) return;
    setBusy(true);
    try {
      const twee = exportToTwee(project, usePluginStore.getState().plugins);
      await fsApi.writeFile(filePath, twee);
      toast.success(t.header.successExportTwee);
    } catch (e) {
      alert(t.header.errorExportTwee(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleExportTranslations = async () => {
    fileDD.close();
    const strings = extractProjectStrings(project);
    const defaultName = `${safeName(project.title)}.lang.json`;
    const defaultPath = projectDir ? joinPath(projectDir, defaultName) : defaultName;

    const filePath = await fsApi.saveFileDialog({
      title: 'Export strings for translation',
      defaultPath,
      filters: [{ name: 'JSON Language File', extensions: ['json'] }],
    });

    if (!filePath) return;
    setBusy(true);
    try {
      await fsApi.writeFile(filePath, JSON.stringify(strings, null, 2));
      toast.success('Strings exported successfully');
    } catch (e) {
      alert('Export error: ' + String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleExportWithTranslation = async () => {
    exportDD.close();

    const filePath = await fsApi.openFileDialog({
      title: 'Select translation file (.json)',
      filters: [{ name: 'JSON Language File', extensions: ['json'] }],
    });
    if (!filePath) return;

    try {
      const content = await fsApi.readFile(filePath);
      const translationMap = JSON.parse(content) as TranslationMap;

      const translatedProject = applyTranslations(project, translationMap);

      const template = getSCTemplate();
      if (!template) {
        alert(t.header.scLoadTitle);
        return;
      }

      const langCode = filePath.split(/[/\\]/).pop()?.split('.')[0] || 'translated';
      const defaultName = `${safeName(project.title)}_${langCode}.html`;
      const defaultPath = projectDir ? joinPath(projectDir, defaultName) : defaultName;

      const savePath = await fsApi.saveFileDialog({
        title: 'Save translated HTML',
        defaultPath,
        filters: [{ name: 'HTML File', extensions: ['html'] }],
      });

      if (!savePath) return;
      setBusy(true);

      const { html, css } = generateStandaloneHtml(translatedProject, template, usePluginStore.getState().plugins);
      const lastSep = Math.max(savePath.lastIndexOf('/'), savePath.lastIndexOf('\\'));
      const saveDir = lastSep >= 0 ? savePath.substring(0, lastSep) : '.';
      await fsApi.writeFile(savePath, html);
      await fsApi.writeFile(joinPath(saveDir, 'story.css'), css);
      toast.success(`Exported ${langCode} version successfully!`);
    } catch (e) {
      alert('Error during translated export: ' + String(e));
    } finally {
      setBusy(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const locales = getLocales();
  const hasUnapproved = scReady && unapprovedScenes().length > 0;
  const exportTooltip = projectDir
    ? `${t.header.exportSaveInFolder} → ${projectDir}/release/index.html`
    : t.header.exportSaveInFolder;

  return (
    <header
      className={`flex items-stretch pl-3 gap-3 bg-slate-900 border-b border-slate-700 shrink-0${isCustomTitleBar ? ' drag-region' : ' pr-3'}`}
    >
      {/* Left: app icon + wordmark + title + folder */}
      <div className="flex items-center gap-2.5 shrink-0 py-2 no-drag">
        <div className="w-6 h-6 rounded-md overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
          <img src="/Icon.PNG" alt="Purl" className="w-full h-full object-contain" />
        </div>
        <span className="text-indigo-400 font-bold text-sm tracking-wider uppercase select-none">
          Purl
        </span>
        <span className="text-slate-700 select-none">|</span>

        {editingTitle ? (
          <input
            autoFocus
            className="bg-slate-800 text-white px-2 py-0.5 rounded text-sm border border-indigo-500 outline-none w-48"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={e => {
              if (e.key === 'Enter') handleTitleBlur();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
          />
        ) : (
          <button
            className="group flex items-center gap-1.5 text-white text-sm font-medium hover:text-indigo-300 transition-colors cursor-pointer"
            onClick={handleTitleClick}
            title={t.header.renameProjectTitle}
          >
            <span>{project.title}</span>
            <Icon.pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        )}

        {projectDir && (
          <button
            className="flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors text-xs cursor-pointer max-w-[18rem]"
            title={projectDir}
            onClick={handleOpenProjectFolder}
          >
            <Icon.folderOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-mono">{truncatePath(projectDir)}</span>
          </button>
        )}

        {/* Undo/Redo segmented control */}
        <div className="ml-2 flex items-center bg-slate-800/60 rounded border border-slate-700/80 overflow-hidden">
          <button
            className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-700/60 disabled:text-slate-700 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
            title={t.header.undoTitle}
            onClick={undo}
            disabled={!canUndo}
          >
            <Icon.undo className="w-4 h-4" />
          </button>
          <span className="w-px h-4 bg-slate-700/80" />
          <button
            className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-700/60 disabled:text-slate-700 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
            title={t.header.redoTitle}
            onClick={redo}
            disabled={!canRedo}
          >
            <Icon.redo className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0 py-2 no-drag">

        {/* Code preview panel toggle */}
        <button
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
            panelLayout.previewVisible
              ? 'bg-indigo-700 hover:bg-indigo-600 text-indigo-100'
              : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
          }`}
          onClick={handleTogglePreview}
          title={panelLayout.previewVisible ? t.header.previewCodeClose : t.header.previewCodeTitle}
        >
          <Icon.code className="w-3.5 h-3.5" />
          <span>{t.header.previewCode}</span>
        </button>

        {/* Scene graph panel toggle */}
        <button
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
            panelLayout.graphVisible
              ? 'bg-violet-700 hover:bg-violet-600 text-violet-100'
              : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
          }`}
          onClick={handleToggleGraph}
          title={panelLayout.graphVisible ? t.header.graphClose : t.header.graphTitle}
        >
          <Icon.network className="w-3.5 h-3.5" />
          <span>{t.header.graph}</span>
        </button>

        {/* Playable preview panel toggle */}
        <button
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
            panelLayout.playVisible
              ? 'bg-emerald-700 hover:bg-emerald-600 text-emerald-100'
              : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
          }`}
          onClick={handleTogglePlay}
          title={panelLayout.playVisible ? t.header.playClose : t.header.playTitle}
        >
          <Icon.play className="w-3.5 h-3.5" />
          <span>{t.header.play}</span>
        </button>

        <span className="text-slate-700 select-none hidden sm:inline px-1">|</span>

        {/* SugarCube runtime */}
        {scReady ? (
          <div className="relative">
            <button
              ref={scDD.triggerRef}
              onClick={scDD.toggle}
              className="flex items-center gap-1.5 text-xs text-emerald-400 px-2 py-1.5 rounded bg-emerald-900/25 border border-emerald-800/70 hover:bg-emerald-900/40 transition-colors cursor-pointer"
              title={t.header.scLoaded(scVersion ?? '')}
            >
              <Icon.check className="w-3 h-3" />
              <span className="font-mono">SC {scVersion}</span>
              <Icon.chevronDown className={`w-3 h-3 opacity-70 transition-transform ${scDD.open ? 'rotate-180' : ''}`} />
            </button>
            {scDD.open && (
              <div
                ref={scDD.panelRef}
                className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-xl z-50 min-w-48 overflow-hidden"
              >
                <button
                  className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700/70 transition-colors cursor-pointer flex items-center gap-2"
                  onClick={handleLoadSCFormat}
                >
                  <Icon.fileOpen className="w-4 h-4 text-slate-400" />
                  <span>{t.header.scLoadTitle}</span>
                </button>
                <div className="h-px bg-slate-700/60" />
                <button
                  className="w-full text-left px-3 py-2 text-sm text-rose-300 hover:bg-rose-900/30 transition-colors cursor-pointer flex items-center gap-2"
                  onClick={handleClearSC}
                >
                  <Icon.alert className="w-4 h-4" />
                  <span>Unload runtime</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <Btn variant="ghost" onClick={handleLoadSCFormat} title={t.header.scLoadTitle}>
            {t.header.scRuntime}
          </Btn>
        )}

        {/* HTML export — split button */}
        {scReady && (
          <div className="relative">
            <div className="flex">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-l text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 relative"
                onClick={handleExportHtml}
                title={exportTooltip}
                disabled={busy}
              >
                {busy ? <Icon.spinner className="w-3.5 h-3.5" /> : <Icon.save className="w-3.5 h-3.5" />}
                <span>{t.header.exportHtml}</span>
                {hasUnapproved && !busy && (
                  <span
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-900"
                    title={t.header.unapprovedImagesTitle}
                  />
                )}
              </button>
              <button
                ref={exportDD.triggerRef}
                className="px-2 py-1.5 rounded-r text-sm font-medium bg-indigo-700 hover:bg-indigo-600 text-white transition-colors cursor-pointer border-l border-indigo-500"
                onClick={exportDD.toggle}
                title={t.header.exportMoreOptions}
              >
                <Icon.chevronDown className={`w-3.5 h-3.5 transition-transform ${exportDD.open ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {exportDD.open && (
              <div
                ref={exportDD.panelRef}
                className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-xl z-50 min-w-64 overflow-hidden py-1"
              >
                <DDItem
                  icon={<Icon.fileOpen className="w-4 h-4" />}
                  label={t.header.exportSaveAs}
                  desc={t.header.exportSaveAsDesc}
                  onClick={handleExportHtmlAs}
                />
                <DDItem
                  icon={<Icon.languages className="w-4 h-4" />}
                  label="Export with translation…"
                  desc="Load .json and save translated HTML"
                  onClick={handleExportWithTranslation}
                />
                <DDItem
                  icon={<Icon.code className="w-4 h-4" />}
                  label={t.header.exportTwee}
                  desc={t.header.exportTweeTitle}
                  onClick={handleExportTwee}
                  disabled={busy}
                />
              </div>
            )}
          </div>
        )}

        <span className="text-slate-700 select-none hidden sm:inline px-1">|</span>

        {/* File menu */}
        <div className="relative">
          <button
            ref={fileDD.triggerRef}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              fileDD.open
                ? 'bg-slate-600 text-white'
                : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
            }`}
            onClick={fileDD.toggle}
            title={t.header.menuSectionFile}
          >
            <Icon.folder className="w-3.5 h-3.5" />
            <span>{t.header.menuSectionFile}</span>
            <Icon.chevronDown className={`w-3 h-3 opacity-70 transition-transform ${fileDD.open ? 'rotate-180' : ''}`} />
          </button>

          {fileDD.open && (
            <div
              ref={fileDD.panelRef}
              className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 min-w-72 overflow-hidden py-1.5"
            >
              <MenuItem
                icon={busy ? <Icon.spinner className="w-4 h-4" /> : <Icon.save className="w-4 h-4" />}
                label={busy ? t.header.saving : t.header.save}
                desc={projectDir ? t.header.saveTitle(projectDir) : t.header.saveNoDir}
                shortcut="Ctrl+S"
                onClick={handleSaveProject}
                disabled={busy}
              />
              <MenuItem
                icon={<Icon.folderOpen className="w-4 h-4" />}
                label={t.header.saveAsFolder}
                desc={t.header.saveAsFolderDesc}
                onClick={handleSaveProjectAs}
                disabled={busy}
              />
              {projectDir && (
                <MenuItem
                  icon={<Icon.folder className="w-4 h-4" />}
                  label={t.header.openFolder}
                  desc={projectDir}
                  onClick={() => { fileDD.close(); handleOpenProjectFolder(); }}
                />
              )}
              <div className="h-px bg-slate-700/50 mx-3 my-1" />
              <MenuItem
                icon={<Icon.fileOpen className="w-4 h-4" />}
                label={t.header.open}
                desc={t.header.openTitle}
                onClick={handleOpenProject}
                disabled={busy}
              />
              <MenuItem
                icon={<Icon.filePlus className="w-4 h-4" />}
                label={t.header.new}
                desc={t.header.newDesc}
                onClick={handleNewProject}
                disabled={busy}
              />
              <MenuItem
                icon={<Icon.code className="w-4 h-4" />}
                label={t.header.importFromTwee}
                desc={t.header.importFromTweeDesc}
                onClick={handleImportFromTwee}
                disabled={busy}
              />
              <div className="h-px bg-slate-700/80 mx-2 my-1" />
              <MenuSection label="Localization" />
              <MenuItem
                icon={<Icon.languages className="w-4 h-4" />}
                label="Export strings"
                desc="Export all project text to JSON"
                onClick={handleExportTranslations}
                disabled={busy}
              />
            </div>
          )}
        </div>

        {/* Hamburger menu: settings + about */}
        <div className="relative">
          <button
            ref={mainDD.triggerRef}
            className={`flex items-center justify-center w-9 h-[34px] rounded text-sm font-medium transition-colors cursor-pointer ${
              mainDD.open
                ? 'bg-slate-600 text-white'
                : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
            }`}
            onClick={mainDD.toggle}
            title={t.header.menuTitle}
          >
            <Icon.menu className="w-4 h-4" />
          </button>

          {mainDD.open && (
            <div
              ref={mainDD.panelRef}
              className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-50 min-w-64 overflow-hidden py-1.5"
            >
              {locales.length > 1 && (
                <>
                  <div className="px-3 py-2">
                    <LocaleSelect value={locale} options={locales} onChange={setLocale} />
                  </div>
                  <div className="h-px bg-slate-700/80 mx-2 my-1" />
                </>
              )}

              <MenuSection label={t.header.menuSectionSettings} />
              <MenuItem
                icon={<Icon.settings className="w-4 h-4" />}
                label={t.header.projectSettings}
                desc={t.header.projectSettingsDesc}
                onClick={() => { mainDD.close(); setProjectSettingsOpen(true); }}
              />
              <MenuItem
                icon={<Icon.tools className="w-4 h-4" />}
                label={t.header.editorPrefs}
                desc={t.header.editorPrefsDesc}
                onClick={() => { mainDD.close(); setEditorPrefsOpen(true); }}
              />
              <MenuItem
                icon={<Icon.brain className="w-4 h-4" />}
                label={t.header.llmSettings}
                desc={t.header.llmSettingsDesc}
                onClick={() => { mainDD.close(); setLLMSettingsOpen(true); }}
              />
              <div className="h-px bg-slate-700/80 mx-2 my-1" />
              <MenuItem
                icon={<Icon.info className="w-4 h-4" />}
                label={t.header.about}
                desc={t.header.aboutDesc}
                onClick={() => { mainDD.close(); setAboutOpen(true); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Custom window controls */}
      {isCustomTitleBar && (
        <div className="flex items-stretch shrink-0">
          <button
            className="w-11 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
            onClick={() => window.electronAPI?.minimizeWindow()}
            title="Minimise"
          >
            <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
              <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
          <button
            className="w-11 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
            onClick={() => window.electronAPI?.maximizeWindow()}
            title={isMaximized ? 'Restore' : 'Maximise'}
          >
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="2.5" y="0.5" width="7" height="7" stroke="currentColor" strokeWidth="1"/>
                <rect x="0.5" y="2.5" width="7" height="7" fill="#0f172a" stroke="currentColor" strokeWidth="1"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1"/>
              </svg>
            )}
          </button>
          <button
            className="w-11 flex items-center justify-center text-slate-500 hover:text-white hover:bg-red-600 transition-colors"
            onClick={() => window.electronAPI?.closeWindow()}
            title="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </div>
      )}

      {confirmModal}

      {importPreview && (
        <ImportSummaryModal
          summary={importPreview.summary}
          onCancel={() => setImportPreview(null)}
          onConfirm={handleConfirmImport}
        />
      )}

      {/* About Modal */}
      {aboutOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
                <img src="/Icon.PNG" alt="Purl" className="w-full h-full object-contain p-2" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Purl</h2>
              <p className="text-slate-400 text-sm mb-4">
                {t.header.aboutVersion(__APP_VERSION__)}
              </p>
              <div className="h-px bg-slate-700/50 mb-4" />
              <button
                className="text-indigo-400 hover:text-indigo-300 transition-colors text-sm font-medium flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                onClick={() => window.electronAPI?.openPath('https://purl.pp.ua')}
              >
                purl.pp.ua
                <Icon.externalLink className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="bg-slate-900/50 p-3 flex justify-center border-t border-slate-700">
              <button
                className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium transition-colors cursor-pointer"
                onClick={() => setAboutOpen(false)}
              >
                {t.common.confirm}
              </button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setAboutOpen(false)} />
        </div>
      )}
    </header>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MenuSection({ label }: { label: string }) {
  return (
    <div className="px-3 pt-1.5 pb-1 flex items-center gap-2">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
      <div className="flex-1 h-px bg-slate-700/60" />
    </div>
  );
}

function MenuItem({ icon, label, desc, shortcut, onClick, disabled }: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-slate-700/60 active:bg-slate-700 transition-colors cursor-pointer disabled:opacity-40 group"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0 text-slate-400 group-hover:text-slate-200 transition-colors">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200 font-medium leading-tight group-hover:text-white transition-colors">{label}</div>
        {desc && <div className="text-xs text-slate-500 mt-0.5 truncate">{desc}</div>}
      </div>
      {shortcut && (
        <kbd className="text-[10px] text-slate-500 shrink-0 font-mono bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-700/80">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

function DDItem({ icon, label, desc, onClick, disabled }: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="w-full text-left px-3 py-2 flex items-start gap-2.5 text-sm text-slate-200 hover:bg-slate-700/70 transition-colors cursor-pointer disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0 text-slate-400 mt-0.5">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-medium leading-tight">{label}</div>
        {desc && <div className="text-xs text-slate-400 mt-0.5">{desc}</div>}
      </div>
    </button>
  );
}

// ─── Button component ─────────────────────────────────────────────────────────

function Btn({
  children, variant, onClick, title, disabled,
}: {
  children: React.ReactNode;
  variant: 'ghost' | 'primary';
  onClick: () => void;
  title?: string;
  disabled?: boolean;
}) {
  const base = 'px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50';
  const styles = variant === 'primary'
    ? `${base} bg-indigo-600 hover:bg-indigo-500 text-white`
    : `${base} bg-slate-700/60 hover:bg-slate-700 text-slate-200`;
  return (
    <button className={styles} onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  );
}

// memo: Header takes no props, so it only needs to re-render from its own store
// subscriptions — not every time the App shell re-renders (e.g. on scene edits).
export const Header = memo(HeaderImpl);
