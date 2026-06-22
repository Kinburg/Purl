/**
 * AI image-generation panel for variable-bound images — the bound mode of
 * ImageBlock / ImageGenBlock. Mirrors AvatarGenModal but operates on
 * `ImageBoundGenInput` mapping entries instead of character avatar slots.
 *
 * File paths:
 *   History : history/{category}/{location}/{varPath}/{slotId}/{genId}.{ext}
 *   Approved: assets/{category}/{location}/{varPath}/{filename}
 *
 * Where:
 *   category = `pathCategory` prop ('cells' legacy default | 'blocks')
 *   location = sanitised scene name | "_panel" (global, no scene)
 *   varPath  = full dot-path of the variable, e.g. "warrior.sword"
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useProjectStore, flattenAssets } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { fsApi, joinPath, toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { bytesToBase64 } from '../../utils/base64';
import type {
  ImageBoundMapping,
  AvatarGenSettings, AvatarGenSlotData, AvatarGenHistoryEntry,
  AssetTreeNode,
} from '../../types';
import { useT } from '../../i18n';
import { generateImageWithProvider, type ComfyProgress } from '../../utils/imageGen/providers';
import { loadComfyWorkflow, loadExampleWorkflows, collectWorkflowFiles, EXAMPLES_PREFIX } from '../../utils/imageGen/workflowLoader';
import { generateAvatarPromptWithLlm } from '../../utils/imageGen/llmPrompt';
import { getVariablePath, flattenVariables } from '../../utils/treeUtils';
import NumericInput from './NumericInput';
import { StyleChipsEditor } from './StyleChipsEditor';
import { ImageAssetPicker } from './ImageMappingEditor';

// ─── helpers ──────────────────────────────────────────────────────────────────

import { detectExt } from '../../utils/detectExt';

function randomSeed(): number {
  return Math.floor(Math.random() * 4294967295);
}

/** Keep dots (for nested var paths), replace unsafe chars with underscore. */
function sanitizePathSegment(value: string): string {
  return value
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'var';
}

/** Sanitise a scene name for use in a filesystem path. */
function sanitizeSceneName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_а-яёїієґ]/gi, '')
    || 'scene';
}

function slotFilename(slotId: string, mapping: ImageBoundMapping | null, ext: string): string {
  if (slotId === 'default') return `default.${ext}`;
  if (!mapping) return `${sanitizePathSegment(slotId)}.${ext}`;
  if (mapping.matchType === 'range') return `${mapping.rangeMin ?? '0'}-${mapping.rangeMax ?? '0'}.${ext}`;
  return `${sanitizePathSegment(mapping.value || slotId)}.${ext}`;
}

function slotLabel(slotId: string, mapping: ImageBoundMapping | null, defaultLabel: string): string {
  if (slotId === 'default') return defaultLabel;
  if (!mapping) return slotId;
  if (mapping.matchType === 'range') return `${mapping.rangeMin ?? ''}–${mapping.rangeMax ?? ''}`;
  return mapping.value || slotId;
}

const ASPECT_RATIOS = [
  { label: '1:1',  w: 1, h: 1 },
  { label: '3:4',  w: 3, h: 4 },
  { label: '2:3',  w: 2, h: 3 },
  { label: '9:16', w: 9, h: 16 },
] as const;

// ─── slot state ───────────────────────────────────────────────────────────────

interface SlotState {
  slotId: string;
  label: string;
  mappingEntry: ImageBoundMapping | null;
  prompt: string;
  negativePrompt: string;
  hint: string;
  history: AvatarGenHistoryEntry[];
  currentSrc: string;
  llmMode: 'hint' | 'rephrase' | 'continue';
  busy: boolean;
  busyPrompt: boolean;
  progress: ComfyProgress | null;
}

