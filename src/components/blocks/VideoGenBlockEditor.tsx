import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useProjectStore, flattenAssets } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { VideoGenBlock, VideoGenMode, VideoKeyframe } from '../../types';
import { fsApi, joinPath, toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { bytesToBase64 } from '../../utils/base64';
import { useVideoBlobUrl } from '../../hooks/useVideoBlobUrl';
import { useT } from '../../i18n';
import { generateVideoWithProvider } from '../../utils/videoGen/providers';
import type { ComfyProgress } from '../../utils/comfy/client';
import {
  loadComfyWorkflow, loadExampleWorkflows, collectWorkflowFiles, EXAMPLES_PREFIX,
} from '../../utils/imageGen/workflowLoader';
import { StyleChipsEditor } from '../shared/StyleChipsEditor';
import { useFlatAssets } from '../../hooks/useFlatVariables';
import { ImageAssetSelect } from '../shared/ImageAssetSelect';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { useVariableNodes } from '../shared/VariableScope';
import NumericInput from '../shared/NumericInput';
import { EmojiIcon } from '../shared/EmojiIcons';
import {
  MEDIA_BLOCK_FIELD_SCHEMA, MEDIA_BLOCK_RAW_CSS_HELP, simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

function randomSeed(): number {
  return Math.floor(Math.random() * 4294967295);
}

const ASPECT_RATIOS = [
  { label: '1:1',  w: 1, h: 1 },
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
  { label: '4:3',  w: 4, h: 3 },
] as const;

const IMG_EXT_RE = /\.(gif|webp|png|jpe?g)$/i;

/** Default per-transition duration (sec) for a newly added keyframe. */
const DEFAULT_TRANSITION_DURATION = 5;

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function VideoGenBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: VideoGenBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<VideoGenBlock>) => void;
}) {
  const t  = useT();
  const vg = t.videoGenBlock;
  const ag = t.avatarGen;

  const project         = useProjectStore(s => s.project);
  const projectDir      = useProjectStore(s => s.projectDir);
  const updateBlock     = useProjectStore(s => s.updateBlock);
  const addAsset        = useProjectStore(s => s.addAsset);
  const deleteAssetNode = useProjectStore(s => s.deleteAssetNode);
  const saveSnapshot    = useProjectStore(s => s.saveSnapshot);

  const comfyUiUrl          = useEditorPrefsStore(s => s.comfyUiUrl);
  const comfyUiWorkflowsDir = useEditorPrefsStore(s => s.comfyUiWorkflowsDir);
  const comfyUiOutputDir    = useEditorPrefsStore(s => s.comfyUiOutputDir);

  const update = onUpdate ?? ((p: Partial<VideoGenBlock>) => updateBlock(sceneId, block.id, p as never));
  const variableNodes = useVariableNodes();

  const mode: VideoGenMode = block.mode ?? 'text';
  const keyframes = block.keyframes ?? [];
  const history = block.history ?? [];

  const [exampleWorkflows, setExampleWorkflows] = useState<string[]>([]);
  const [projectWorkflows, setProjectWorkflows] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [genProgress, setGenProgress] = useState<ComfyProgress | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seedMode = block.seedMode ?? 'random';
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveFolder, setApproveFolder] = useState('');
  const [approveFilename, setApproveFilename] = useState('');

  const cascadeClasses = ['tg-video', ...simpleBlockCascadeClasses(block, project.settings)].join(' ');
  const videoAssetPaths = useMemo(
    () => new Set(flattenAssets(project.assetNodes).map(a => a.relativePath)),
    [project.assetNodes],
  );
  const allAssets = useFlatAssets();
  const imageAssets = useMemo(() => allAssets.filter(a => a.assetType === 'image'), [allAssets]);
  const isApproved = block.src.startsWith('assets/');
  const previewBlobUrl = useVideoBlobUrl(block.src, projectDir);
  const inputImagePreview = block.inputImageSrc && projectDir
    ? toLocalFileUrl(resolveAssetPath(projectDir, block.inputImageSrc))
    : '';

  // Abort any in-flight poll if the editor unmounts mid-generation.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const defaultApproveFilename = useMemo(() => {
    const scene = project.scenes.find(s => s.id === sceneId);
    const ext = block.src.split('.').pop() ?? 'mp4';
    if (!scene) return `${block.id}.${ext}`;
    const safe = scene.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_а-яёїієґ]/gi, '') || 'scene';
    const idx = scene.blocks.filter(b => b.type === 'video-gen').indexOf(block) + 1;
    return `${safe}-video-${idx}.${ext}`;
  }, [project.scenes, sceneId, block]);

  // ── Workflow list (examples + project + global) ────────────────────────────
  const loadWorkflowLists = async () => {
    setExampleWorkflows(await loadExampleWorkflows());
    if (projectDir) {
      const projRoot = joinPath(projectDir, 'comfyUI_workflows');
      setProjectWorkflows(await fsApi.exists(projRoot)
        ? (await collectWorkflowFiles(projRoot, 'comfyUI_workflows')).sort((a, b) => a.localeCompare(b))
        : []);
    }
    const globalRoot = comfyUiWorkflowsDir.trim();
    setWorkflows(globalRoot && await fsApi.exists(globalRoot)
      ? (await collectWorkflowFiles(globalRoot, '')).sort((a, b) => a.localeCompare(b))
      : []);
  };
  useEffect(() => {
    let alive = true;
    loadWorkflowLists().catch(() => {});
    return () => { alive = false; void alive; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDir, comfyUiWorkflowsDir]);

  // ── Input image (image mode) ───────────────────────────────────────────────
  const pickInputFromFile = async () => {
    if (!projectDir) return toast.error(vg.errorNoProjectDir);
    const file = await fsApi.openFileDialog({
      title: vg.inputImageFromFile,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (!file) return;
    const base = safeFileName(file.replace(/\\/g, '/').split('/').pop() || 'input.png');
    const rel = `inputs/${block.id}/${base}`;
    try {
      await fsApi.mkdir(joinPath(projectDir, `inputs/${block.id}`));
      await fsApi.copyFile(file, joinPath(projectDir, rel));
      update({ inputImageSrc: rel });
    } catch {
      toast.error(vg.errorGenerateVideo);
    }
  };

  // ── Keyframes (keyframes mode) ─────────────────────────────────────────────
  // Picked files (assets or external) are copied into keyframes/{blockId}/ with a
  // unique, comma-free name. Order lives in the array; the comma-joined paths are
  // built in array order at generation time.
  const copyKeyframe = async (absSource: string, displayName: string) => {
    if (!projectDir) return null;
    const uid = crypto.randomUUID().slice(0, 8);
    const base = safeFileName(displayName.replace(/\\/g, '/').split('/').pop() || 'frame.png');
    const rel = `keyframes/${block.id}/${uid}-${base}`;
    await fsApi.mkdir(joinPath(projectDir, `keyframes/${block.id}`));
    await fsApi.copyFile(absSource, joinPath(projectDir, rel));
    return rel;
  };

  const addKeyframeFromAsset = async (assetRel: string) => {
    if (!projectDir || !assetRel) return;
    try {
      const rel = await copyKeyframe(resolveAssetPath(projectDir, assetRel), assetRel);
      if (rel) update({ keyframes: [...keyframes, { id: crypto.randomUUID(), src: rel, duration: DEFAULT_TRANSITION_DURATION }] });
    } catch { toast.error(vg.errorGenerateVideo); }
  };

  const addKeyframesFromFiles = async () => {
    if (!projectDir) return toast.error(vg.errorNoProjectDir);
    const files = await fsApi.openFilesDialog({
      title: vg.keyframesAddFiles,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (!files || files.length === 0) return;
    try {
      const added: VideoKeyframe[] = [];
      for (const f of files) {
        const rel = await copyKeyframe(f, f);
        if (rel) added.push({ id: crypto.randomUUID(), src: rel, duration: DEFAULT_TRANSITION_DURATION });
      }
      if (added.length) update({ keyframes: [...keyframes, ...added] });
    } catch { toast.error(vg.errorGenerateVideo); }
  };

  const moveKeyframe = (index: number, dir: -1 | 1) => {
    const next = [...keyframes];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    update({ keyframes: next });
  };

  const removeKeyframe = (index: number) => {
    // Keep the copied file on disk so Undo can restore the keyframe. Orphans live
    // in the non-exported keyframes/ scratch folder (same policy as history/).
    update({ keyframes: keyframes.filter((_, i) => i !== index) });
  };

  const updateKeyframePrompt = (index: number, prompt: string) => {
    update({ keyframes: keyframes.map((k, i) => (i === index ? { ...k, prompt } : k)) });
  };

  const updateKeyframeDuration = (index: number, duration: number) => {
    update({ keyframes: keyframes.map((k, i) => (i === index ? { ...k, duration } : k)) });
  };

  // Replace a keyframe's image in place — keeps its position, prompt and duration.
  const replaceKeyframe = async (index: number) => {
    if (!projectDir) return toast.error(vg.errorNoProjectDir);
    const file = await fsApi.openFileDialog({
      title: vg.keyframeReplace,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (!file) return;
    try {
      const rel = await copyKeyframe(file, file);
      if (!rel) return;
      update({ keyframes: keyframes.map((k, i) => (i === index ? { ...k, src: rel } : k)) });
    } catch {
      toast.error(vg.errorGenerateVideo);
    }
  };

  // Replace a keyframe's image from a project asset — keeps position / prompt / duration.
  const replaceKeyframeFromAsset = async (index: number, assetRel: string) => {
    if (!projectDir || !assetRel) return;
    try {
      const rel = await copyKeyframe(resolveAssetPath(projectDir, assetRel), assetRel);
      if (!rel) return;
      update({ keyframes: keyframes.map((k, i) => (i === index ? { ...k, src: rel } : k)) });
    } catch {
      toast.error(vg.errorGenerateVideo);
    }
  };

  // ── Generate ────────────────────────────────────────────────────────────────
  const generateVideo = async () => {
    if (!projectDir) return toast.error(vg.errorNoProjectDir);
    if (!block.workflowFile) return toast.error(vg.errorNoWorkflow);
    if (mode === 'text' && !block.prompt.trim()) return toast.error(vg.errorNoPrompt);
    if (mode === 'keyframes' && keyframes.length < 2) return toast.error(vg.errorNeedKeyframes);

    saveSnapshot();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setGenProgress(null);
    try {
      const workflowJson = await loadComfyWorkflow('comfyui', block.workflowFile, comfyUiWorkflowsDir, projectDir);
      const wfStr = JSON.stringify(workflowJson);

      const usedSeed = seedMode === 'random' ? randomSeed() : (Number.isFinite(block.seed) ? block.seed! : 0);
      const styleHints = block.styleHints ?? [];
      const effectivePrompt = mode === 'text' && styleHints.length > 0 && block.prompt.trim()
        ? `${block.prompt.trim()}, ${styleHints.join(', ')}`
        : block.prompt;

      const histDirRel = `history/${block.id}`;
      await fsApi.mkdir(joinPath(projectDir, histDirRel));

      // Per-mode inputs.
      let imagePath: string | undefined;
      let imageBase64: string | undefined;
      let keyframePaths: string | undefined;
      let keyframePrompts: string | undefined;
      let keyframeDurations: string | undefined;
      if (mode === 'image' && block.inputImageSrc) {
        const absInput = resolveAssetPath(projectDir, block.inputImageSrc);
        imagePath = absInput.replace(/\\/g, '/');
        if (wfStr.includes('${base64Image}')) {
          try {
            const r = await fsApi.httpRequestBinary({ url: toLocalFileUrl(absInput) });
            if (r.status >= 200 && r.status < 300) imageBase64 = bytesToBase64(r.bytes);
          } catch { /* non-fatal */ }
        }
      }
      if (mode === 'keyframes') {
        // Three newline-separated lists aligned by index: N frame paths, plus per-gap
        // (N-1) transition hints + durations (gap i = frame i → frame i+1).
        keyframePaths = keyframes
          .map(k => resolveAssetPath(projectDir, k.src).replace(/\\/g, '/'))
          .join('\n');
        keyframePrompts = keyframes
          .slice(0, -1)
          .map(k => (k.prompt ?? '').trim())
          .join('\n');
        keyframeDurations = keyframes
          .slice(0, -1)
          .map(k => (k.duration != null && k.duration > 0 ? String(k.duration) : ''))
          .join('\n');
      }

      // Folder-read uses ComfyUI's own output folder (same drive as ComfyUI; its
      // SaveVideo rejects cross-drive paths). ${outputDir} resolves to that folder.
      const outputDir = block.readFromFolder && comfyUiOutputDir.trim()
        ? comfyUiOutputDir.trim().replace(/\\/g, '/')
        : undefined;

      const result = await generateVideoWithProvider('comfyui', {
        baseUrl: comfyUiUrl,
        workflow: workflowJson,
        prompt: effectivePrompt,
        negativePrompt: block.negativePrompt,
        seed: usedSeed,
        genWidth: block.genWidth,
        genHeight: block.genHeight,
        duration: block.duration,
        fps: block.fps,
        imageBase64,
        imagePath,
        keyframePaths,
        keyframePrompts,
        keyframeDurations,
        outputDir,
        onProgress: setGenProgress,
      }, controller.signal);

      if (seedMode === 'random') update({ seed: usedSeed });

      const genId = crypto.randomUUID();
      let ext = result.extHint ?? 'mp4';

      // Prefer reading the result straight from ComfyUI's output folder (fast, no
      // multi-hundred-MB byte transfer over IPC); fall back to /view download.
      let diskSrc = '';
      if (block.readFromFolder && result.filename && comfyUiOutputDir.trim()) {
        const parts = [comfyUiOutputDir.trim(), result.subfolder, result.filename].filter((p): p is string => !!p);
        diskSrc = joinPath(...parts);
        if (!(await fsApi.exists(diskSrc))) diskSrc = '';
      }

      let relPath: string;
      if (diskSrc) {
        ext = result.filename!.split('.').pop()?.toLowerCase() || ext;
        relPath = `${histDirRel}/${genId}.${ext}`;
        await fsApi.copyFile(diskSrc, joinPath(projectDir, relPath));
        console.log('[VideoGen] result source = DISK (copied from ComfyUI output folder):', diskSrc);
      } else {
        const res = await fsApi.httpRequestBinary({ url: result.viewUrl! });
        if (res.status < 200 || res.status >= 300) throw new Error(`Video download failed: ${res.status}`);
        relPath = `${histDirRel}/${genId}.${ext}`;
        await fsApi.writeFileBinary(joinPath(projectDir, relPath), res.bytes);
        console.log('[VideoGen] result source = HTTP /view (downloaded over IPC):', result.viewUrl);
      }

      const nextHistory = [
        ...history,
        {
          id: genId,
          src: relPath,
          prompt: block.prompt,
          seed: usedSeed,
          duration: block.duration,
          fps: block.fps,
          createdAt: Date.now(),
          provider: 'comfyui',
        },
      ];
      update({ src: relPath, history: nextHistory });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Cancelled — silent.
      } else {
        console.error('[VideoGen] generation failed:', err);
        toast.error(vg.errorGenerateVideo);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setGenProgress(null);
    }
  };

  const cancelGeneration = () => { abortRef.current?.abort(); };

  const handleClearHistory = () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      clearConfirmTimerRef.current = setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current);
    setClearConfirm(false);
    update({ history: history.filter(h => h.src === block.src) });
  };

  const openApprove = () => {
    if (!projectDir || !block.src) return;
    const raw = block.lastApprovedDir ?? 'video';
    setApproveFolder(raw.startsWith('assets/') ? raw.slice('assets/'.length) : raw);
    setApproveFilename(defaultApproveFilename);
    setApproveDialogOpen(true);
  };

  const doApprove = async (folder: string, filename: string) => {
    if (!projectDir || !block.src) return;
    const cleanSubfolder = folder.replace(/^[/\\]+|[/\\]+$/g, '');
    if (cleanSubfolder.includes('..')) { toast.error(vg.approveOutsideRelease); return; }
    const relPath = cleanSubfolder ? `assets/${cleanSubfolder}/${filename}` : `assets/${filename}`;
    const savePath = joinPath(projectDir, 'release', relPath);
    setApproveDialogOpen(false);
    try {
      await fsApi.mkdir(joinPath(projectDir, 'release', 'assets', cleanSubfolder || '.'));
      await fsApi.copyFile(resolveAssetPath(projectDir, block.src), savePath);
      if (!videoAssetPaths.has(relPath)) {
        addAsset(null, { name: filename, assetType: 'video', relativePath: relPath });
      }
      const approvedHistoryId = history.find(h => h.src === block.src)?.id;
      update({ src: relPath, approvedHistoryId, lastApprovedDir: cleanSubfolder || undefined });
      toast.success(vg.approvedBadge);
    } catch {
      toast.error(vg.errorApprove);
    }
  };

  const unapprove = async () => {
    if (!projectDir || !block.src || !isApproved) return;
    try {
      try { await fsApi.deleteFile(resolveAssetPath(projectDir, block.src)); } catch { /* gone */ }
      const node = flattenAssets(project.assetNodes).find(a => a.relativePath === block.src);
      if (node) deleteAssetNode(node.id);
      const entry = history.find(h => h.id === block.approvedHistoryId);
      update({ src: entry?.src ?? '', approvedHistoryId: undefined });
    } catch {
      toast.error(vg.errorUnapprove);
    }
  };

  const applyAspectRatio = (wRatio: number, hRatio: number) => {
    const base = block.genWidth && block.genWidth > 0 ? block.genWidth : 512;
    update({ genWidth: base, genHeight: Math.round(base * hRatio / wRatio) });
  };

  const isImagePreview = IMG_EXT_RE.test(block.src);

  return (
    <div className="flex flex-col gap-2">
      {/* ── Mode ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{vg.modeLabel}</label>
        <div className="flex gap-1">
          {([
            ['text', vg.modeText],
            ['image', vg.modeImage],
            ['keyframes', vg.modeKeyframes],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => update({ mode: m })}
              className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
                mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Shared generation settings ────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3 rounded bg-slate-900/40 border border-slate-700/50">
        {/* Workflow */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0">{vg.workflowLabel}</label>
          <select
            className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
            value={block.workflowFile}
            onChange={e => update({ workflowFile: e.target.value })}
          >
            <option value="">{ag.workflowNone}</option>
            {projectWorkflows.length > 0 && (
              <optgroup label={ag.workflowGroupProject}>
                {projectWorkflows.map(wf => <option key={wf} value={wf}>{wf.replace(/^comfyUI_workflows\//, '')}</option>)}
              </optgroup>
            )}
            {workflows.length > 0 && (
              <optgroup label={ag.workflowGroupCustom}>
                {workflows.map(wf => <option key={wf} value={wf}>{wf}</option>)}
              </optgroup>
            )}
            {exampleWorkflows.length > 0 && (
              <optgroup label={ag.workflowGroupExamples}>
                {exampleWorkflows.map(wf => <option key={wf} value={wf}>{wf.slice(EXAMPLES_PREFIX.length)}</option>)}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
            onClick={() => loadWorkflowLists().catch(() => {})}
          >
            {vg.workflowRefresh}
          </button>
        </div>

        {/* Size + aspect ratios */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-400 w-20 shrink-0">{vg.genSizeLabel}</label>
          <NumericInput
            min={0}
            className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
            placeholder={vg.genWidthPlaceholder}
            value={block.genWidth || 0}
            onChange={v => update({ genWidth: v })}
          />
          <span className="text-xs text-slate-500">×</span>
          <NumericInput
            min={0}
            className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
            placeholder={vg.genHeightPlaceholder}
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

        {/* Duration (global; in keyframes mode it's per-transition instead) + FPS */}
        <div className="flex items-center gap-4 flex-wrap">
          {mode !== 'keyframes' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 w-20 shrink-0">{vg.durationLabel}</label>
              <NumericInput
                min={0}
                step={1}
                float
                className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                placeholder={vg.durationPlaceholder}
                value={block.duration ?? 0}
                onChange={v => update({ duration: v })}
              />
              <span className="text-xs text-slate-500">{vg.secondsLabel}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 shrink-0">{vg.fpsLabel}</label>
            <NumericInput
              min={0}
              step={1}
              className="w-16 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
              placeholder={vg.fpsPlaceholder}
              value={block.fps ?? 0}
              onChange={v => update({ fps: v })}
            />
          </div>
        </div>

        {/* Seed */}
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
                onClick={() => update({ seed: randomSeed() })}
              >
                {ag.seedRandomize}
              </button>
            </>
          )}
        </div>

        {/* Style hints — only for text mode (image / keyframes get their style from the source). */}
        {mode === 'text' && (
          <StyleChipsEditor
            value={block.styleHints ?? []}
            onChange={v => update({ styleHints: v })}
            label={vg.styleHintsLabel}
            customPlaceholder={vg.styleHintsCustomPlaceholder}
            addBtn={vg.styleHintsAddBtn}
          />
        )}

        {/* Read-from-folder */}
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title={vg.readFromFolderHint}>
            <input
              type="checkbox"
              className="accent-indigo-500 cursor-pointer"
              checked={block.readFromFolder ?? false}
              onChange={e => update({ readFromFolder: e.target.checked })}
            />
            <span className="text-xs text-slate-300">{vg.readFromFolderLabel}</span>
          </label>
          {block.readFromFolder && !comfyUiOutputDir.trim() && (
            <p className="text-[10px] text-amber-400/80 pl-5">{vg.readFromFolderNeedsSetting}</p>
          )}
        </div>
      </div>

      {/* ── Input image (image mode) ──────────────────────────────────────── */}
      {mode === 'image' && (
        <div className="flex items-start gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0 pt-2">{vg.inputImageLabel}</label>
          <div className="flex-1 flex flex-col gap-1.5">
            {block.inputImageSrc && (
              <div className="flex items-center gap-2">
                {inputImagePreview && (
                  <img key={inputImagePreview} src={inputImagePreview} alt="" className="w-14 h-14 object-cover rounded border border-slate-700 shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
                <span className="text-xs text-slate-400 flex-1 truncate font-mono">{block.inputImageSrc}</span>
                <button type="button" className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-red-800 text-slate-300 hover:text-white cursor-pointer transition-colors shrink-0"
                  onClick={() => update({ inputImageSrc: undefined })}>
                  {vg.inputImageClear}
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <ImageAssetSelect assets={imageAssets} label={vg.inputImageFromAsset} onPick={src => update({ inputImageSrc: src })} />
              <button type="button" className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer shrink-0" onClick={pickInputFromFile}>
                {block.inputImageSrc ? vg.inputImageReplace : vg.inputImageFromFile}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">{vg.inputImageHint}</p>
          </div>
        </div>
      )}

      {/* ── Keyframes (keyframes mode) ────────────────────────────────────── */}
      {mode === 'keyframes' && (
        <div className="flex items-start gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0 pt-2">{vg.keyframesLabel}</label>
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <ImageAssetSelect assets={imageAssets} label={vg.keyframesAddAsset} onPick={addKeyframeFromAsset} />
              <button type="button" className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer shrink-0" onClick={addKeyframesFromFiles}>
                {vg.keyframesAddFiles}
              </button>
            </div>
            {keyframes.length === 0 ? (
              <p className="text-[10px] text-slate-500">{vg.keyframesEmpty}</p>
            ) : (
              <div className="flex flex-col gap-1">
                {keyframes.map((kf, i) => (
                  <div key={kf.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 bg-slate-800/60 rounded px-1.5 py-1">
                      <span className="text-[10px] text-slate-500 w-5 text-center shrink-0">{i + 1}</span>
                      {projectDir && (
                        <img key={kf.src} src={toLocalFileUrl(resolveAssetPath(projectDir, kf.src))} alt="" className="w-10 h-10 object-cover rounded border border-slate-700 shrink-0"
                          onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                      )}
                      <span className="text-[10px] text-slate-400 flex-1 truncate font-mono">{kf.src.split('/').pop()}</span>
                      <ImageAssetSelect
                        assets={imageAssets}
                        label="⇄"
                        onPick={p => replaceKeyframeFromAsset(i, p)}
                        fileLabel={vg.inputImageFromFile}
                        onFile={() => replaceKeyframe(i)}
                        className="w-12 shrink-0 bg-slate-700 text-slate-200 text-xs rounded px-1 py-0.5 outline-none border border-slate-600 cursor-pointer"
                      />
                      <button type="button" disabled={i === 0} title={vg.keyframeUp} className="px-1.5 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-30 cursor-pointer" onClick={() => moveKeyframe(i, -1)}>↑</button>
                      <button type="button" disabled={i === keyframes.length - 1} title={vg.keyframeDown} className="px-1.5 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-30 cursor-pointer" onClick={() => moveKeyframe(i, 1)}>↓</button>
                      <button type="button" title={vg.keyframeRemove} className="px-1.5 py-0.5 text-xs rounded bg-slate-700 hover:bg-red-800 text-slate-300 hover:text-white cursor-pointer transition-colors" onClick={() => removeKeyframe(i)}>✕</button>
                    </div>
                    {i < keyframes.length - 1 && (
                      <div className="flex items-center gap-1.5 pl-7 pr-1">
                        <span className="text-slate-500 text-xs shrink-0" title={vg.keyframeTransitionLabel}>↳</span>
                        <input
                          className="flex-1 min-w-0 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 outline-none border border-slate-700 focus:border-indigo-500"
                          placeholder={vg.keyframePromptPlaceholder}
                          value={kf.prompt ?? ''}
                          onChange={e => updateKeyframePrompt(i, e.target.value)}
                        />
                        <NumericInput
                          min={0}
                          step={1}
                          float
                          className="w-14 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 outline-none border border-slate-700 focus:border-indigo-500 shrink-0"
                          placeholder={vg.durationPlaceholder}
                          value={kf.duration ?? 0}
                          onChange={v => updateKeyframeDuration(i, v)}
                        />
                        <span className="text-[10px] text-slate-500 shrink-0">{vg.secondsLabel}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-500">{vg.keyframesHint}</p>
            {keyframes.length === 1 && <p className="text-[10px] text-amber-400/80">{vg.keyframesMinNote}</p>}
          </div>
        </div>
      )}

      {/* ── Prompt + Negative (not in keyframes mode — per-transition hints replace them) ── */}
      {mode !== 'keyframes' && (
        <>
          <div className="flex items-start gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0 pt-2">{vg.promptLabel}</label>
            <textarea
              className="flex-1 bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 min-h-[60px]"
              placeholder={vg.promptPlaceholder}
              value={block.prompt}
              onChange={e => update({ prompt: e.target.value })}
            />
          </div>
          <div className="flex items-start gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0 pt-2">{vg.negativePromptLabel}</label>
            <textarea
              className="flex-1 bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 min-h-[44px]"
              placeholder={vg.negativePromptPlaceholder}
              value={block.negativePrompt ?? ''}
              onChange={e => update({ negativePrompt: e.target.value })}
            />
          </div>
        </>
      )}

      {/* ── Generate / Cancel ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white cursor-pointer"
            onClick={generateVideo}
          >
            {busy ? vg.generatingVideo : vg.generateVideo}
          </button>
          {busy && (
            <>
              <button type="button" className="px-3 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white cursor-pointer" onClick={cancelGeneration}>
                {vg.cancelGeneration}
              </button>
              {genProgress && <span className="text-[10px] text-slate-400">{genProgress.current}/{genProgress.total}</span>}
            </>
          )}
        </div>
        {busy && (
          <div className="w-full h-1 rounded-full bg-slate-700 overflow-hidden">
            {genProgress ? (
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${Math.round((genProgress.current / genProgress.total) * 100)}%` }} />
            ) : (
              <div className="h-full w-full bg-emerald-500/40 animate-pulse" />
            )}
          </div>
        )}
      </div>

      {/* ── History ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{vg.historyLabel}</label>
        <select
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
          value={block.src}
          onChange={e => update({ src: e.target.value, approvedHistoryId: undefined })}
        >
          <option value="">{vg.historyEmpty}</option>
          {[...history].reverse().map(h => (
            <option key={h.id} value={h.src}>
              {new Date(h.createdAt).toLocaleString()} · {h.id.slice(0, 8)}{h.seed !== undefined ? ` · seed ${h.seed}` : ''}
            </option>
          ))}
        </select>
        {history.length > 0 && (
          <button
            type="button"
            className={`px-2 py-1 text-xs rounded cursor-pointer transition-colors ${clearConfirm ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
            onClick={handleClearHistory}
          >
            {clearConfirm ? vg.clearHistoryConfirm : vg.clearHistory}
          </button>
        )}
      </div>

      {/* ── Approve / Unapprove ───────────────────────────────────────────── */}
      {block.src && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0" />
          {isApproved ? (
            <>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/50 border border-emerald-700 text-emerald-400">
                <EmojiIcon name="check" size={20} /> {vg.approvedBadge}
              </span>
              <button type="button" title={vg.unapproveVideoTitle} className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-red-800 text-slate-300 hover:text-white cursor-pointer transition-colors" onClick={unapprove}>
                {vg.unapproveVideo}
              </button>
            </>
          ) : (
            <>
              <span className="text-xs px-2 py-0.5 rounded bg-amber-900/50 border border-amber-700 text-amber-400">
                <EmojiIcon name="warning" size={20} /> {vg.draftBadge}
              </span>
              <button type="button" title={vg.approveVideoTitle} className="px-2 py-1 text-xs rounded bg-emerald-800 hover:bg-emerald-700 text-white cursor-pointer transition-colors" onClick={openApprove}>
                {vg.approveVideo}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Preview ───────────────────────────────────────────────────────── */}
      {block.src && previewBlobUrl && (
        <div className={cascadeClasses}>
          {isImagePreview ? (
            <img src={previewBlobUrl} alt={vg.previewAlt} width={block.width > 0 ? block.width : undefined} />
          ) : (
            <video key={block.src} src={previewBlobUrl} controls width={block.width > 0 ? block.width : undefined} />
          )}
        </div>
      )}

      {/* ── Playback settings (mirror VideoBlock) ─────────────────────────── */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{vg.widthLabel}</label>
        <NumericInput
          min={0}
          className="w-24 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          placeholder={vg.widthPlaceholder}
          value={block.width || 0}
          onChange={v => update({ width: v })}
        />
      </div>
      <div className="flex items-center gap-4">
        {([
          ['controls', vg.playbackControls],
          ['autoplay', vg.playbackAutoplay],
          ['loop', vg.playbackLoop],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="accent-indigo-500"
              checked={block[key]}
              onChange={e => update({ [key]: e.target.checked } as Partial<VideoGenBlock>)}
            />
            <span className="text-xs text-slate-300">{label}</span>
          </label>
        ))}
      </div>

      {/* ── Custom style + effects ────────────────────────────────────────── */}
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

      {/* ── Approve dialog ────────────────────────────────────────────────── */}
      {approveDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setApproveDialogOpen(false)}>
          <div className="relative bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-96 p-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-200">{vg.approveSaveTitle}</h3>
            {previewBlobUrl && !isImagePreview && (
              <video src={previewBlobUrl} controls className="w-full max-h-40 rounded border border-slate-700 bg-slate-900" />
            )}
            {previewBlobUrl && isImagePreview && (
              <img src={previewBlobUrl} alt="" className="w-full max-h-40 object-contain rounded border border-slate-700 bg-slate-900" />
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">{vg.approveFolderLabel}</label>
              <div className="flex items-center gap-1 bg-slate-700 rounded px-2 py-1 text-sm text-slate-300">
                <span className="text-slate-500 select-none">release/assets/</span>
                <input className="flex-1 bg-transparent outline-none text-white placeholder:text-slate-500" value={approveFolder} onChange={e => setApproveFolder(e.target.value)} placeholder="video" autoComplete="off" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">{vg.approveFilenameLabel}</label>
              <input
                className="bg-slate-700 rounded px-2 py-1 text-sm text-white outline-none border border-slate-600 focus:border-indigo-500"
                value={approveFilename}
                onChange={e => setApproveFilename(e.target.value)}
                autoComplete="off"
                onKeyDown={e => { if (e.key === 'Enter' && approveFilename.trim()) doApprove(approveFolder, approveFilename.trim()); }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="px-3 py-1.5 text-xs text-slate-300 hover:text-white rounded border border-slate-600 hover:border-slate-400 transition-colors cursor-pointer" onClick={() => setApproveDialogOpen(false)}>
                {t.common.cancel}
              </button>
              <button type="button" disabled={!approveFilename.trim()} className="px-3 py-1.5 text-xs text-white rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 transition-colors cursor-pointer" onClick={() => doApprove(approveFolder, approveFilename.trim())}>
                {vg.approveSaveButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
