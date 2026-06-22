import { useState, useEffect } from 'react';
import { useProjectStore, isProjectFile } from '../../store/projectStore';
import { usePluginStore } from '../../store/pluginStore';
import { useEditorStore } from '../../store/editorStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useT } from '../../i18n';
import { useConfirm } from '../shared/ConfirmModal';
import { exportToTwee } from '../../utils/exportToTwee';
import { importFromTweeSource, ImportError, type ImportResult } from '../../utils/importFromTwee';
import { importFromHtmlSource } from '../../utils/importFromHtml';
import { extractProjectStrings, applyTranslations, type TranslationMap } from '../../utils/i18nUtils';
import {
  hasSCTemplate, getSCTemplate, getSCVersion,
  parseSCFormatJs, storeSCTemplate, clearSCTemplate,
} from '../../utils/scRuntime';
import { fsApi, joinPath, safeName } from '../../lib/fsApi';
import { pickNewProjectDir } from '../../lib/projectDir';
import { doSaveToDir, unapprovedScenes, dirOfPath, writeHtmlBundle, PURL_EXT } from '../../services/projectFiles';
import { toast } from 'sonner';

interface Closers {
  /** Close the File dropdown menu (called at the start of file-menu actions). */
  closeFile: () => void;
  /** Close the Export dropdown menu. */
  closeExport: () => void;
  /** Close the SugarCube-runtime dropdown menu. */
  closeSc: () => void;
}

/**
 * All project file-system workflows extracted from Header.tsx: save / open / new,
 * Twee/HTML import, SugarCube-format load, and the HTML/Twee/translation exports.
 * Owns the file-ops UI state (busy, import preview, SC-runtime readiness) + the
 * confirm modal; the host renders `confirmModal` and supplies the dropdown closers.
 */
export function useProjectFileOps({ closeFile, closeExport, closeSc }: Closers) {
  const project       = useProjectStore(s => s.project);
  const projectDir    = useProjectStore(s => s.projectDir);
  const setProjectDir = useProjectStore(s => s.setProjectDir);
  const resetProject  = useProjectStore(s => s.resetProject);
  const loadProject   = useProjectStore(s => s.loadProject);
  const setProjectSettingsOpen = useEditorStore(s => s.setProjectSettingsOpen);
  const confirmOpenFolderAfterExport = useEditorPrefsStore(s => s.confirmOpenFolderAfterExport);
  const t = useT();
  const { ask, modal: confirmModal } = useConfirm();

  const [scReady, setScReady]             = useState(hasSCTemplate());
  const [scVersion, setScVersion]         = useState(getSCVersion());
  const [busy, setBusy]                   = useState(false);
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);

  useEffect(() => {
    setScReady(hasSCTemplate());
    setScVersion(getSCVersion());
  }, []);

  // ─── Save helpers ─────────────────────────────────────────────────────────

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

  // ─── Save / Open ──────────────────────────────────────────────────────────

  const handleSaveProject = async () => {
    closeFile();
    setBusy(true);
    try {
      let dir = projectDir;
      if (!dir) {
        dir = await pickNewProjectDir(project.title);
        if (!dir) return;
        setProjectDir(dir);
      }
      await doSaveToDir(project, dir);
      toast.success(t.header.successSave);
    } catch (e) {
      alert(t.header.errorSave(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProjectAs = async () => {
    closeFile();
    const dir = await pickNewProjectDir(project.title);
    if (!dir) return;
    setBusy(true);
    try {
      setProjectDir(dir);
      await doSaveToDir(project, dir);
      toast.success(t.header.successSave);
    } catch (e) {
      alert(t.header.errorSave(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenProject = async () => {
    closeFile();
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
    closeFile();
    ask(
      { message: t.header.confirmNew },
      () => {
        resetProject();
        setProjectSettingsOpen(true);
      },
    );
  };

  const handleImportFromTwee = async () => {
    closeFile();
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

  // ─── SC Runtime ───────────────────────────────────────────────────────────

  const handleLoadSCFormat = async () => {
    closeSc();
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
    closeSc();
    ask(
      { message: t.header.confirmClearSC, variant: 'danger' },
      () => { clearSCTemplate(); setScReady(false); setScVersion(null); },
    );
  };

  // ─── Export ───────────────────────────────────────────────────────────────

  const handleExportHtml = async () => {
    const template = getSCTemplate();
    if (!template) return;
    closeExport();

    const doExport = async () => {
      setBusy(true);
      try {
        const dir = await ensureProjectDir();
        if (!dir) return;
        const releaseDir = joinPath(dir, 'release');

        await writeHtmlBundle(
          project, template, usePluginStore.getState().plugins,
          joinPath(releaseDir, 'index.html'), releaseDir,
        );
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

    const badScenes = unapprovedScenes(project);
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
    closeExport();
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
      const saveDir = dirOfPath(filePath);
      await writeHtmlBundle(project, template, usePluginStore.getState().plugins, filePath, saveDir);
      toast.success(t.header.successExportHtml);
    } catch (e) {
      alert(t.header.errorExportHtml(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleExportTwee = async () => {
    closeExport();
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
    closeFile();
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
    closeExport();

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

      const saveDir = dirOfPath(savePath);
      await writeHtmlBundle(translatedProject, template, usePluginStore.getState().plugins, savePath, saveDir);
      toast.success(`Exported ${langCode} version successfully!`);
    } catch (e) {
      alert('Error during translated export: ' + String(e));
    } finally {
      setBusy(false);
    }
  };

  const hasUnapproved = scReady && unapprovedScenes(project).length > 0;

  return {
    busy, importPreview, setImportPreview, scReady, scVersion, hasUnapproved, confirmModal,
    handleSaveProject, handleSaveProjectAs, handleOpenProject, handleNewProject,
    handleImportFromTwee, handleConfirmImport, handleOpenProjectFolder,
    handleLoadSCFormat, handleClearSC,
    handleExportHtml, handleExportHtmlAs, handleExportTwee,
    handleExportTranslations, handleExportWithTranslation,
  };
}