function initSlots(cell: ImageBoundGenInput, defaultLabel: string): SlotState[] {
  const saved = cell.genSettings?.slots ?? [];
  const find = (id: string) => saved.find(s => s.slotId === id);

  const defaultSlot: SlotState = {
    slotId: 'default',
    label: defaultLabel,
    mappingEntry: null,
    prompt: find('default')?.prompt ?? '',
    negativePrompt: find('default')?.negativePrompt ?? '',
    hint: '',
    history: find('default')?.history ?? [],
    currentSrc: find('default')?.currentSrc ?? cell.defaultSrc ?? '',
    llmMode: 'hint',
    busy: false, busyPrompt: false, progress: null,
  };

  const variantSlots: SlotState[] = cell.mapping.map(m => {
    const id = m.id ?? crypto.randomUUID();
    const e = find(id);
    return {
      slotId: id,
      label: slotLabel(id, m, defaultLabel),
      mappingEntry: m,
      prompt: e?.prompt ?? '',
      negativePrompt: e?.negativePrompt ?? '',
      hint: e?.hint ?? '',
      history: e?.history ?? [],
      currentSrc: e?.currentSrc ?? m.src ?? '',
      llmMode: 'hint',
      busy: false, busyPrompt: false, progress: null,
    };
  });

  return [defaultSlot, ...variantSlots];
}

// ─── props ────────────────────────────────────────────────────────────────────

/**
 * Input contract for the bound-image AI-gen panel: the bound-mode fields of an
 * ImageBlock / ImageGenBlock (driving variable + value→image mapping + per-slot
 * generation settings). Formerly the `CellImageBound` cell type.
 */
export interface ImageBoundGenInput {
  variableId: string;
  mapping: ImageBoundMapping[];
  defaultSrc: string;
  genSettings?: AvatarGenSettings;
}

export interface SharedGenSettings {
  workflowFile: string;
  genWidth: number;
  genHeight: number;
  styleHints: string[];
  seedLocked: boolean;
  lockedSeed: number;
  useRefImage: boolean;
}

interface PanelProps {
  cell: ImageBoundGenInput;
  cellId: string;
  variableId: string;
  sceneId: string;
  onSave: (updated: ImageBoundGenInput) => void;
  /**
   * Path category under history/ and assets/. Default 'cells' preserves
   * existing layout for table/panel cells; the inline image-gen block uses 'blocks'.
   */
  pathCategory?: string;
  /** Controlled shared settings — when omitted, panel manages its own state. */
  shared?: SharedGenSettings;
  onSharedChange?: (patch: Partial<SharedGenSettings>) => void;
  /** Hide the panel's built-in shared-settings header (parent renders its own). */
  hideSharedSettings?: boolean;
}

// ─── panel ────────────────────────────────────────────────────────────────────

