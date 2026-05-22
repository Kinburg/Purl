import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useProjectStore, DEFAULT_PROJECT_SETTINGS } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useT } from '../../i18n';
import { fsApi, joinPath, safeName, toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { toast } from 'sonner';
import type {
  Project, ProjectSettings, SidebarPanel, SidebarTab, SidebarRow,
  BlockStyleOverride, VariableTreeNode,
} from '../../types';
import {
  ModalShell, ModalBody,
  ModalField, ModalRow, ModalSection, Toggle, Segmented,
  PrimaryButton, SecondaryButton, ColorSwatchInput, INPUT_CLS,
} from '../shared/ModalShell';
import { EmojiIcon } from '../shared/EmojiIcons';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import {
  BUTTON_FIELD_SCHEMA, BUTTON_RAW_CSS_HELP,
  CONTENT_BLOCK_FIELD_SCHEMA, CONTENT_BLOCK_RAW_CSS_HELP,
  MEDIA_BLOCK_FIELD_SCHEMA, MEDIA_BLOCK_RAW_CSS_HELP,
  DIVIDER_FIELD_SCHEMA, DIVIDER_RAW_CSS_HELP,
  CHOICE_FIELD_SCHEMA, CHOICE_RAW_CSS_HELP,
  POPUP_FIELD_SCHEMA, POPUP_RAW_CSS_HELP,
} from '../../utils/styleCascade';
import type { StyleFieldDescriptor, StyleRawCssHelp } from '../../utils/styleCascade';
import type { BlockType } from '../../types';
import NumericInput from '../shared/NumericInput';

/** AI-button label: sparkle SVG followed by the action text. */
function AiLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <EmojiIcon name="sparkle" size={20} /> {children}
    </span>
  );
}
import { generateImageWithProvider, type ComfyProgress } from '../../utils/imageGen/providers';
import { loadComfyWorkflow, loadExampleWorkflows, collectWorkflowFiles, EXAMPLES_PREFIX } from '../../utils/imageGen/workflowLoader';
import {
  expandDescriptionWithLlm,
  generateLoreFromDescriptionWithLlm,
  generateHeaderImagePromptWithLlm,
} from '../../utils/imageGen/llmPrompt';

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════

function detectExt(imageUrl: string, contentType: string | null): string {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpg';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  const byUrl = imageUrl.split('?')[0].split('.').pop()?.toLowerCase();
  return byUrl || 'png';
}

function buildHeaderRow(rowId: string, src: string, objectFit: 'cover' | 'contain'): SidebarRow {
  return {
    id: rowId,
    height: 120,
    cells: [{
      id: crypto.randomUUID(),
      width: 100,
      content: { type: 'image-static', src, objectFit },
    }],
  };
}

