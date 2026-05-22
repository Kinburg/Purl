import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useProjectStore, flattenAssets } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { ImageGenBlock } from '../../types';
import { fsApi, joinPath, toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { generateImageWithProvider, type ComfyProgress } from '../../utils/imageGen/providers';
import { loadComfyWorkflow, loadExampleWorkflows, collectWorkflowFiles, EXAMPLES_PREFIX } from '../../utils/imageGen/workflowLoader';
import { generateImagePromptWithLlm } from '../../utils/imageGen/llmPrompt';
import { StyleChipsEditor } from '../shared/StyleChipsEditor';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import { ImageMappingEditor } from '../shared/ImageMappingEditor';
import NumericInput from '../shared/NumericInput';
import { CellImageBoundGenPanel } from '../shared/CellImageBoundGenModal';
import type { CellImageBound } from '../../types';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import {
  MEDIA_BLOCK_FIELD_SCHEMA,
  MEDIA_BLOCK_RAW_CSS_HELP,
  simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

import { EmojiIcon } from '../shared/EmojiIcons';
function detectExt(imageUrl: string, contentType: string | null): string {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpg';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  const byUrl = imageUrl.split('?')[0].split('.').pop()?.toLowerCase();
  return byUrl || 'png';
}

function randomSeed(): number {
  // Keep within safe integer range for JS and common ComfyUI setups.
  return Math.floor(Math.random() * 4294967295);
}

const ASPECT_RATIOS = [
  { label: '1:1',  w: 1, h: 1 },
  { label: '4:3',  w: 4, h: 3 },
  { label: '3:4',  w: 3, h: 4 },
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
] as const;

export function ImageGenBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: ImageGenBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<ImageGenBlock>) => void;
}) {
  const t = useT();
  const ig = t.imageGenBlock;
  const ag = t.avatarGen;
  const { project, projectDir, updateBlock, addAsset, deleteAssetNode, saveSnapshot } = useProjectStore();
  const cascadeClasses = ['tg-image', ...simpleBlockCascadeClasses(block, project.settings)].join(' ');
  const {
    llmEnabled,
    llmProvider,
    llmUrl,
    llmGeminiApiKey,
    llmGeminiModel,
    llmOpenaiUrl,
    llmOpenaiApiKey,
    llmOpenaiModel,
    llmMaxTokens,
    llmTemperature,
    llmSystemPrompt,
    imageGenProvider,
    comfyUiUrl,
    comfyUiWorkflowsDir,
    pollinationsModel,
    pollinationsToken,
  } = useEditorPrefsStore();

  const update = onUpdate ?? ((p: Partial<ImageGenBlock>) => updateBlock(sceneId, block.id, p as never));
  const variableNodes = useVariableNodes();
  const mode = block.mode ?? 'static';
  const mapping = block.mapping ?? [];
  const [exampleWorkflows, setExampleWorkflows] = useState<string[]>([]);
  const [projectWorkflows, setProjectWorkflows] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [busyImage, setBusyImage] = useState(false);
  const [busyPrompt, setBusyPrompt] = useState(false);
  const [genProgress, setGenProgress] = useState<ComfyProgress | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seedMode = block.seedMode ?? 'random';
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveFolder, setApproveFolder] = useState('');
  const [approveFilename, setApproveFilename] = useState('');

  // Derive default filename: {sanitized-scene-name}-{1-based index among image-gen blocks}
  const defaultApproveFilename = useMemo(() => {
    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) return block.id;
    const ext = block.src.split('.').pop() ?? 'png';
    const safeName = scene.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_а-яёїієґ]/gi, '')
      || 'scene';
    const idx = scene.blocks.filter(b => b.type === 'image-gen').indexOf(block) + 1;
    return `${safeName}-${idx}.${ext}`;
  }, [project.scenes, sceneId, block]);

  // Load workflow list from all three sources: examples, project dir, global user dir.
  useEffect(() => {
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
  }, [projectDir, comfyUiWorkflowsDir]);

  const refreshWorkflows = async () => {
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

  const history = block.history ?? [];
  const imageAssets = useMemo(() => new Set(flattenAssets(project.assetNodes).map(a => a.relativePath)), [project.assetNodes]);
  // Resolve preview: history/ paths live directly under projectDir; assets/ paths inside release/
  const currentPreview = block.src && projectDir
    ? toLocalFileUrl(resolveAssetPath(projectDir, block.src))
    : '';
  const isApproved = block.src.startsWith('assets/');

  const generatePrompt = async (llmMode: 'hint' | 'rephrase' | 'continue') => {
    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene || !llmEnabled) return;
    setBusyPrompt(true);
    try {
      const urlOrApiKey = llmProvider === 'openai' ? llmOpenaiUrl : llmProvider === 'gemini' ? llmGeminiApiKey : llmUrl;
      const model = llmProvider === 'openai' ? llmOpenaiModel : llmGeminiModel;
      const prompt = await generateImagePromptWithLlm(
        {
          provider: llmProvider,
          urlOrApiKey,
          apiKey: llmProvider === 'openai' ? llmOpenaiApiKey : undefined,
          model,
          maxTokens: llmMaxTokens,
          temperature: llmTemperature,
          systemPrompt: llmSystemPrompt,
        },
        project,
        scene,
        block.id,
        block.prompt,
        llmMode,
        block.styleHints ?? [],
      );
      if (prompt) update({ prompt, llmPromptMode: llmMode });
    } catch {
      toast.error(ig.errorGeneratePrompt);
    } finally {
      setBusyPrompt(false);
    }
  };

  const generateImage = async () => {
    if (!projectDir) return toast.error(ig.errorNoProjectDir);
    if (imageGenProvider === 'comfyui' && !block.workflowFile) return toast.error(ig.errorNoWorkflow);
    if (!block.prompt.trim()) return toast.error(ig.errorNoPrompt);

    saveSnapshot();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyImage(true);
    setGenProgress(null);
    try {
      const workflowJson = await loadComfyWorkflow(imageGenProvider, block.workflowFile, comfyUiWorkflowsDir, projectDir);

      const usedSeed = seedMode === 'random' ? randomSeed() : (Number.isFinite(block.seed) ? block.seed : 0);
      const styleHints = block.styleHints ?? [];
      const effectivePrompt = styleHints.length > 0
        ? `${block.prompt.trim()}, ${styleHints.join(', ')}`
        : block.prompt;
      const generated = await generateImageWithProvider(imageGenProvider, {
        baseUrl: comfyUiUrl,
        workflow: workflowJson,
        prompt: effectivePrompt,
        negativePrompt: block.negativePrompt,
        seed: usedSeed,
        pollinationsModel,
        pollinationsToken,
        genWidth: block.genWidth,
        genHeight: block.genHeight,
        onProgress: imageGenProvider === 'comfyui' ? setGenProgress : undefined,
      }, controller.signal);
      // Keep the last used seed visible in editor.
      if (seedMode === 'random') update({ seed: usedSeed });

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
      const genId = crypto.randomUUID();
      // Generated images go to history/ (outside release/assets) — not exported automatically
      const relPath = `history/${block.id}/${genId}.${ext}`;
      const absPath = joinPath(projectDir, relPath);
      await fsApi.mkdir(joinPath(projectDir, `history/${block.id}`));
      await fsApi.writeFileBinary(absPath, bytes);

      const nextHistory = [
        ...history,
        {
          id: genId,
          src: relPath,
          prompt: block.prompt,
          seed: usedSeed,
          createdAt: Date.now(),
          provider: imageGenProvider,
        },
      ];
      update({ src: relPath, history: nextHistory });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Cancelled by user — no toast needed.
      } else {
        console.error('[ImageGen] generation failed:', err);
        toast.error(ig.errorGenerateImage);
      }
    } finally {
      abortRef.current = null;
      setBusyImage(false);
      setGenProgress(null);
    }
  };

  const cancelGeneration = () => {
    abortRef.current?.abort();
  };

  const handleClearHistory = () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      clearConfirmTimerRef.current = setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    // Confirmed — keep only the currently selected entry.
    if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current);
    setClearConfirm(false);
    const kept = history.filter(h => h.src === block.src);
    update({ history: kept });
  };

  const approveImage = () => {
    if (!projectDir || !block.src) return;
    // lastApprovedDir stores the subfolder within assets/ (e.g. "chars" → release/assets/chars)
    // Strip legacy "assets/" prefix in case it was saved before this change
    const raw = block.lastApprovedDir ?? '';
    const subfolder = raw.startsWith('assets/') ? raw.slice('assets/'.length) : raw;
    setApproveFolder(subfolder);
    setApproveFilename(defaultApproveFilename);
    setApproveDialogOpen(true);
  };

  const doApprove = async (folder: string, filename: string) => {
    if (!projectDir || !block.src) return;
    // folder is the subfolder within release/assets/ (may be empty)
    const cleanSubfolder = folder.replace(/^[/\\]+|[/\\]+$/g, '');
    if (cleanSubfolder.includes('..')) {
      toast.error(ig.approveOutsideRelease);
      return;
    }
    // relPath is relative to release/ — always inside assets/
    const relPath = cleanSubfolder ? `assets/${cleanSubfolder}/${filename}` : `assets/${filename}`;
    const savePath = joinPath(projectDir, 'release', relPath);

    setApproveDialogOpen(false);
    try {
      const parentAbs = joinPath(projectDir, 'release', 'assets', cleanSubfolder || '.');
      await fsApi.mkdir(parentAbs);

      const srcAbs = resolveAssetPath(projectDir, block.src);
      await fsApi.copyFile(srcAbs, savePath);

      if (!imageAssets.has(relPath)) {
        addAsset(null, {
          name: filename,
          assetType: 'image',
          relativePath: relPath,
        });
      }

      const approvedHistoryId = history.find(h => h.src === block.src)?.id;
      update({ src: relPath, approvedHistoryId, lastApprovedDir: cleanSubfolder || undefined });
      toast.success(ig.approvedBadge);
    } catch {
      toast.error(ig.errorApprove);
    }
  };

  const unapproveImage = async () => {
    if (!projectDir || !block.src || !isApproved) return;
    try {
      const absPath = resolveAssetPath(projectDir, block.src);
      // Remove file from disk
      try { await fsApi.deleteFile(absPath); } catch { /* already gone */ }
      // Remove from asset tree
      const assetNode = flattenAssets(project.assetNodes).find(a => a.relativePath === block.src);
      if (assetNode) deleteAssetNode(assetNode.id);
      // Revert block.src to the history entry that was approved
      const historyEntry = history.find(h => h.id === block.approvedHistoryId);
      update({ src: historyEntry?.src ?? '', approvedHistoryId: undefined });
    } catch {
      toast.error(ig.errorUnapprove);
    }
  };

  const applyAspectRatio = (wRatio: number, hRatio: number) => {
    const base = block.genWidth && block.genWidth > 0 ? block.genWidth : 1024;
    const newWidth = base;
    const newHeight = Math.round(base * hRatio / wRatio);
    update({ genWidth: newWidth, genHeight: newHeight });
  };

  return (
    <div className="flex flex-col gap-2">

      {/* ── Mode selector ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.imageBlock.modeLabel}</label>
        <div className="flex gap-1">
          {([
            ['static', t.imageBlock.modeStatic],
            ['bound',  t.imageBlock.modeBound],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => update({ mode: m })}
              className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
                mode === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Shared generation settings (both modes) ────────────────────── */}
      <div className="flex flex-col gap-2 p-3 rounded bg-slate-900/40 border border-slate-700/50">
        {imageGenProvider === 'comfyui' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0">{ig.workflowLabel}</label>
            <select
              className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
              value={block.workflowFile}
              onChange={e => update({ workflowFile: e.target.value })}
            >
              <option value="">{ag.workflowNone}</option>
              {projectWorkflows.length > 0 && (
                  <optgroup label={ag.workflowGroupProject}>
                    {projectWorkflows.map(wf => (
                        <option key={wf} value={wf}>{wf.replace(/^comfyUI_workflows\//, '')}</option>
                    ))}
                  </optgroup>
              )}
              {workflows.length > 0 && (
                  <optgroup label={ag.workflowGroupCustom}>
                    {workflows.map(wf => <option key={wf} value={wf}>{wf}</option>)}
                  </optgroup>
              )}
              {exampleWorkflows.length > 0 && (
                  <optgroup label={ag.workflowGroupExamples}>
                    {exampleWorkflows.map(wf => (
                        <option key={wf} value={wf}>{wf.slice(EXAMPLES_PREFIX.length)}</option>
                    ))}
                  </optgroup>
              )}
            </select>
            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
              onClick={refreshWorkflows}
            >
              {ig.workflowRefresh}
            </button>
          </div>
        )}

        {/* Generation size */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0">{ig.genSizeLabel}</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            <NumericInput
              min={0}
              className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
              placeholder={ig.genWidthPlaceholder}
              value={block.genWidth || 0}
              onChange={v => update({ genWidth: v })}
            />
            <span className="text-xs text-slate-500">×</span>
            <NumericInput
              min={0}
              className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
              placeholder={ig.genHeightPlaceholder}
              value={block.genHeight || 0}
              onChange={v => update({ genHeight: v })}
            />
            <div className="flex gap-0.5">
              {ASPECT_RATIOS.map(({ label, w, h }) => (
                <button
                  key={label}
                  type="button"
                  className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer"
                  onClick={() => applyAspectRatio(w, h)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Seed (Lock-seed unified UI) */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-400 w-20 shrink-0">{ag.seedLabel}</label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-indigo-500 cursor-pointer"
              checked={seedMode === 'manual'}
              onChange={e => update({ seedMode: e.target.checked ? 'manual' : 'random' })}
            />
            <span className="text-xs text-slate-300">{ag.seedLock}</span>
          </label>
          {seedMode === 'manual' && (
            <>
              <NumericInput
                min={0}
                max={4294967295}
                className="w-32 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                value={block.seed ?? 0}
                onChange={v => update({ seed: v })}
              />
              <button
                type="button"
                className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                title="Randomize seed"
                onClick={() => update({ seed: randomSeed() })}
              >
                {ag.seedRandomize}
              </button>
            </>
          )}
        </div>

        {/* Style hints */}
        <StyleChipsEditor
          value={block.styleHints ?? []}
          onChange={v => update({ styleHints: v })}
          label={ig.styleHintsLabel}
          customPlaceholder={ig.styleHintsCustomPlaceholder}
          addBtn={ig.styleHintsAddBtn}
        />
      </div>

      {/* ── Static-mode prompt + generation UI ────────────────────────── */}
      {mode === 'static' && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0">{ig.promptModeLabel}</label>
            <div className="flex gap-1">
              {([
                ['manual', ig.promptModeManual],
                ['llm', ig.promptModeLlm],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => update({ promptMode: m })}
                  className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
                    block.promptMode === m ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0 pt-2">{ig.promptLabel}</label>
            <div className="flex-1 flex flex-col gap-1.5">
              <textarea
                className="w-full bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 min-h-[70px]"
                placeholder={ig.promptPlaceholder}
                value={block.prompt}
                onChange={e => update({ prompt: e.target.value })}
              />
              {block.promptMode === 'llm' && (
                <div className="flex items-center gap-1 flex-wrap">
                  {([
                    ['continue', ig.llmModeContinue],
                    ['rephrase', ig.llmModeRephrase],
                    ['hint',     ig.llmModeHint],
                  ] as const).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      disabled={busyPrompt || !llmEnabled}
                      className={`px-2.5 py-1 text-xs rounded disabled:opacity-50 cursor-pointer transition-colors ${
                        (block.llmPromptMode ?? 'hint') === m
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                      onClick={() => generatePrompt(m)}
                    >
                      {busyPrompt && (block.llmPromptMode ?? 'hint') === m ? ig.llmGenerating : label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0 pt-2">{ig.negativePromptLabel}</label>
            <textarea
              className="flex-1 bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 min-h-[50px]"
              placeholder={ig.negativePromptPlaceholder}
              value={block.negativePrompt ?? ''}
              onChange={e => update({ negativePrompt: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busyImage}
                className="px-3 py-1.5 text-xs rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white cursor-pointer"
                onClick={generateImage}
              >
                {busyImage ? ig.generatingImage : ig.generateImage}
              </button>
              {busyImage && (
                <>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white cursor-pointer"
                    onClick={cancelGeneration}
                  >
                    {ig.cancelGeneration}
                  </button>
                  {genProgress && (
                    <span className="text-[10px] text-slate-400">
                      {genProgress.current}/{genProgress.total}
                    </span>
                  )}
                </>
              )}
            </div>
            {busyImage && (
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
          </div>

          {/* History */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0">{ig.historyLabel}</label>
            <select
              className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
              value={block.src}
              onChange={e => update({ src: e.target.value, approvedHistoryId: undefined })}
            >
              <option value="">{ig.historyEmpty}</option>
              {[...history].reverse().map(h => (
                <option key={h.id} value={h.src}>
                  {new Date(h.createdAt).toLocaleString()} · {h.id.slice(0, 8)}{h.seed !== undefined ? ` · seed ${h.seed}` : ''}
                </option>
              ))}
            </select>
            {history.length > 0 && (
              <button
                type="button"
                className={`px-2 py-1 text-xs rounded cursor-pointer transition-colors ${
                  clearConfirm
                    ? 'bg-red-700 hover:bg-red-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                }`}
                onClick={handleClearHistory}
              >
                {clearConfirm ? ig.clearHistoryConfirm : ig.clearHistory}
              </button>
            )}
          </div>

          {/* Approve / Unapprove */}
          {block.src && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 w-20 shrink-0" />
              {isApproved ? (
                <>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/50 border border-emerald-700 text-emerald-400">
                    <EmojiIcon name="check" size={20} /> {ig.approvedBadge}
                  </span>
                  <button
                    type="button"
                    title={ig.unapproveImageTitle}
                    className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-red-800 text-slate-300 hover:text-white cursor-pointer transition-colors"
                    onClick={unapproveImage}
                  >
                    {ig.unapproveImage}
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-900/50 border border-amber-700 text-amber-400">
                    <EmojiIcon name="warning" size={20} /> {ig.draftBadge}
                  </span>
                  <button
                    type="button"
                    title={ig.approveImageTitle}
                    className="px-2 py-1 text-xs rounded bg-emerald-800 hover:bg-emerald-700 text-white cursor-pointer transition-colors"
                    onClick={approveImage}
                  >
                    {ig.approveImage}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{ig.altLabel}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          placeholder={ig.altPlaceholder}
          value={block.alt}
          onChange={e => update({ alt: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{ig.widthLabel}</label>
        <NumericInput
          min={0}
          className="w-24 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          placeholder={ig.widthPlaceholder}
          value={block.width || 0}
          onChange={v => update({ width: v })}
        />
      </div>

      {mode === 'static' && currentPreview && (
        <>
          {/* Cascade-wrapped preview — width mirrors export's <img width="X">
              so border-radius/border-width render in real proportions. */}
          <div className={cascadeClasses}>
            <img
              src={currentPreview}
              alt={block.alt || 'generated'}
              width={block.width > 0 ? block.width : undefined}
              title={ig.doubleClickToExpand}
              style={{ cursor: 'zoom-in' }}
              onDoubleClick={() => setLightboxOpen(true)}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          {lightboxOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
              onClick={() => setLightboxOpen(false)}
            >
              <img
                src={currentPreview}
                alt={block.alt || 'generated'}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
        </>
      )}

      {/* ── Bound mode section ─────────────────────────────────────────── */}
      {mode === 'bound' && (
        <div className="flex flex-col gap-2 pl-2 border-l-2 border-indigo-800/50">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0">{t.imageBlock.variableLabel}</label>
            <VariablePicker
              value={block.variableId ?? ''}
              onChange={id => update({ variableId: id })}
              nodes={variableNodes}
              placeholder={t.imageBlock.selectVariable}
            />
          </div>

          <ImageMappingEditor
            mapping={mapping}
            onChange={m => update({ mapping: m })}
            defaultSrc={block.defaultSrc ?? ''}
            onDefaultSrcChange={defaultSrc => update({ defaultSrc })}
            assetNodes={project.assetNodes}
            hideDefault
          />

          {block.variableId && (
            <div className="rounded border border-slate-700/60 bg-slate-900/30">
              <CellImageBoundGenPanel
                cell={{
                  type: 'image-bound',
                  variableId: block.variableId,
                  mapping,
                  defaultSrc: block.defaultSrc ?? '',
                  objectFit: 'cover',
                  genSettings: block.genSettings,
                } satisfies CellImageBound}
                cellId={block.id}
                variableId={block.variableId}
                sceneId={sceneId}
                pathCategory="blocks"
                hideSharedSettings
                shared={{
                  workflowFile: block.workflowFile,
                  genWidth: block.genWidth ?? 0,
                  genHeight: block.genHeight ?? 0,
                  styleHints: block.styleHints ?? [],
                  seedLocked: seedMode === 'manual',
                  lockedSeed: block.seed ?? 0,
                  useRefImage: block.useRefImage ?? false,
                }}
                onSharedChange={patch => {
                  const out: Partial<ImageGenBlock> = {};
                  if (patch.workflowFile !== undefined) out.workflowFile = patch.workflowFile;
                  if (patch.genWidth !== undefined)     out.genWidth = patch.genWidth;
                  if (patch.genHeight !== undefined)    out.genHeight = patch.genHeight;
                  if (patch.styleHints !== undefined)   out.styleHints = patch.styleHints;
                  if (patch.seedLocked !== undefined)   out.seedMode = patch.seedLocked ? 'manual' : 'random';
                  if (patch.lockedSeed !== undefined)   out.seed = patch.lockedSeed;
                  if (patch.useRefImage !== undefined)  out.useRefImage = patch.useRefImage;
                  update(out);
                }}
                onSave={updated => {
                  update({
                    variableId: updated.variableId,
                    mapping: updated.mapping,
                    defaultSrc: updated.defaultSrc,
                    // Only persist `slots` from the panel's genSettings — shared settings live at block level.
                    genSettings: updated.genSettings
                      ? { provider: imageGenProvider, slots: updated.genSettings.slots }
                      : undefined,
                  });
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Cascade-based custom style override (static only — bound is at project-defaults level) */}
      <details className="border border-slate-700/60 rounded bg-slate-900/30">
        <summary className="text-xs text-slate-300 px-2 py-1.5 cursor-pointer select-none hover:bg-slate-800/50">
          {t.styleOverride.sectionTitle}
        </summary>
        <div className="px-2 pb-2 pt-1">
          <StyleOverrideEditor
            value={block.customStyle}
            onChange={v => update({ customStyle: v })}
            variableNodes={variableNodes}
            allowBound={false}
            fieldsSchema={MEDIA_BLOCK_FIELD_SCHEMA}
            rawCssHelp={MEDIA_BLOCK_RAW_CSS_HELP}
          />
        </div>
      </details>

      <BlockEffectsPanel delay={block.delay} onDelayChange={v => update({ delay: v })} />

      {approveDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setApproveDialogOpen(false)}
        >
          <div
            className="relative bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-96 p-4 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-200">{ig.approveSaveTitle}</h3>

            {currentPreview && (
              <img
                src={currentPreview}
                alt={block.alt || 'generated'}
                className="w-full max-h-36 object-contain rounded border border-slate-700 bg-slate-900"
              />
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">{ig.approveFolderLabel}</label>
              <div className="flex items-center gap-1 bg-slate-700 rounded px-2 py-1 text-sm text-slate-300">
                <span className="text-slate-500 select-none">release/assets/</span>
                <input
                  className="flex-1 bg-transparent outline-none text-white placeholder:text-slate-500"
                  value={approveFolder}
                  onChange={e => setApproveFolder(e.target.value)}
                  placeholder="chars"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">{ig.approveFilenameLabel}</label>
              <input
                className="bg-slate-700 rounded px-2 py-1 text-sm text-white outline-none border border-slate-600 focus:border-indigo-500"
                value={approveFilename}
                onChange={e => setApproveFilename(e.target.value)}
                autoComplete="off"
                onKeyDown={e => { if (e.key === 'Enter' && approveFilename.trim()) doApprove(approveFolder, approveFilename.trim()); }}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 text-xs text-slate-300 hover:text-white rounded border border-slate-600 hover:border-slate-400 transition-colors cursor-pointer"
                onClick={() => setApproveDialogOpen(false)}
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={!approveFilename.trim()}
                className="px-3 py-1.5 text-xs text-white rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 transition-colors cursor-pointer"
                onClick={() => doApprove(approveFolder, approveFilename.trim())}
              >
                {ig.approveSaveButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