export function ImageBoundGenPanel({
  cell, cellId: _cellId, variableId, sceneId, onSave,
  pathCategory = 'cells',
  shared: sharedExternal,
  onSharedChange,
  hideSharedSettings = false,
}: PanelProps) {
  const t = useT();
  const ag = t.avatarGen;   // generic strings shared with avatar gen
  const cb = t.cellBoundGen; // overrides for cell-specific context
  const project    = useProjectStore(s => s.project);
  const projectDir = useProjectStore(s => s.projectDir);
  const addAsset   = useProjectStore(s => s.addAsset);
  const llmEnabled          = useEditorPrefsStore(s => s.llmEnabled);
  const llmProvider         = useEditorPrefsStore(s => s.llmProvider);
  const llmUrl              = useEditorPrefsStore(s => s.llmUrl);
  const llmGeminiApiKey     = useEditorPrefsStore(s => s.llmGeminiApiKey);
  const llmGeminiModel      = useEditorPrefsStore(s => s.llmGeminiModel);
  const llmOpenaiUrl        = useEditorPrefsStore(s => s.llmOpenaiUrl);
  const llmOpenaiApiKey     = useEditorPrefsStore(s => s.llmOpenaiApiKey);
  const llmOpenaiModel      = useEditorPrefsStore(s => s.llmOpenaiModel);
  const llmMaxTokens        = useEditorPrefsStore(s => s.llmMaxTokens);
  const llmTemperature      = useEditorPrefsStore(s => s.llmTemperature);
  const llmSystemPrompt     = useEditorPrefsStore(s => s.llmSystemPrompt);
  const imageGenProvider    = useEditorPrefsStore(s => s.imageGenProvider);
  const comfyUiUrl          = useEditorPrefsStore(s => s.comfyUiUrl);
  const comfyUiWorkflowsDir = useEditorPrefsStore(s => s.comfyUiWorkflowsDir);
  const pollinationsModel   = useEditorPrefsStore(s => s.pollinationsModel);
  const pollinationsToken   = useEditorPrefsStore(s => s.pollinationsToken);

  const defaultLabel = ag.slotLabelDefault;

  // ── Derive stable path segments ──────────────────────────────────────────

  /** Full dot-path of the variable, e.g. "warrior.sword". */
  const varDotPath = useMemo(() => {
    const path = getVariablePath(variableId, project.variableNodes);
    if (path) return path;
    // fallback: just the variable leaf name
    return flattenVariables(project.variableNodes).find(v => v.id === variableId)?.name ?? 'var';
  }, [variableId, project.variableNodes]);

  const safeVarPath = useMemo(() => sanitizePathSegment(varDotPath), [varDotPath]);

  /**
   * Location prefix inside "cells/" folder:
   *   - scene name (sanitised) if inside a scene table block
   *   - "_panel" if inside the global sidebar panel
   */
  const locationPrefix = useMemo(() => {
    if (!sceneId) return '_panel';
    const scene = project.scenes.find(s => s.id === sceneId);
    return scene ? sanitizeSceneName(scene.name) : 'scene';
  }, [sceneId, project.scenes]);

  // ── Provider settings ────────────────────────────────────────────────────
  // Either controlled (via `shared` + `onSharedChange` props) or self-managed.

  const isControlled = !!sharedExternal && !!onSharedChange;
  const [internalShared, setInternalShared] = useState<SharedGenSettings>(() => ({
    workflowFile: cell.genSettings?.workflowFile ?? '',
    genWidth: cell.genSettings?.genWidth ?? 0,
    genHeight: cell.genSettings?.genHeight ?? 0,
    styleHints: cell.genSettings?.styleHints ?? [],
    seedLocked: cell.genSettings?.lockedSeed !== undefined,
    lockedSeed: cell.genSettings?.lockedSeed ?? randomSeed(),
    useRefImage: cell.genSettings?.useRefImage ?? false,
  }));
  const shared = isControlled ? sharedExternal! : internalShared;
  const updateShared = (patch: Partial<SharedGenSettings>) => {
    if (isControlled) onSharedChange!(patch);
    else setInternalShared(prev => ({ ...prev, ...patch }));
  };
  const { workflowFile, genWidth, genHeight, styleHints, seedLocked, lockedSeed, useRefImage } = shared;
  const setWorkflowFile = (v: string)       => updateShared({ workflowFile: v });
  const setGenWidth     = (v: number)       => updateShared({ genWidth: v });
  const setGenHeight    = (v: number)       => updateShared({ genHeight: v });
  const setStyleHints   = (v: string[])     => updateShared({ styleHints: v });
  const setSeedLocked   = (v: boolean)      => updateShared({ seedLocked: v });
  const setLockedSeed   = (v: number)       => updateShared({ lockedSeed: v });
  const setUseRefImage  = (v: boolean)      => updateShared({ useRefImage: v });

  const [slots, setSlots] = useState<SlotState[]>(() => initSlots(cell, defaultLabel));
  const abortRefs = useRef<Map<string, AbortController>>(new Map());
  const [exampleWorkflows, setExampleWorkflows] = useState<string[]>([]);
  const [projectWorkflows, setProjectWorkflows] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<string[]>([]);

  // Sync slots when cell.mapping changes externally (e.g. user edits mapping editor inline).
  useEffect(() => {
    setSlots(prev => {
      const findPrev = (id: string) => prev.find(s => s.slotId === id);
      const findSaved = (id: string) => cell.genSettings?.slots?.find(s => s.slotId === id);

      const def = findPrev('default');
      const saved = findSaved('default');
      const defaultSlot: SlotState = def ?? {
        slotId: 'default',
        label: defaultLabel,
        mappingEntry: null,
        prompt: saved?.prompt ?? '',
        negativePrompt: saved?.negativePrompt ?? '',
        hint: '',
        history: saved?.history ?? [],
        currentSrc: saved?.currentSrc ?? cell.defaultSrc ?? '',
        llmMode: 'hint',
        busy: false, busyPrompt: false, progress: null,
      };

      const variantSlots: SlotState[] = cell.mapping.map(m => {
        const id = m.id ?? crypto.randomUUID();
        const existing = findPrev(id);
        const label = slotLabel(id, m, defaultLabel);
        if (existing) return { ...existing, label, mappingEntry: m };
        const e = findSaved(id);
        return {
          slotId: id, label, mappingEntry: m,
          prompt: e?.prompt ?? '',
          negativePrompt: e?.negativePrompt ?? '',
          hint: e?.hint ?? '',
          history: e?.history ?? [],
          currentSrc: e?.currentSrc ?? m.src ?? '',
          llmMode: 'hint',
          busy: false, busyPrompt: false, progress: null,
        };
      });

      return [defaultSlot, ...variantSlots];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.mapping]);

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

  // ── helpers ──────────────────────────────────────────────────────────────

  const updateSlot = (slotId: string, patch: Partial<SlotState>) =>
    setSlots(prev => prev.map(s => s.slotId === slotId ? { ...s, ...patch } : s));

  const buildGenSettings = (currentSlots: SlotState[], hints = styleHints): AvatarGenSettings => ({
    provider: imageGenProvider,
    workflowFile: imageGenProvider === 'comfyui' ? workflowFile : undefined,
    genWidth: genWidth || undefined,
    genHeight: genHeight || undefined,
    styleHints: hints.length > 0 ? hints : undefined,
    useRefImage: (imageGenProvider === 'comfyui' && useRefImage) ? true : undefined,
    lockedSeed: seedLocked ? lockedSeed : undefined,
    slots: currentSlots.map(s => ({
      slotId: s.slotId,
      prompt: s.prompt,
      negativePrompt: s.negativePrompt || undefined,
      hint: s.hint || undefined,
      history: s.history,
      currentSrc: s.currentSrc,
    } satisfies AvatarGenSlotData)),
  });

  const persistGenSettings = (currentSlots: SlotState[]) => {
    onSave({ ...cell, genSettings: buildGenSettings(currentSlots) });
  };

  // ── generate image ────────────────────────────────────────────────────────

  const generateForSlot = async (slotId: string) => {
    if (!projectDir) { toast.error(ag.errorNoProjectDir); return; }
    if (imageGenProvider === 'comfyui' && !workflowFile) { toast.error(ag.errorNoWorkflow); return; }
    const slot = slots.find(s => s.slotId === slotId);
    if (!slot) return;
    if (!slot.prompt.trim()) { toast.error(ag.errorNoPrompt); return; }

    const controller = new AbortController();
    abortRefs.current.set(slotId, controller);
    updateSlot(slotId, { busy: true, progress: null });

    try {
      const workflowJson = await loadComfyWorkflow(imageGenProvider, workflowFile, comfyUiWorkflowsDir, projectDir);

      const seed = seedLocked ? lockedSeed : randomSeed();
      const effectivePrompt = styleHints.length > 0
        ? `${slot.prompt.trim()}. Style: ${styleHints.join(', ')}`
        : slot.prompt;

      // Load reference image (default slot) if enabled — ComfyUI only
      let imageBase64: string | undefined;
      if (imageGenProvider === 'comfyui' && useRefImage && slotId !== 'default') {
        const defaultSlot = slots.find(s => s.slotId === 'default');
        if (defaultSlot?.currentSrc && projectDir) {
          try {
            const absPath = resolveAssetPath(projectDir, defaultSlot.currentSrc);
            const fileUrl = toLocalFileUrl(absPath);
            const imgRes = await fsApi.httpRequestBinary({ url: fileUrl });
            if (imgRes.status >= 200 && imgRes.status < 300) {
              imageBase64 = bytesToBase64(imgRes.bytes);
            }
          } catch { /* non-fatal */ }
        }
      }

      const generated = await generateImageWithProvider(imageGenProvider, {
        baseUrl: comfyUiUrl,
        workflow: workflowJson,
        prompt: effectivePrompt,
        negativePrompt: slot.negativePrompt || undefined,
        seed,
        pollinationsModel: pollinationsModel || undefined,
        pollinationsToken: pollinationsToken || undefined,
        genWidth: genWidth || undefined,
        genHeight: genHeight || undefined,
        imageBase64,
        onProgress: imageGenProvider === 'comfyui'
          ? (p) => updateSlot(slotId, { progress: p })
          : undefined,
      }, controller.signal);

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
      // history/cells/{location}/{varPath}/{slotId}/{genId}.{ext}
      const histDir  = `history/${pathCategory}/${locationPrefix}/${safeVarPath}/${slotId}`;
      const relPath  = `${histDir}/${genId}.${ext}`;
      const absPath  = joinPath(projectDir, relPath);
      await fsApi.mkdir(joinPath(projectDir, histDir));
      await fsApi.writeFileBinary(absPath, bytes);

      const entry: AvatarGenHistoryEntry = {
        id: genId, src: relPath, prompt: slot.prompt, seed, createdAt: Date.now(),
      };

      setSlots(prev => {
        const next = prev.map(s => s.slotId === slotId
          ? { ...s, history: [...s.history, entry], currentSrc: relPath, busy: false, progress: null }
          : s,
        );
        persistGenSettings(next);
        return next;
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[ImageBoundGen] generation failed:', err);
        toast.error(ag.errorGenerateImage);
      }
      updateSlot(slotId, { busy: false, progress: null });
    } finally {
      abortRefs.current.delete(slotId);
    }
  };

  const cancelForSlot = (slotId: string) => abortRefs.current.get(slotId)?.abort();

  // ── generate prompt ───────────────────────────────────────────────────────

  const generatePromptForSlot = async (slotId: string, llmMode: SlotState['llmMode']) => {
    if (!llmEnabled) return;
    const slot = slots.find(s => s.slotId === slotId);
    if (!slot) return;
    updateSlot(slotId, { busyPrompt: true, llmMode });

    const isVariant = slotId !== 'default';

    try {
      const urlOrApiKey = llmProvider === 'openai' ? llmOpenaiUrl : llmProvider === 'gemini' ? llmGeminiApiKey : llmUrl;
      const model = llmProvider === 'openai' ? llmOpenaiModel : llmGeminiModel;
      const currentPromptArg = isVariant ? slot.hint : slot.prompt;
      const referencePrompt  = isVariant ? slots.find(s => s.slotId === 'default')?.prompt : undefined;

      const prompt = await generateAvatarPromptWithLlm(
        {
          provider: llmProvider, urlOrApiKey,
          apiKey: llmProvider === 'openai' ? llmOpenaiApiKey : undefined,
          model, maxTokens: llmMaxTokens, temperature: llmTemperature, systemPrompt: llmSystemPrompt,
        },
        project,
        '',        // no character name — generic image context
        undefined, // no character description
        slot.label,
        currentPromptArg,
        isVariant ? 'hint' : llmMode,
        [],
        undefined,
        referencePrompt,
      );
      if (prompt) updateSlot(slotId, { prompt, busyPrompt: false });
      else updateSlot(slotId, { busyPrompt: false });
    } catch {
      toast.error(ag.errorGeneratePrompt);
      updateSlot(slotId, { busyPrompt: false });
    }
  };

  // ── approve all ───────────────────────────────────────────────────────────

  const approveAll = async () => {
    if (!projectDir) { toast.error(ag.errorNoProjectDir); return; }

    let updatedCell: ImageBoundGenInput = { ...cell };
    const updatedSlots = [...slots];
    let anyApproved = false;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot.currentSrc || !slot.currentSrc.startsWith('history/')) continue;

      const ext      = slot.currentSrc.split('.').pop() ?? 'png';
      const filename = slotFilename(slot.slotId, slot.mappingEntry, ext);
      // assets/cells/{location}/{varPath}/{filename}
      const subdir   = `assets/${pathCategory}/${locationPrefix}/${safeVarPath}`;
      const relPath  = `${subdir}/${filename}`;
      const savePath = joinPath(projectDir, 'release', relPath);
      const srcAbs   = resolveAssetPath(projectDir, slot.currentSrc);

      try {
        await fsApi.mkdir(joinPath(projectDir, 'release', subdir));
        await fsApi.copyFile(srcAbs, savePath);

        const currentAssets = flattenAssets(project.assetNodes);
        if (!currentAssets.find(a => a.relativePath === relPath)) {
          addAsset(null, { name: filename, assetType: 'image', relativePath: relPath });
        }

        updatedSlots[i] = { ...slot, currentSrc: relPath };

        if (slot.slotId === 'default') {
          updatedCell = { ...updatedCell, defaultSrc: relPath };
        } else {
          updatedCell = {
            ...updatedCell,
            mapping: updatedCell.mapping.map(m =>
              m.id === slot.slotId ? { ...m, src: relPath } : m,
            ),
          };
        }
        anyApproved = true;
      } catch {
        toast.error(cb.errorApprove);
      }
    }

    if (anyApproved) {
      setSlots(updatedSlots);
      onSave({ ...updatedCell, genSettings: buildGenSettings(updatedSlots) });
      toast.success(cb.approveSuccess);
    }
  };

  const applyAspectRatio = (wRatio: number, hRatio: number) => {
    const base = genWidth && genWidth > 0 ? genWidth : 1024;
    setGenWidth(base);
    setGenHeight(Math.round(base * hRatio / wRatio));
  };

  const anyBusy = slots.some(s => s.busy);
  const hasPendingApprovals = slots.some(s => s.currentSrc.startsWith('history/'));
  const showRefImageOption  = imageGenProvider === 'comfyui';
  const defaultSlot = slots.find(s => s.slotId === 'default');

  return (
    <div className="p-4 flex flex-col gap-4">

          {/* Provider settings */}
          {!hideSharedSettings && (
          <div className="flex flex-col gap-2 p-3 rounded bg-slate-900/60 border border-slate-700/50">
            {imageGenProvider === 'comfyui' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 w-24 shrink-0">{ag.workflowLabel}</label>
                <select
                  className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
                  value={workflowFile} onChange={e => setWorkflowFile(e.target.value)}
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
                <button type="button"
                  className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                  onClick={refreshWorkflows}
                >{ag.workflowRefresh}</button>
              </div>
            )}

            {/* Generation size */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 w-24 shrink-0">{ag.genSizeLabel}</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                <NumericInput min={0}
                  className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                  placeholder={ag.genWidthPlaceholder} value={genWidth}
                  onChange={setGenWidth} />
                <span className="text-xs text-slate-500">×</span>
                <NumericInput min={0}
                  className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                  placeholder={ag.genHeightPlaceholder} value={genHeight}
                  onChange={setGenHeight} />
                <div className="flex gap-0.5">
                  {ASPECT_RATIOS.map(({ label, w, h }) => (
                    <button key={label} type="button"
                      className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer"
                      onClick={() => applyAspectRatio(w, h)}
                    >{label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Seed */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 w-24 shrink-0">{ag.seedLabel}</label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" className="accent-indigo-500 cursor-pointer"
                  checked={seedLocked} onChange={e => setSeedLocked(e.target.checked)} />
                <span className="text-xs text-slate-300">{ag.seedLock}</span>
              </label>
              {seedLocked && (
                <>
                  <NumericInput min={0} max={4294967295}
                    className="w-32 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                    value={lockedSeed} onChange={setLockedSeed} />
                  <button type="button"
                    className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                    onClick={() => setLockedSeed(randomSeed())}
                  >{ag.seedRandomize}</button>
                </>
              )}
            </div>

            {/* Style hints */}
            <StyleChipsEditor
              value={styleHints} onChange={setStyleHints}
              label={ag.styleHintsLabel}
              customPlaceholder={ag.styleHintsCustomPlaceholder}
              addBtn={ag.styleHintsAddBtn}
            />

            {/* Save path hint */}
            <div className="text-[10px] text-slate-500 font-mono">
              {`assets/${pathCategory}/${locationPrefix}/${safeVarPath}/…`}
            </div>
          </div>
          )}

          {/* Slots */}
          <div className="flex flex-col gap-3">
            {slots.map(slot => (
              <CellBoundSlotPanel
                key={slot.slotId}
                slot={slot}
                projectDir={projectDir}
                llmEnabled={llmEnabled}
                showRefImageCheckbox={showRefImageOption && slot.slotId === 'default'}
                useRefImage={useRefImage}
                onRefImageChange={setUseRefImage}
                defaultSlotHasImage={!!(defaultSlot?.currentSrc)}
                defaultSlotHasPrompt={!!(defaultSlot?.prompt?.trim())}
                assetNodes={project.assetNodes}
                onPromptChange={v => updateSlot(slot.slotId, { prompt: v })}
                onHintChange={v => updateSlot(slot.slotId, { hint: v })}
                onNegativePromptChange={v => updateSlot(slot.slotId, { negativePrompt: v })}
                onGenerate={() => generateForSlot(slot.slotId)}
                onCancel={() => cancelForSlot(slot.slotId)}
                onGeneratePrompt={m => generatePromptForSlot(slot.slotId, m)}
                onHistorySelect={src => updateSlot(slot.slotId, { currentSrc: src })}
                onPickDefaultAsset={src => {
                  setSlots(prev => {
                    const next = prev.map(s => s.slotId === 'default' ? { ...s, currentSrc: src } : s);
                    onSave({ ...cell, defaultSrc: src, genSettings: buildGenSettings(next) });
                    return next;
                  });
                }}
                ag={ag}
                cb={cb}
              />
            ))}
          </div>

          {/* Approve all */}
          <div className="flex items-center justify-end pt-2 border-t border-slate-700/50">
            <button type="button"
              disabled={anyBusy || !hasPendingApprovals}
              className="px-4 py-1.5 text-xs text-white rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              onClick={approveAll}
            >{ag.approveAllBtn}</button>
          </div>
    </div>
  );
}

// ─── SlotPanel ────────────────────────────────────────────────────────────────

function CellBoundSlotPanel({
  slot, projectDir, llmEnabled,
  showRefImageCheckbox, useRefImage, onRefImageChange,
  defaultSlotHasImage, defaultSlotHasPrompt,
  assetNodes,
  onPromptChange, onHintChange, onNegativePromptChange,
  onGenerate, onCancel, onGeneratePrompt, onHistorySelect, onPickDefaultAsset,
  ag, cb,
}: {
  slot: SlotState;
  projectDir: string | null;
  llmEnabled: boolean;
  showRefImageCheckbox: boolean;
  useRefImage: boolean;
  onRefImageChange: (v: boolean) => void;
  defaultSlotHasImage: boolean;
  defaultSlotHasPrompt: boolean;
  assetNodes: AssetTreeNode[];
  onPromptChange: (v: string) => void;
  onHintChange: (v: string) => void;
  onNegativePromptChange: (v: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onGeneratePrompt: (mode: SlotState['llmMode']) => void;
  onHistorySelect: (src: string) => void;
  onPickDefaultAsset?: (src: string) => void;
  ag: ReturnType<typeof useT>['avatarGen'];
  cb: ReturnType<typeof useT>['cellBoundGen'];
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isVariant  = slot.slotId !== 'default';
  const isApproved = slot.currentSrc.startsWith('assets/');
  const previewUrl = slot.currentSrc && projectDir
    ? toLocalFileUrl(resolveAssetPath(projectDir, slot.currentSrc))
    : '';

  return (
    <div className="flex flex-col gap-2 p-3 rounded border border-slate-700/60 bg-slate-900/30">
      {/* Slot header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-300">{slot.label}</span>
        {isApproved && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 border border-emerald-700 text-emerald-400">
            {ag.approvedBadge}
          </span>
        )}
        {showRefImageCheckbox && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none ml-auto" title={ag.refImageTooltip}>
            <input type="checkbox" className="accent-indigo-500 cursor-pointer"
              checked={useRefImage} disabled={!defaultSlotHasImage}
              onChange={e => onRefImageChange(e.target.checked)} />
            <span className={`text-[10px] font-mono ${defaultSlotHasImage ? 'text-indigo-300' : 'text-slate-500'}`}>
              {ag.refImageCheckbox}
            </span>
          </label>
        )}
      </div>

      {/* Pick from assets — default slot only */}
      {!isVariant && (
        <div className="flex items-start gap-2">
          <label className="text-xs text-slate-400 w-16 shrink-0 pt-1">{ag.fromAssetsLabel}</label>
          <ImageAssetPicker
            assetNodes={assetNodes}
            value={slot.currentSrc.startsWith('assets/') ? slot.currentSrc : ''}
            onChange={src => { if (src && onPickDefaultAsset) onPickDefaultAsset(src); }}
          />
        </div>
      )}

      {/* Hint field — variant slots only */}
      {isVariant && llmEnabled && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-16 shrink-0">{ag.hintLabel}</label>
          <div className="flex-1 flex gap-1">
            <input type="text"
              className="flex-1 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500"
              placeholder={cb.hintPlaceholder}
              value={slot.hint} onChange={e => onHintChange(e.target.value)} />
            <button type="button"
              disabled={slot.busyPrompt || !defaultSlotHasPrompt}
              title={!defaultSlotHasPrompt ? cb.generateFromHintNoRef : undefined}
              className="px-2 py-1 text-[10px] rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors border bg-indigo-700 border-indigo-600 text-white hover:bg-indigo-600 whitespace-nowrap"
              onClick={() => onGeneratePrompt('hint')}
            >{slot.busyPrompt ? ag.generatingPrompt : ag.generateFromHintBtn}</button>
          </div>
        </div>
      )}

      {/* Prompt */}
      <div className="flex items-start gap-2">
        <label className="text-xs text-slate-400 w-16 shrink-0 pt-1.5">{ag.promptLabel}</label>
        <div className="flex-1 flex flex-col gap-1">
          <textarea
            className="w-full bg-slate-800 text-slate-200 text-xs rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 min-h-[60px] resize-y"
            placeholder={cb.promptPlaceholder}
            value={slot.prompt} onChange={e => onPromptChange(e.target.value)} />
          {llmEnabled && !isVariant && (
            <div className="flex gap-1 flex-wrap">
              {(['continue', 'rephrase', 'hint'] as const).map(mode => {
                const label = mode === 'continue' ? ag.llmModeContinue
                  : mode === 'rephrase' ? ag.llmModeRephrase
                  : ag.llmModeHint;
                const isActive = slot.llmMode === mode;
                return (
                  <button key={mode} type="button" disabled={slot.busyPrompt}
                    className={`px-2 py-0.5 text-[10px] rounded cursor-pointer disabled:opacity-50 transition-colors border ${
                      isActive ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                    }`}
                    onClick={() => onGeneratePrompt(mode)}
                  >{slot.busyPrompt && isActive ? ag.generatingPrompt : label}</button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Negative prompt */}
      <div className="flex items-start gap-2">
        <label className="text-xs text-slate-400 w-16 shrink-0 pt-1.5">{ag.negativePromptLabel}</label>
        <textarea
          className="flex-1 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 min-h-[40px] resize-y"
          placeholder={ag.negativePromptPlaceholder}
          value={slot.negativePrompt} onChange={e => onNegativePromptChange(e.target.value)} />
      </div>

      {/* Generate button + progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <button type="button" disabled={slot.busy}
            className="px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white cursor-pointer"
            onClick={onGenerate}
          >{slot.busy ? ag.generatingImage : ag.generateImageBtn}</button>
          {slot.busy && (
            <>
              <button type="button"
                className="px-2 py-1 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white cursor-pointer"
                onClick={onCancel}
              >{ag.cancelBtn}</button>
              {slot.progress && (
                <span className="text-[10px] text-slate-400">{slot.progress.current}/{slot.progress.total}</span>
              )}
            </>
          )}
        </div>
        {slot.busy && (
          <div className="w-full h-1 rounded-full bg-slate-700 overflow-hidden">
            {slot.progress ? (
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((slot.progress.current / slot.progress.total) * 100)}%` }} />
            ) : (
              <div className="h-full w-full bg-emerald-500/40 animate-pulse" />
            )}
          </div>
        )}
      </div>

      {/* History */}
      {slot.history.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-16 shrink-0">{ag.historyLabel}</label>
          <select
            className="flex-1 bg-slate-800 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
            value={slot.currentSrc} onChange={e => onHistorySelect(e.target.value)}
          >
            <option value="">{ag.historyEmpty}</option>
            {[...slot.history].reverse().map(h => (
              <option key={h.id} value={h.src}>
                {new Date(h.createdAt).toLocaleString()} · {h.id.slice(0, 6)} · seed {h.seed}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Preview */}
      {previewUrl && (
        <>
          <img src={previewUrl} alt={slot.label}
            className="max-h-48 object-contain rounded border border-slate-700 cursor-zoom-in self-start"
            title={ag.doubleClickToExpand}
            onDoubleClick={() => setLightboxOpen(true)}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          {lightboxOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80"
              onClick={() => setLightboxOpen(false)}>
              <img src={previewUrl} alt={slot.label}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
                onClick={e => e.stopPropagation()} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