function applyHeaderImageToPanel(
  panel: SidebarPanel,
  src: string | null,
  existingRowId: string | null,
  objectFit: 'cover' | 'contain',
): { panel: SidebarPanel; rowId: string | null } {
  if (!src) {
    if (!existingRowId) return { panel, rowId: null };
    const updatedTabs = panel.tabs.map(tab => ({
      ...tab,
      rows: tab.rows.filter(r => r.id !== existingRowId),
    }));
    return { panel: { ...panel, tabs: updatedTabs }, rowId: null };
  }

  const rowId = existingRowId ?? crypto.randomUUID();

  if (panel.tabs.length === 0) {
    const newTab: SidebarTab = {
      id: crypto.randomUUID(),
      label: '',
      rows: [buildHeaderRow(rowId, src, objectFit)],
    };
    return { panel: { ...panel, tabs: [newTab] }, rowId };
  }

  const firstTab = panel.tabs[0];

  if (existingRowId) {
    const rowExists = firstTab.rows.some(r => r.id === existingRowId);
    if (rowExists) {
      const updatedRows = firstTab.rows.map(r =>
        r.id === existingRowId ? buildHeaderRow(rowId, src, objectFit) : r
      );
      const updatedTabs = [{ ...firstTab, rows: updatedRows }, ...panel.tabs.slice(1)];
      return { panel: { ...panel, tabs: updatedTabs }, rowId };
    }
  }

  const updatedTabs = [
    { ...firstTab, rows: [buildHeaderRow(rowId, src, objectFit), ...firstTab.rows] },
    ...panel.tabs.slice(1),
  ];
  return { panel: { ...panel, tabs: updatedTabs }, rowId };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════════════════

type TabId = 'general' | 'appearance' | 'blockDefaults' | 'aiImage' | 'advanced';

interface Props {
  mode: 'create' | 'edit';
  onClose: () => void;
  /** Initial tab to show. */
  initialTab?: TabId;
}

export function ProjectSettingsModal({ mode, onClose, initialTab = 'general' }: Props) {
  const t = useT();
  const ps = t.projectSettings;
  const ig = t.imageGenBlock;

  const { project, projectDir, updateProjectMeta, loadProject } = useProjectStore();
  const { setProjectSettingsOpen } = useEditorStore();
  const prefs = useEditorPrefsStore();
  const {
    llmEnabled, llmProvider,
    llmUrl,
    llmGeminiApiKey, llmGeminiModel,
    llmOpenaiUrl, llmOpenaiApiKey, llmOpenaiModel,
    llmMaxTokens, llmTemperature, llmSystemPrompt,
    imageGenProvider, comfyUiUrl, comfyUiWorkflowsDir,
    pollinationsModel, pollinationsToken,
  } = prefs;

  // ─── Tabs ───────────────────────────────────────────────────────────────────

  const [tab, setTab] = useState<TabId>(initialTab);

  // ─── Form state — project fields ────────────────────────────────────────────

  const [title, setTitle]             = useState(mode === 'edit' ? project.title : '');
  const [author, setAuthor]           = useState(mode === 'edit' ? (project.author ?? '') : '');
  const [description, setDescription] = useState(mode === 'edit' ? (project.description ?? '') : '');
  const [lore, setLore]               = useState(mode === 'edit' ? (project.lore ?? '') : '');

  // Header image
  const [headerPendingPath, setHeaderPendingPath] = useState<string | null>(null);
  const [headerPreviewUrl, setHeaderPreviewUrl]   = useState<string | null>(
    mode === 'edit' && project.settings.headerImageSrc && projectDir
      ? toLocalFileUrl(resolveAssetPath(projectDir, project.settings.headerImageSrc))
      : null,
  );
  const [headerRemoved, setHeaderRemoved] = useState(false);
  const [headerObjectFit, setHeaderObjectFit] = useState<'cover' | 'contain'>(() => {
    if (mode === 'edit' && project.settings.headerRowId) {
      for (const tabEl of project.sidebarPanel.tabs) {
        const row = tabEl.rows.find(r => r.id === project.settings.headerRowId);
        if (row?.cells[0]?.content.type === 'image-static') {
          return (row.cells[0].content as { objectFit: 'cover' | 'contain' }).objectFit;
        }
      }
    }
    return 'cover';
  });

  // Generated image bytes (in-memory, no file written until save)
  const [headerGenBytes, setHeaderGenBytes] = useState<number[] | null>(null);
  const [headerGenExt, setHeaderGenExt]     = useState('png');

  // Appearance
  const existing = mode === 'edit' ? project.settings : DEFAULT_PROJECT_SETTINGS;
  const [bgColor,      setBgColor]      = useState(existing.bgColor      ?? '');
  const [sidebarColor, setSidebarColor] = useState(existing.sidebarColor ?? '');
  const [titleColor,   setTitleColor]   = useState(existing.titleColor   ?? '');
  const [titleFont,    setTitleFont]    = useState(existing.titleFont    ?? '');

  // Advanced
  const [historyControls, setHistoryControls] = useState(existing.historyControls);
  const [saveLoadMenu,    setSaveLoadMenu]    = useState(existing.saveLoadMenu);
  const [audioUnlockText,  setAudioUnlockText]  = useState(existing.audioUnlockText  ?? '');

  // Block defaults (per-block-type cascade common-custom). Empty record = no overrides.
  const [defaultBlockStyles, setDefaultBlockStyles] = useState<ProjectSettings['defaultBlockStyles']>(
    existing.defaultBlockStyles ?? {},
  );

  const [titleError, setTitleError] = useState<string | null>(null);
  const [busy, setBusy]             = useState(false);

  // Image lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // AI busy states
  const [busyExpandDesc, setBusyExpandDesc]     = useState(false);
  const [busyGenerateLore, setBusyGenerateLore] = useState(false);
  const [busyGenPrompt, setBusyGenPrompt]       = useState(false);
  const [busyGenImage, setBusyGenImage]         = useState(false);
  const [genProgress, setGenProgress]           = useState<ComfyProgress | null>(null);

  // Abort refs
  const descAbortRef   = useRef<AbortController | null>(null);
  const loreAbortRef   = useRef<AbortController | null>(null);
  const promptAbortRef = useRef<AbortController | null>(null);
  const imgAbortRef    = useRef<AbortController | null>(null);

  // Image-gen local state
  const [imgWorkflowFile, setImgWorkflowFile]   = useState('');
  const [imgPrompt, setImgPrompt]               = useState('');
  const [imgNegativePrompt, setImgNegativePrompt] = useState('');
  const [imgWidth, setImgWidth]                 = useState(768);
  const [imgHeight, setImgHeight]               = useState(512);
  const [imgSeedMode, setImgSeedMode]           = useState<'random' | 'manual'>('random');
  const [imgSeed, setImgSeed]                   = useState(0);
  const [exampleWorkflows, setExampleWorkflows] = useState<string[]>([]);
  const [projectWorkflows, setProjectWorkflows] = useState<string[]>([]);
  const [workflows, setWorkflows]               = useState<string[]>([]);

  // ─── Title validation ───────────────────────────────────────────────────────

  useEffect(() => { if (title.trim()) setTitleError(null); }, [title]);

  // ─── Load workflows for AI image tab ────────────────────────────────────────

  useEffect(() => {
    if (tab !== 'aiImage' || imageGenProvider !== 'comfyui') return;
    let alive = true;
    async function run() {
      const examples = await loadExampleWorkflows();
      if (alive) setExampleWorkflows(examples);

      if (projectDir) {
        const projRoot = joinPath(projectDir, 'comfyUI_workflows');
        if (await fsApi.exists(projRoot)) {
          const projList = await collectWorkflowFiles(projRoot, 'comfyUI_workflows');
          if (alive) setProjectWorkflows(projList.sort((a, b) => a.localeCompare(b)));
        } else {
          if (alive) setProjectWorkflows([]);
        }
      }

      if (comfyUiWorkflowsDir.trim()) {
        const globalRoot = comfyUiWorkflowsDir.trim();
        if (await fsApi.exists(globalRoot)) {
          const globalList = await collectWorkflowFiles(globalRoot, '');
          if (alive) setWorkflows(globalList.sort((a, b) => a.localeCompare(b)));
        } else {
          if (alive) setWorkflows([]);
        }
      } else {
        if (alive) setWorkflows([]);
      }
    }
    run().catch(() => {});
    return () => { alive = false; };
  }, [tab, imageGenProvider, projectDir, comfyUiWorkflowsDir]);

  const refreshImgWorkflows = async () => {
    const examples = await loadExampleWorkflows();
    setExampleWorkflows(examples);

    if (projectDir) {
      const projRoot = joinPath(projectDir, 'comfyUI_workflows');
      if (await fsApi.exists(projRoot)) {
        const projList = await collectWorkflowFiles(projRoot, 'comfyUI_workflows');
        setProjectWorkflows(projList.sort((a, b) => a.localeCompare(b)));
      } else {
        setProjectWorkflows([]);
      }
    }

    if (comfyUiWorkflowsDir.trim()) {
      const globalRoot = comfyUiWorkflowsDir.trim();
      if (await fsApi.exists(globalRoot)) {
        const globalList = await collectWorkflowFiles(globalRoot, '');
        setWorkflows(globalList.sort((a, b) => a.localeCompare(b)));
      } else {
        setWorkflows([]);
      }
    } else {
      setWorkflows([]);
    }
  };

  // ─── LLM options helper ─────────────────────────────────────────────────────

  const getLlmOptions = () => ({
    provider:     llmProvider,
    urlOrApiKey:  llmProvider === 'openai' ? llmOpenaiUrl
                : llmProvider === 'gemini' ? llmGeminiApiKey
                : llmUrl,
    apiKey:       llmProvider === 'openai' ? llmOpenaiApiKey : undefined,
    model:        llmProvider === 'openai' ? llmOpenaiModel : llmGeminiModel,
    maxTokens:    llmMaxTokens,
    temperature:  llmTemperature,
    systemPrompt: llmSystemPrompt,
  });

  // ─── AI handlers ─────────────────────────────────────────────────────────────

  const handleExpandDescription = async () => {
    if (!llmEnabled || busyExpandDesc) return;
    setBusyExpandDesc(true);
    const ctrl = new AbortController();
    descAbortRef.current = ctrl;
    try {
      const result = await expandDescriptionWithLlm(getLlmOptions(), project, description, lore, ctrl.signal);
      if (result) setDescription(result);
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(ps.aiExpandError);
    } finally {
      descAbortRef.current = null;
      setBusyExpandDesc(false);
    }
  };

  const handleGenerateLore = async () => {
    if (!llmEnabled || busyGenerateLore) return;
    setBusyGenerateLore(true);
    const ctrl = new AbortController();
    loreAbortRef.current = ctrl;
    try {
      const result = await generateLoreFromDescriptionWithLlm(getLlmOptions(), project, description, lore, ctrl.signal);
      if (result) setLore(result);
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(ps.aiLoreError);
    } finally {
      loreAbortRef.current = null;
      setBusyGenerateLore(false);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!llmEnabled || busyGenPrompt) return;
    setBusyGenPrompt(true);
    const ctrl = new AbortController();
    promptAbortRef.current = ctrl;
    try {
      const result = await generateHeaderImagePromptWithLlm(getLlmOptions(), project, description, lore, imgPrompt, ctrl.signal);
      if (result) setImgPrompt(result);
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(ps.aiImageError);
    } finally {
      promptAbortRef.current = null;
      setBusyGenPrompt(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imgPrompt.trim()) return toast.error(ps.aiImageErrorNoPrompt);
    if (imageGenProvider === 'comfyui' && !imgWorkflowFile) return toast.error(ig.errorNoWorkflow);

    const ctrl = new AbortController();
    imgAbortRef.current = ctrl;
    setBusyGenImage(true);
    setGenProgress(null);
    try {
      const workflowJson = await loadComfyWorkflow(imageGenProvider, imgWorkflowFile, comfyUiWorkflowsDir, projectDir ?? '');

      const usedSeed = imgSeedMode === 'random' ? Math.floor(Math.random() * 4294967295) : imgSeed;
      if (imgSeedMode === 'random') setImgSeed(usedSeed);

      const generated = await generateImageWithProvider(imageGenProvider, {
        baseUrl:           comfyUiUrl,
        workflow:          workflowJson,
        prompt:            imgPrompt,
        negativePrompt:    imgNegativePrompt,
        seed:              usedSeed,
        pollinationsModel: pollinationsModel || undefined,
        pollinationsToken: pollinationsToken || undefined,
        genWidth:          imgWidth,
        genHeight:         imgHeight,
        onProgress:        imageGenProvider === 'comfyui' ? setGenProgress : undefined,
      }, ctrl.signal);

      let bytes: number[];
      let ext: string;
      if (generated.bytes) {
        bytes = generated.bytes;
        ext = detectExt('', generated.contentType ?? null);
      } else {
        const imgRes = await fsApi.httpRequestBinary({ url: generated.imageUrl! });
        if (imgRes.status < 200 || imgRes.status >= 300) throw new Error(`Image download failed: ${imgRes.status}`);
        bytes = imgRes.bytes;
        ext = detectExt(generated.imageUrl!, imgRes.headers['content-type'] ?? null);
      }

      setHeaderGenBytes(bytes);
      setHeaderGenExt(ext);

      const blob = new Blob([new Uint8Array(bytes)], { type: `image/${ext}` });
      const blobUrl = URL.createObjectURL(blob);
      setHeaderPreviewUrl(blobUrl);
      setHeaderRemoved(false);
      setHeaderPendingPath(null);
    } catch (err: any) {
      if (err?.name !== 'AbortError') toast.error(ps.aiImageError);
    } finally {
      imgAbortRef.current = null;
      setBusyGenImage(false);
      setGenProgress(null);
    }
  };

  const handleRemoveGeneratedImage = () => {
    setHeaderGenBytes(null);
    setHeaderPreviewUrl(null);
  };

  // ─── Header image picker ────────────────────────────────────────────────────

  const handlePickHeaderImage = async () => {
    const filePath = await fsApi.openFileDialog({
      title: ps.fieldHeaderImage,
      filters: [{ name: t.assets.filterImages, extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] }],
    });
    if (!filePath) return;
    setHeaderPendingPath(filePath);
    setHeaderPreviewUrl(toLocalFileUrl(filePath));
    setHeaderRemoved(false);
    setHeaderGenBytes(null);
  };

  const handleRemoveHeaderImage = () => {
    setHeaderPendingPath(null);
    setHeaderPreviewUrl(null);
    setHeaderRemoved(true);
    setHeaderGenBytes(null);
  };

  // ─── Build settings / save / create ─────────────────────────────────────────

  function buildSettings(headerSrc: string | null, rowId: string | null): ProjectSettings {
    const s: ProjectSettings = { historyControls, saveLoadMenu };
    if (bgColor.trim())      s.bgColor      = bgColor.trim();
    if (sidebarColor.trim()) s.sidebarColor = sidebarColor.trim();
    if (titleColor.trim())   s.titleColor   = titleColor.trim();
    if (titleFont.trim())    s.titleFont    = titleFont.trim();
    if (headerSrc)           s.headerImageSrc = headerSrc;
    if (rowId)               s.headerRowId = rowId;
    if (audioUnlockText.trim())  s.audioUnlockText  = audioUnlockText.trim();
    // Block defaults (cascade common-custom per block type) — set when at least one entry exists.
    if (defaultBlockStyles && Object.keys(defaultBlockStyles).length > 0) {
      s.defaultBlockStyles = defaultBlockStyles;
    }
    return s;
  }

  async function copyHeaderImage(dir: string, filePath: string): Promise<string> {
    const fileName = filePath.replace(/.*[/\\]/, '');
    const destDir  = joinPath(dir, 'release', 'assets', 'project');
    await fsApi.mkdir(destDir);
    const destPath = joinPath(destDir, fileName);
    await fsApi.copyFile(filePath, destPath);
    return `assets/project/${fileName}`;
  }

  async function writeHeaderImageBytes(dir: string, bytes: number[], ext: string): Promise<string> {
    const fileName = `header-${Date.now()}.${ext}`;
    const destDir  = joinPath(dir, 'release', 'assets', 'project');
    await fsApi.mkdir(destDir);
    const destPath = joinPath(destDir, fileName);
    await fsApi.writeFileBinary(destPath, bytes);
    return `assets/project/${fileName}`;
  }

  async function resolveHeaderSrc(dir: string, existingSrc: string | null): Promise<string | null> {
    if (headerRemoved) return null;
    if (headerGenBytes && headerGenBytes.length > 0) return writeHeaderImageBytes(dir, headerGenBytes, headerGenExt);
    if (headerPendingPath) return copyHeaderImage(dir, headerPendingPath);
    return existingSrc;
  }

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setTitleError(ps.titleEmpty); setTab('general'); return; }

    setBusy(true);
    try {
      const headerSrc = await resolveHeaderSrc(projectDir!, project.settings.headerImageSrc ?? null);
      const existingRowId = project.settings.headerRowId ?? null;

      const { panel: updatedPanel, rowId: newRowId } = applyHeaderImageToPanel(
        project.sidebarPanel, headerSrc, existingRowId, headerObjectFit,
      );

      updateProjectMeta({
        title:        trimmedTitle,
        author:       author.trim() || undefined,
        description:  description.trim() || undefined,
        lore:         lore.trim() || undefined,
        settings:     buildSettings(headerSrc, newRowId),
        sidebarPanel: updatedPanel,
      });

      setProjectSettingsOpen(false);
      onClose();
      toast.success(ps.successSave);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setTitleError(ps.titleEmpty); setTab('general'); return; }

    setBusy(true);
    try {
      const folder = await fsApi.openFolderDialog();
      if (!folder) { setBusy(false); return; }

      await fsApi.mkdir(joinPath(folder, 'release', 'assets'));

      const headerSrc = await resolveHeaderSrc(folder, null);

      const newProject: Project = {
        id:    crypto.randomUUID(),
        title: trimmedTitle,
        ifid:  (crypto.randomUUID()).toUpperCase(),
        author:       author.trim()      || undefined,
        description:  description.trim() || undefined,
        lore:         lore.trim()        || undefined,
        settings:     buildSettings(null, null),
        scenes:       [{ id: crypto.randomUUID(), name: 'Start', tags: ['start'], blocks: [] }],
        sceneGroups:  [],
        characters:   [],
        items:        [],
        containers:   [],
        variableNodes: [],
        assetNodes:   [],
        sidebarPanel: { tabs: [], liveUpdate: false, style: { rowGap: 2, borderWidth: 1, borderColor: '#555555', showOuterBorder: false, showRowBorders: false, showCellBorders: false } } as SidebarPanel,
        watchers:     [],
      };

      const { panel: updatedPanel, rowId } = applyHeaderImageToPanel(
        newProject.sidebarPanel, headerSrc, null, headerObjectFit,
      );

      newProject.sidebarPanel = updatedPanel;
      newProject.settings     = buildSettings(headerSrc, rowId);

      const fileName = `${safeName(trimmedTitle)}.purl`;
      await fsApi.writeFile(joinPath(folder, fileName), JSON.stringify(newProject, null, 2));

      loadProject(newProject, folder);
      setProjectSettingsOpen(false);
      onClose();
      toast.success(ps.successCreate);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const hasHeaderImage = headerPreviewUrl && !headerRemoved;

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: 'general',       label: ps.tabGeneral,        icon: <IconDocument /> },
    { id: 'appearance',    label: ps.tabAppearance,     icon: <IconPalette /> },
    { id: 'blockDefaults', label: ps.tabBlockDefaults,  icon: <IconPalette /> },
    { id: 'aiImage',       label: ps.tabAiImage,        icon: <IconImage /> },
    { id: 'advanced',      label: ps.tabAdvanced,       icon: <IconCog /> },
  ];

  return (
    <>
      <ModalShell width={900}  height={600} onClose={onClose} dismissOnBackdrop={false}>
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
            <IconBook />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-100 leading-tight">
              {mode === 'create' ? ps.createTitle : ps.editTitle}
            </h2>
            {mode === 'edit' && title && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">{title}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition-colors p-1 -m-1 cursor-pointer"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex min-h-0 flex-1">
          <nav className="w-52 shrink-0 border-r border-slate-700 py-3 flex flex-col gap-0.5">
            {tabs.map(item => {
              const active = item.id === tab;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors cursor-pointer border-l-2 ${
                    active
                      ? 'bg-indigo-600/10 border-indigo-500 text-indigo-200'
                      : 'border-transparent text-slate-300 hover:bg-slate-700/40 hover:text-slate-100'
                  }`}
                >
                  <span className={active ? 'text-indigo-300' : 'text-slate-400'}>{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <ModalBody className="flex-1 gap-5 px-6 py-5">
          {/* ── General ────────────────────────────────────────────────── */}
          {tab === 'general' && (
            <>
              <ModalField label={ps.fieldTitle} required error={titleError ?? undefined}>
                <input
                  autoFocus
                  className={INPUT_CLS}
                  placeholder={ps.fieldTitlePlaceholder}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { if (mode === 'create') handleCreate(); else handleSave(); } }}
                />
              </ModalField>

              <ModalField label={ps.fieldAuthor}>
                <input
                  className={INPUT_CLS}
                  placeholder={ps.fieldAuthorPlaceholder}
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                />
              </ModalField>

              <ModalField label={ps.fieldDescription}>
                <textarea
                  className={INPUT_CLS + ' resize-none min-h-[60px]'}
                  rows={3}
                  placeholder={ps.fieldDescPlaceholder}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busyExpandDesc || !llmEnabled}
                  onClick={handleExpandDescription}
                  className="self-start text-[11px] px-2 py-0.5 mt-1 rounded bg-slate-700 hover:bg-slate-600 text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors border border-slate-600"
                >
                  {busyExpandDesc ? ps.aiExpandDescBusy : <AiLabel>{ps.aiExpandDesc}</AiLabel>}
                </button>
              </ModalField>

              <ModalField label={ps.fieldLore} note={ps.fieldLoreNote}>
                <textarea
                  className={INPUT_CLS + ' resize-none min-h-[80px]'}
                  rows={4}
                  placeholder={ps.fieldLorePlaceholder}
                  value={lore}
                  onChange={e => setLore(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busyGenerateLore || !llmEnabled || !description.trim()}
                  onClick={handleGenerateLore}
                  className="self-start text-[11px] px-2 py-0.5 mt-1 rounded bg-slate-700 hover:bg-slate-600 text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors border border-slate-600"
                >
                  {busyGenerateLore ? ps.aiGenerateLoreBusy : <AiLabel>{ps.aiGenerateLore}</AiLabel>}
                </button>
              </ModalField>
            </>
          )}

          {/* ── Appearance ─────────────────────────────────────────────── */}
          {tab === 'appearance' && (
            <>
              <ModalSection title={ps.sectionColors}>
                <ModalRow label={ps.fieldBgColor}>
                  <ColorSwatchInput value={bgColor} onChange={setBgColor} allowClear />
                </ModalRow>
                <ModalRow label={ps.fieldSidebarColor}>
                  <ColorSwatchInput value={sidebarColor} onChange={setSidebarColor} allowClear />
                </ModalRow>
                <ModalRow label={ps.fieldTitleColor}>
                  <ColorSwatchInput value={titleColor} onChange={setTitleColor} allowClear />
                </ModalRow>

                <ModalField label={ps.fieldTitleFont}>
                  <input
                    className={INPUT_CLS}
                    placeholder={ps.fieldTitleFontPlaceholder}
                    value={titleFont}
                    onChange={e => setTitleFont(e.target.value)}
                  />
                </ModalField>
              </ModalSection>

              <ModalSection title={ps.fieldHeaderImage} note={ps.headerImageNote}>
                {hasHeaderImage ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                      <img
                        src={headerPreviewUrl!}
                        alt=""
                        className="h-20 w-auto rounded border border-slate-600 flex-shrink-0 cursor-zoom-in"
                        style={{ maxWidth: '260px', objectFit: headerObjectFit }}
                        onDoubleClick={() => setLightboxOpen(true)}
                        title={t.imageGenBlock.doubleClickToExpand}
                      />
                      <div className="flex flex-col gap-1 pt-1">
                        <button
                          className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer text-left"
                          onClick={handlePickHeaderImage}
                        >
                          {ps.headerImageChange}
                        </button>
                        <button
                          className="text-xs text-red-400 hover:text-red-300 cursor-pointer text-left"
                          onClick={handleRemoveHeaderImage}
                        >
                          {ps.headerImageRemove}
                        </button>
                      </div>
                    </div>
                    <ModalRow label={t.cellModal.objectFit}>
                      <Segmented
                        value={headerObjectFit}
                        onChange={setHeaderObjectFit}
                        options={[
                          { value: 'cover', label: t.cellModal.fitCover },
                          { value: 'contain', label: t.cellModal.fitContain },
                        ]}
                      />
                    </ModalRow>
                  </div>
                ) : (
                  <button
                    className="self-start text-xs text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded border border-slate-600 hover:border-indigo-500 transition-colors cursor-pointer"
                    onClick={handlePickHeaderImage}
                  >
                    {ps.headerImageAdd}
                  </button>
                )}
                <p className="text-[10px] text-slate-500 mt-1">{ps.headerImageAiHint}</p>
              </ModalSection>
            </>
          )}

          {/* ── Block defaults ─────────────────────────────────────────── */}
          {tab === 'blockDefaults' && (
            <BlockDefaultsTab
              defaultBlockStyles={defaultBlockStyles}
              onChange={setDefaultBlockStyles}
              variableNodes={project.variableNodes}
            />
          )}

          {/* ── AI Image ───────────────────────────────────────────────── */}
          {tab === 'aiImage' && (
            <>
              {!llmEnabled && (
                <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
                  {ps.aiLlmDisabledHint}
                </div>
              )}

              {hasHeaderImage && (
                <ModalSection title={ps.currentHeaderImage}>
                  <div className="flex items-start gap-3">
                    <img
                      src={headerPreviewUrl!}
                      alt=""
                      className="h-20 rounded border border-slate-600 cursor-zoom-in"
                      style={{ maxWidth: '200px', objectFit: headerObjectFit }}
                      onDoubleClick={() => setLightboxOpen(true)}
                    />
                    <button
                      className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                      onClick={handleRemoveHeaderImage}
                    >
                      {ps.headerImageRemove}
                    </button>
                  </div>
                </ModalSection>
              )}

              <ModalSection title={ps.sectionAiImage}>
                {imageGenProvider === 'comfyui' && (
                  <ModalField label={ig.workflowLabel}>
                    <div className="flex items-center gap-2">
                      <select
                        className={INPUT_CLS + ' flex-1'}
                        value={imgWorkflowFile}
                        onChange={e => setImgWorkflowFile(e.target.value)}
                      >
                        <option value="">{ig.workflowNone}</option>
                        {projectWorkflows.length > 0 && (
                            <optgroup label={ig.workflowGroupProject}>
                              {projectWorkflows.map(wf => (
                                  <option key={wf} value={wf}>{wf.replace(/^comfyUI_workflows\//, '')}</option>
                              ))}
                            </optgroup>
                        )}
                        {workflows.length > 0 && (
                            <optgroup label={ig.workflowGroupCustom}>
                              {workflows.map(wf => <option key={wf} value={wf}>{wf}</option>)}
                            </optgroup>
                        )}
                        {exampleWorkflows.length > 0 && (
                            <optgroup label={ig.workflowGroupExamples}>
                              {exampleWorkflows.map(wf => (
                                  <option key={wf} value={wf}>{wf.slice(EXAMPLES_PREFIX.length)}</option>
                              ))}
                            </optgroup>
                        )}
                      </select>
                      <button
                        type="button"
                        className="px-2 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-slate-200 cursor-pointer shrink-0"
                        onClick={refreshImgWorkflows}
                      >
                        {ig.workflowRefresh}
                      </button>
                    </div>
                  </ModalField>
                )}

                <ModalField label={ig.promptLabel}>
                  <textarea
                    className={INPUT_CLS + ' resize-none min-h-[70px]'}
                    rows={3}
                    placeholder={ig.promptPlaceholder}
                    value={imgPrompt}
                    onChange={e => setImgPrompt(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busyGenPrompt || !llmEnabled}
                    onClick={handleGeneratePrompt}
                    className="self-start text-[11px] px-2 py-0.5 mt-1 rounded bg-slate-700 hover:bg-slate-600 text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors border border-slate-600"
                  >
                    {busyGenPrompt ? ps.aiGeneratePromptBusy : <AiLabel>{ps.aiGeneratePrompt}</AiLabel>}
                  </button>
                </ModalField>

                <ModalField label={ig.negativePromptLabel}>
                  <textarea
                    className={INPUT_CLS + ' resize-none min-h-[50px]'}
                    rows={2}
                    placeholder={ig.negativePromptPlaceholder}
                    value={imgNegativePrompt}
                    onChange={e => setImgNegativePrompt(e.target.value)}
                  />
                </ModalField>

                <ModalRow label={ig.genSizeLabel}>
                  <div className="flex items-center gap-2">
                    <NumericInput
                      min={0}
                      className={INPUT_CLS + ' w-24'}
                      placeholder={ig.genWidthPlaceholder}
                      value={imgWidth}
                      onChange={setImgWidth}
                    />
                    <span className="text-xs text-slate-500">×</span>
                    <NumericInput
                      min={0}
                      className={INPUT_CLS + ' w-24'}
                      placeholder={ig.genHeightPlaceholder}
                      value={imgHeight}
                      onChange={setImgHeight}
                    />
                  </div>
                </ModalRow>

                <ModalRow label={ig.seedModeLabel}>
                  <Segmented
                    value={imgSeedMode}
                    onChange={setImgSeedMode}
                    options={[
                      { value: 'random', label: ig.seedModeRandom },
                      { value: 'manual', label: ig.seedModeManual },
                    ]}
                  />
                </ModalRow>

                {imgSeedMode === 'manual' && (
                  <ModalRow label={ig.seedLabel}>
                    <NumericInput
                      min={0} max={4294967295}
                      className={INPUT_CLS + ' w-40'}
                      placeholder={ig.seedPlaceholder}
                      value={imgSeed}
                      onChange={setImgSeed}
                    />
                  </ModalRow>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyGenImage}
                    className="px-3 py-1.5 text-xs rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white cursor-pointer"
                    onClick={handleGenerateImage}
                  >
                    {busyGenImage ? ig.generatingImage : <AiLabel>{ig.generateImage}</AiLabel>}
                  </button>
                  {busyGenImage && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white cursor-pointer"
                      onClick={() => imgAbortRef.current?.abort()}
                    >
                      {ig.cancelGeneration}
                    </button>
                  )}
                </div>

                {busyGenImage && (
                  <div className="w-full h-1 rounded-full bg-slate-700 overflow-hidden">
                    {genProgress ? (
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((genProgress.current / genProgress.total) * 100)}%` }}
                      />
                    ) : (
                      <div className="h-full w-full bg-emerald-500/40 animate-pulse" />
                    )}
                  </div>
                )}

                {headerGenBytes && !headerRemoved && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400 inline-flex items-center gap-1"><EmojiIcon name="check" size={20} /> {ps.aiImageReady}</span>
                    <button
                      type="button"
                      onClick={handleRemoveGeneratedImage}
                      className="text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      {ps.aiImageRemove}
                    </button>
                  </div>
                )}
              </ModalSection>
            </>
          )}

          {/* ── Advanced ───────────────────────────────────────────────── */}
          {tab === 'advanced' && (
            <ModalSection title={ps.sectionAdvanced}>
              <ModalRow label={ps.fieldHistoryControls}>
                <Toggle value={historyControls} onChange={() => setHistoryControls(v => !v)} />
              </ModalRow>
              <ModalRow label={ps.fieldSaveLoadMenu}>
                <Toggle value={saveLoadMenu} onChange={() => setSaveLoadMenu(v => !v)} />
              </ModalRow>

              <ModalField label={ps.fieldAudioUnlockText} note={ps.fieldAudioUnlockTextNote}>
                <input
                  className={INPUT_CLS}
                  placeholder={ps.fieldAudioUnlockTextPlaceholder}
                  value={audioUnlockText}
                  onChange={e => setAudioUnlockText(e.target.value)}
                />
              </ModalField>
            </ModalSection>
          )}
        </ModalBody>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-700">
          <SecondaryButton onClick={onClose}>{t.common.cancel}</SecondaryButton>
          <PrimaryButton
            onClick={mode === 'create' ? handleCreate : handleSave}
            disabled={busy}
          >
            {busy ? '...' : (mode === 'create' ? `${ps.create} →` : ps.save)}
          </PrimaryButton>
        </div>
      </ModalShell>

      {/* Image lightbox */}
      {lightboxOpen && headerPreviewUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxOpen(false)}
        >
          <img
            src={headerPreviewUrl}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────
// ─── Block defaults tab ─────────────────────────────────────────────────────

/** One row in the Block defaults tab — wraps a single block-type section. */
interface BlockDefaultRow {
  type: BlockType;
  titleKey: string;          // key under projectSettings (with sectionBlockDefaults* fallback)
  descKey: string;           // key under projectSettings (with blockDefaults*Desc fallback)
  schema: ReadonlyArray<StyleFieldDescriptor>;
  help: StyleRawCssHelp;
}

const BLOCK_DEFAULT_ROWS: ReadonlyArray<BlockDefaultRow> = [
  { type: 'button',      titleKey: 'sectionBlockDefaultsButton',      descKey: 'blockDefaultsButtonDesc',      schema: BUTTON_FIELD_SCHEMA,        help: BUTTON_RAW_CSS_HELP },
  { type: 'link',        titleKey: 'sectionBlockDefaultsLink',        descKey: 'blockDefaultsLinkDesc',        schema: BUTTON_FIELD_SCHEMA,        help: BUTTON_RAW_CSS_HELP },
  { type: 'function',    titleKey: 'sectionBlockDefaultsFunction',    descKey: 'blockDefaultsFunctionDesc',    schema: BUTTON_FIELD_SCHEMA,        help: BUTTON_RAW_CSS_HELP },
  { type: 'choice',      titleKey: 'sectionBlockDefaultsChoice',      descKey: 'blockDefaultsChoiceDesc',      schema: CHOICE_FIELD_SCHEMA,        help: CHOICE_RAW_CSS_HELP },
  { type: 'popup',       titleKey: 'sectionBlockDefaultsPopup',       descKey: 'blockDefaultsPopupDesc',       schema: POPUP_FIELD_SCHEMA,         help: POPUP_RAW_CSS_HELP },
  { type: 'text',        titleKey: 'sectionBlockDefaultsText',        descKey: 'blockDefaultsTextDesc',        schema: CONTENT_BLOCK_FIELD_SCHEMA, help: CONTENT_BLOCK_RAW_CSS_HELP },
  { type: 'image',       titleKey: 'sectionBlockDefaultsImage',       descKey: 'blockDefaultsImageDesc',       schema: MEDIA_BLOCK_FIELD_SCHEMA,   help: MEDIA_BLOCK_RAW_CSS_HELP },
  { type: 'image-gen',   titleKey: 'sectionBlockDefaultsImageGen',    descKey: 'blockDefaultsImageGenDesc',    schema: MEDIA_BLOCK_FIELD_SCHEMA,   help: MEDIA_BLOCK_RAW_CSS_HELP },
  { type: 'video',       titleKey: 'sectionBlockDefaultsVideo',       descKey: 'blockDefaultsVideoDesc',       schema: MEDIA_BLOCK_FIELD_SCHEMA,   help: MEDIA_BLOCK_RAW_CSS_HELP },
  { type: 'include',     titleKey: 'sectionBlockDefaultsInclude',     descKey: 'blockDefaultsIncludeDesc',     schema: CONTENT_BLOCK_FIELD_SCHEMA, help: CONTENT_BLOCK_RAW_CSS_HELP },
  { type: 'divider',     titleKey: 'sectionBlockDefaultsDivider',     descKey: 'blockDefaultsDividerDesc',     schema: DIVIDER_FIELD_SCHEMA,       help: DIVIDER_RAW_CSS_HELP },
  { type: 'checkbox',    titleKey: 'sectionBlockDefaultsCheckbox',    descKey: 'blockDefaultsCheckboxDesc',    schema: CONTENT_BLOCK_FIELD_SCHEMA, help: CONTENT_BLOCK_RAW_CSS_HELP },
  { type: 'radio',       titleKey: 'sectionBlockDefaultsRadio',       descKey: 'blockDefaultsRadioDesc',       schema: CONTENT_BLOCK_FIELD_SCHEMA, help: CONTENT_BLOCK_RAW_CSS_HELP },
  { type: 'input-field', titleKey: 'sectionBlockDefaultsInputField',  descKey: 'blockDefaultsInputFieldDesc',  schema: CONTENT_BLOCK_FIELD_SCHEMA, help: CONTENT_BLOCK_RAW_CSS_HELP },
];

function BlockDefaultsTab({
  defaultBlockStyles,
  onChange,
  variableNodes,
}: {
  defaultBlockStyles: ProjectSettings['defaultBlockStyles'];
  onChange: (next: ProjectSettings['defaultBlockStyles']) => void;
  variableNodes: VariableTreeNode[];
}) {
  const t = useT();
  const ps = t.projectSettings as any;

  const patchEntry = (type: BlockType, value: BlockStyleOverride | undefined) => {
    const next = { ...(defaultBlockStyles ?? {}) };
    if (value === undefined) delete next[type];
    else next[type] = value;
    onChange(next);
  };

  return (
    <>
      {BLOCK_DEFAULT_ROWS.map(row => (
        <ModalSection key={row.type} title={ps[row.titleKey] ?? row.type}>
          {ps[row.descKey] && (
            <p className="text-xs text-slate-400 leading-relaxed mb-3">{ps[row.descKey]}</p>
          )}
          <StyleOverrideEditor
            value={defaultBlockStyles?.[row.type]}
            onChange={v => patchEntry(row.type, v)}
            variableNodes={variableNodes}
            allowBound={true}
            fieldsSchema={row.schema}
            rawCssHelp={row.help}
          />
        </ModalSection>
      ))}
    </>
  );
}

// 16×16 line icons, currentColor. Matches the visual weight of other modal icons.

const IconBook = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const IconDocument = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="14" y2="17" />
  </svg>
);

const IconPalette = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.8 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5-4.5-9-10-9z" />
  </svg>
);

const IconImage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconCog = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

