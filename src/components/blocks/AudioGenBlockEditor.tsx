import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useProjectStore, flattenAssets } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { AudioGenBlock } from '../../types';
import { fsApi, joinPath, resolveAssetPath } from '../../lib/fsApi';
import { useAudioBlobUrl } from '../../hooks/useAudioBlobUrl';
import { useT } from '../../i18n';
import { generateAudioWithProvider } from '../../utils/audioGen/providers';
import type { ComfyProgress } from '../../utils/comfy/client';
import {
  generateLyricsWithLlm,
  formatAudioStyleForAceStep,
} from '../../utils/audioGen/llmPrompt';
import {
  loadComfyWorkflow,
  loadExampleWorkflows,
  collectWorkflowFiles,
  EXAMPLES_PREFIX,
} from '../../utils/imageGen/workflowLoader';
import { StyleChipsEditor } from '../shared/StyleChipsEditor';
import NumericInput from '../shared/NumericInput';
import { EmojiIcon } from '../shared/EmojiIcons';

function randomSeed(): number {
  return Math.floor(Math.random() * 4294967295);
}

// ACE Step v1.5 oriented presets, grouped by the four dimensions the model
// pays attention to. Custom tags still work via the free-text input below.
// Built lazily inside the component so labels follow the active locale.

type LlmSubMode = 'hint' | 'rephrase' | 'continue';

interface ModeToggleProps {
  label: string;
  mode: 'manual' | 'llm';
  onModeChange: (m: 'manual' | 'llm') => void;
  subMode: LlmSubMode | undefined;
  onSub: (m: LlmSubMode) => void;
  busy: boolean;
  llmEnabled: boolean;
  copy: {
    manual: string;
    llm: string;
    continueMode: string;
    rephrase: string;
    hint: string;
    generating: string;
  };
}

/**
 * Manual/LLM toggle + Continue/Rephrase/Hint sub-buttons.
 *
 * Declared at module scope (not inside the editor's render fn) so React doesn't
 * recreate the component on every parent render — would reset internal state
 * and trips the `no-create-components-during-render` ESLint rule.
 */
function ModeToggle({
  label, mode, onModeChange, subMode, onSub, busy, llmEnabled, copy,
}: ModeToggleProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs text-slate-400 w-20 shrink-0">{label}</label>
      <div className="flex gap-1">
        {([
          ['manual', copy.manual],
          ['llm',    copy.llm],
        ] as const).map(([m, lbl]) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
              mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
      {mode === 'llm' && (
        <div className="flex items-center gap-1 flex-wrap">
          {([
            ['continue', copy.continueMode],
            ['rephrase', copy.rephrase],
            ['hint',     copy.hint],
          ] as const).map(([m, lbl]) => (
            <button
              key={m}
              type="button"
              disabled={busy || !llmEnabled}
              className={`px-2.5 py-1 text-xs rounded disabled:opacity-50 cursor-pointer transition-colors ${
                (subMode ?? 'hint') === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
              onClick={() => onSub(m)}
            >
              {busy && (subMode ?? 'hint') === m ? copy.generating : lbl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ErrorCategory = 'network' | 'timeout' | 'workflow400' | 'execution' | 'noOutput' | 'generic';

interface GenErrorInfo {
  title: string;
  category: ErrorCategory;
  categoryLabel: string;
  summary: string;
  hints: string[];
  technicalDetails: string;
}

interface ErrorCopy {
  hints: {
    network: string;
    workflow400: string;
    execution: string;
    noOutput: string;
    timeout: string;
    generic: string;
  };
  categories: {
    network: string;
    workflow400: string;
    execution: string;
    noOutput: string;
    timeout: string;
    generic: string;
  };
}

/**
 * Classify a generation error into a primary category + contextual hints.
 * Detection looks at error.message for known ComfyUI / Electron / Node failure modes.
 *
 * Notes:
 *  - Electron IPC wraps fetch failures as "Error invoking remote method 'http:request': ..."
 *    so we also key off the channel name to catch those.
 *  - Both "failed to fetch" (browser fetch) and "fetch failed" (node 18+ undici) appear in the wild.
 */
function classifyGenError(err: unknown, title: string, copy: ErrorCopy): GenErrorInfo {
  const e = err as { name?: string; message?: string; stack?: string };
  const message = e?.message ?? String(err);
  const lower = message.toLowerCase();
  const hints: string[] = [];

  // ── timeout — check FIRST so it doesn't get swallowed by network heuristics ──
  const isTimeout = lower.includes('timeout') || lower.includes('etimedout');
  if (isTimeout) hints.push(copy.hints.timeout);

  // ── network / connection failure ────────────────────────────────────────────
  const isNetwork =
    !isTimeout && (
      lower.includes('failed to fetch') ||
      lower.includes('fetch failed') ||
      lower.includes('networkerror') ||
      lower.includes('econnrefused') ||
      lower.includes('econnreset') ||
      lower.includes('enotfound') ||
      lower.includes('eai_again') ||
      // Electron preload's IPC channel name when the main-process fetch fails
      message.includes("'http:request'") ||
      message.includes('http:request') ||
      // Generic "connect ECONNREFUSED ..." style
      /connect e[a-z]+/i.test(message)
    );
  if (isNetwork) hints.push(copy.hints.network);

  // ── workflow validation (400 from /prompt) ──────────────────────────────────
  const isWorkflow400 = message.includes('request failed: 400') || lower.includes('node_errors');
  if (isWorkflow400) hints.push(copy.hints.workflow400);

  // ── node execution failure ──────────────────────────────────────────────────
  const isExecution = message.includes('execution failed:');
  if (isExecution) hints.push(copy.hints.execution);

  // ── workflow finished but no audio in outputs ───────────────────────────────
  const isNoOutput = lower.includes('no matching output') || lower.includes('no image in');
  if (isNoOutput) hints.push(copy.hints.noOutput);

  if (hints.length === 0) hints.push(copy.hints.generic);

  // Pick the "primary" category for the banner. Order = display priority.
  const category: ErrorCategory =
    isNetwork    ? 'network'    :
    isTimeout    ? 'timeout'    :
    isWorkflow400? 'workflow400':
    isExecution  ? 'execution'  :
    isNoOutput   ? 'noOutput'   :
    'generic';

  const technicalDetails = e?.stack && e.stack !== message ? `${message}\n\n${e.stack}` : message;

  return {
    title,
    category,
    categoryLabel: copy.categories[category],
    summary: message,
    hints,
    technicalDetails,
  };
}

export function AudioGenBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: AudioGenBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<AudioGenBlock>) => void;
}) {
  const t = useT();
  const ig = t.audioGenBlock;
  const ab = t.audioBlock;
  const ag = t.avatarGen;

  const project         = useProjectStore(s => s.project);
  const projectDir      = useProjectStore(s => s.projectDir);
  const updateBlock     = useProjectStore(s => s.updateBlock);
  const addAsset        = useProjectStore(s => s.addAsset);
  const deleteAssetNode = useProjectStore(s => s.deleteAssetNode);
  const saveSnapshot    = useProjectStore(s => s.saveSnapshot);

  const llmEnabled       = useEditorPrefsStore(s => s.llmEnabled);
  const llmProvider      = useEditorPrefsStore(s => s.llmProvider);
  const llmUrl           = useEditorPrefsStore(s => s.llmUrl);
  const llmGeminiApiKey  = useEditorPrefsStore(s => s.llmGeminiApiKey);
  const llmGeminiModel   = useEditorPrefsStore(s => s.llmGeminiModel);
  const llmOpenaiUrl     = useEditorPrefsStore(s => s.llmOpenaiUrl);
  const llmOpenaiApiKey  = useEditorPrefsStore(s => s.llmOpenaiApiKey);
  const llmOpenaiModel   = useEditorPrefsStore(s => s.llmOpenaiModel);
  const llmMaxTokens     = useEditorPrefsStore(s => s.llmMaxTokens);
  const llmTemperature   = useEditorPrefsStore(s => s.llmTemperature);
  const llmSystemPrompt  = useEditorPrefsStore(s => s.llmSystemPrompt);
  const comfyUiUrl          = useEditorPrefsStore(s => s.comfyUiUrl);
  const comfyUiWorkflowsDir = useEditorPrefsStore(s => s.comfyUiWorkflowsDir);

  const update = onUpdate ?? ((p: Partial<AudioGenBlock>) => updateBlock(sceneId, block.id, p as never));

  const [exampleWorkflows, setExampleWorkflows] = useState<string[]>([]);
  const [projectWorkflows, setProjectWorkflows] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [busyAudio, setBusyAudio] = useState(false);
  const [busyLyrics, setBusyLyrics] = useState(false);
  const [busyFormat, setBusyFormat] = useState(false);
  const [genProgress, setGenProgress] = useState<ComfyProgress | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seedMode = block.seedMode ?? 'random';
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveFolder, setApproveFolder] = useState('');
  const [approveFilename, setApproveFilename] = useState('');
  const [errorInfo, setErrorInfo] = useState<GenErrorInfo | null>(null);
  const [errorCopied, setErrorCopied] = useState(false);

  // Stable copy bundle passed into classifyGenError. Kept inline because
  // i18n values can change between renders if user switches locale.
  const errorCopy: ErrorCopy = {
    hints: {
      network:     ig.errorHintNetwork,
      workflow400: ig.errorHintWorkflow400,
      execution:   ig.errorHintExecution,
      noOutput:    ig.errorHintNoOutput,
      timeout:     ig.errorHintTimeout,
      generic:     ig.errorHintGeneric,
    },
    categories: {
      network:     ig.errorCategoryNetwork,
      workflow400: ig.errorCategoryWorkflow400,
      execution:   ig.errorCategoryExecution,
      noOutput:    ig.errorCategoryNoOutput,
      timeout:     ig.errorCategoryTimeout,
      generic:     ig.errorCategoryGeneric,
    },
  };

  const history = block.history ?? [];
  const audioAssets = useMemo(
    () => new Set(flattenAssets(project.assetNodes).map(a => a.relativePath)),
    [project.assetNodes],
  );
  const isApproved = block.src.startsWith('assets/');
  // Streaming-capable preview URL. `localfile://` custom protocol can't stream
  // audio; the hook reads the file via IPC and wraps it as a `blob:` URL.
  const previewBlobUrl = useAudioBlobUrl(block.src, projectDir);

  // If the editor unmounts mid-generation (block deleted, scene switched, app
  // closed) — abort the inflight polling loop. Otherwise the comfy poll would
  // keep firing /history requests in the background forever.
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const defaultApproveFilename = useMemo(() => {
    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) return block.id;
    const ext = block.src.split('.').pop() ?? 'mp3';
    const safeName = scene.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_а-яёїієґ]/gi, '')
      || 'scene';
    const idx = scene.blocks.filter(b => b.type === 'audio-gen').indexOf(block) + 1;
    return `${safeName}-audio-${idx}.${ext}`;
  }, [project.scenes, sceneId, block]);

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

  // ── Shared LLM-options builder ────────────────────────────────────────────
  const llmOpts = () => ({
    provider: llmProvider,
    urlOrApiKey: llmProvider === 'openai' ? llmOpenaiUrl : llmProvider === 'gemini' ? llmGeminiApiKey : llmUrl,
    apiKey: llmProvider === 'openai' ? llmOpenaiApiKey : undefined,
    model: llmProvider === 'openai' ? llmOpenaiModel : llmGeminiModel,
    maxTokens: llmMaxTokens,
    temperature: llmTemperature,
    systemPrompt: llmSystemPrompt,
  });

  const formatStyle = async () => {
    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene || !llmEnabled) return;
    setBusyFormat(true);
    try {
      const text = await formatAudioStyleForAceStep(
        llmOpts(),
        project,
        scene,
        block.id,
        block.stylePrompt ?? '',
      );
      if (text) update({ stylePrompt: text });
    } catch (err) {
      setErrorInfo(classifyGenError(err, ig.errorGenerateFormatStyle, errorCopy));
    } finally {
      setBusyFormat(false);
    }
  };

  const generateLyrics = async (mode: LlmSubMode) => {
    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene || !llmEnabled) return;
    setBusyLyrics(true);
    try {
      const text = await generateLyricsWithLlm(
        llmOpts(),
        project,
        scene,
        block.id,
        block.lyrics ?? '',
        mode,
        block.stylePrompt ?? '',
      );
      if (text) update({ lyrics: text, lyricsLlmMode: mode });
    } catch (err) {
      setErrorInfo(classifyGenError(err, ig.errorGenerateLyrics, errorCopy));
    } finally {
      setBusyLyrics(false);
    }
  };

  const generateAudio = async () => {
    if (!projectDir) return toast.error(ig.errorNoProjectDir);
    if (!block.workflowFile) return toast.error(ig.errorNoWorkflow);
    const hasContent = (block.stylePrompt ?? '').trim() || (block.lyrics ?? '').trim();
    if (!hasContent) return toast.error(ig.errorNoPrompt);

    saveSnapshot();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyAudio(true);
    setGenProgress(null);
    try {
      const workflowJson = await loadComfyWorkflow('comfyui', block.workflowFile, comfyUiWorkflowsDir, projectDir);

      const usedSeed = seedMode === 'random' ? randomSeed() : (Number.isFinite(block.seed) ? block.seed! : 0);
      // ${tags} slot in the workflow receives the style prompt verbatim.
      // Chip clicks already appended chip text into stylePrompt, so no further
      // composition is needed.
      const finalTags = (block.stylePrompt ?? '').trim();

      const result = await generateAudioWithProvider('comfyui', {
        baseUrl: comfyUiUrl,
        workflow: workflowJson,
        tags: finalTags,
        lyrics: block.lyrics,
        seed: usedSeed,
        duration: block.duration,
        bpm: block.bpm,
        onProgress: setGenProgress,
      }, controller.signal);

      if (seedMode === 'random') update({ seed: usedSeed });

      const audioRes = await fsApi.httpRequestBinary({ url: result.audioUrl });
      if (audioRes.status < 200 || audioRes.status >= 300) throw new Error(`Audio download failed: ${audioRes.status}`);
      const ext = result.extHint ?? 'mp3';

      const genId = crypto.randomUUID();
      const relPath = `history/${block.id}/${genId}.${ext}`;
      const absPath = joinPath(projectDir, relPath);
      await fsApi.mkdir(joinPath(projectDir, `history/${block.id}`));
      await fsApi.writeFileBinary(absPath, audioRes.bytes);

      const nextHistory = [
        ...history,
        {
          id: genId,
          src: relPath,
          stylePrompt: block.stylePrompt ?? '',
          lyrics: block.lyrics ?? '',
          seed: usedSeed,
          duration: block.duration,
          bpm: block.bpm,
          createdAt: Date.now(),
          provider: 'comfyui',
        },
      ];
      update({ src: relPath, history: nextHistory });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Cancelled — silent.
      } else {
        console.error('[AudioGen] generation failed:', err);
        setErrorInfo(classifyGenError(err, ig.errorGenerateAudio, errorCopy));
      }
    } finally {
      abortRef.current = null;
      setBusyAudio(false);
      setGenProgress(null);
    }
  };

  const cancelGeneration = () => { abortRef.current?.abort(); };

  // ── Style ↔ chip interop ─────────────────────────────────────────────────
  // Style prompt is a comma-separated list. Chips highlight when their text
  // matches a whole token in the prompt; re-clicking removes ALL matching
  // tokens (covers accidental dupes). Tokens are compared trim()-equal,
  // case-sensitive — chip "rock" doesn't match user-typed "Rock".
  const tokenizeStyle = (style: string): string[] =>
    style.split(',').map(s => s.trim()).filter(Boolean);

  const isTagInStyle = (chip: string): boolean =>
    tokenizeStyle(block.stylePrompt ?? '').includes(chip);

  // Append-or-remove: if the chip is already present as a standalone token,
  // strip every occurrence and re-join. Otherwise append to the end.
  const toggleTagInStyle = (chip: string) => {
    const tokens = tokenizeStyle(block.stylePrompt ?? '');
    if (tokens.includes(chip)) {
      update({ stylePrompt: tokens.filter(t => t !== chip).join(', ') });
      return;
    }
    const current = (block.stylePrompt ?? '').trimEnd();
    if (!current) return update({ stylePrompt: chip });
    if (current.endsWith(',')) return update({ stylePrompt: `${current} ${chip}` });
    update({ stylePrompt: `${current}, ${chip}` });
  };

  const handleClearHistory = () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      clearConfirmTimerRef.current = setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current);
    setClearConfirm(false);
    const kept = history.filter(h => h.src === block.src);
    update({ history: kept });
  };

  const approveAudio = () => {
    if (!projectDir || !block.src) return;
    const raw = block.lastApprovedDir ?? 'audio';
    const subfolder = raw.startsWith('assets/') ? raw.slice('assets/'.length) : raw;
    setApproveFolder(subfolder);
    setApproveFilename(defaultApproveFilename);
    setApproveDialogOpen(true);
  };

  const doApprove = async (folder: string, filename: string) => {
    if (!projectDir || !block.src) return;
    const cleanSubfolder = folder.replace(/^[/\\]+|[/\\]+$/g, '');
    if (cleanSubfolder.includes('..')) {
      toast.error(ig.approveOutsideRelease);
      return;
    }
    const relPath = cleanSubfolder ? `assets/${cleanSubfolder}/${filename}` : `assets/${filename}`;
    const savePath = joinPath(projectDir, 'release', relPath);

    setApproveDialogOpen(false);
    try {
      const parentAbs = joinPath(projectDir, 'release', 'assets', cleanSubfolder || '.');
      await fsApi.mkdir(parentAbs);

      const srcAbs = resolveAssetPath(projectDir, block.src);
      await fsApi.copyFile(srcAbs, savePath);

      if (!audioAssets.has(relPath)) {
        addAsset(null, {
          name: filename,
          assetType: 'audio',
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

  const unapproveAudio = async () => {
    if (!projectDir || !block.src || !isApproved) return;
    try {
      const absPath = resolveAssetPath(projectDir, block.src);
      try { await fsApi.deleteFile(absPath); } catch { /* already gone */ }
      const assetNode = flattenAssets(project.assetNodes).find(a => a.relativePath === block.src);
      if (assetNode) deleteAssetNode(assetNode.id);
      const historyEntry = history.find(h => h.id === block.approvedHistoryId);
      update({ src: historyEntry?.src ?? '', approvedHistoryId: undefined });
    } catch {
      toast.error(ig.errorUnapprove);
    }
  };


  return (
    <div className="flex flex-col gap-2">
      {/* ── Generation settings ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3 rounded bg-slate-900/40 border border-slate-700/50">
        {/* Workflow picker */}
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

        {/* Duration + BPM */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-20 shrink-0">{ig.durationLabel}</label>
            <NumericInput
              min={0}
              step={1}
              float
              className="w-24 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
              placeholder={ig.durationPlaceholder}
              value={block.duration ?? 0}
              onChange={v => update({ duration: v })}
            />
            <span className="text-xs text-slate-500">{ab.seconds}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 shrink-0">{ig.bpmLabel}</label>
            <NumericInput
              min={0}
              step={1}
              className="w-20 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
              placeholder={ig.bpmPlaceholder}
              value={block.bpm ?? 0}
              onChange={v => update({ bpm: v })}
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

        {/* Tags — clicks append into Style above; click again to remove */}
        <StyleChipsEditor
          mode="insert"
          onInsert={toggleTagInStyle}
          isSelected={isTagInStyle}
          label={ig.tagsLabel}
          customPlaceholder={ig.tagsCustomPlaceholder}
          addBtn={ig.tagsAddBtn}
          presetGroups={[
            { label: ig.tagsCategoryGenre,       items: ['rock', 'pop', 'electronic', 'ambient', 'jazz', 'folk', 'hip-hop', 'lo-fi', 'synthwave', 'cinematic'] },
            { label: ig.tagsCategoryVocals,      items: ['male vocals', 'female vocals', 'instrumental', 'choir'] },
            { label: ig.tagsCategoryInstruments, items: ['piano', 'guitar', 'drums', 'synth', 'strings', 'brass', 'bass'] },
            { label: ig.tagsCategoryMoodTempo,   items: ['slow tempo', 'mid-tempo', 'fast tempo', 'energetic', 'melancholic', 'uplifting', 'intimate', 'dramatic'] },
          ]}
        />
      </div>

      {/* ── Style prompt ─────────────────────────────────────────────────── */}
      {/*
        No Manual/LLM mode toggle — the field is always editable, and the
        Format-for-ACE button covers all LLM use cases (generate from empty,
        rephrase prose into ACE form, etc.). Continue/Rephrase/Hint were
        redundant once Format existed, so they're gone.
      */}
      <div className="flex items-start gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0 pt-2">{ig.stylePromptLabel}</label>
        <div className="flex-1 flex flex-col gap-1.5">
          <textarea
            className="w-full bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 min-h-[60px]"
            placeholder={ig.stylePromptPlaceholder}
            value={block.stylePrompt ?? ''}
            onChange={e => update({ stylePrompt: e.target.value })}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={busyFormat || !llmEnabled}
              className="px-2.5 py-1 text-xs rounded disabled:opacity-50 cursor-pointer transition-colors bg-emerald-800/70 hover:bg-emerald-700/70 text-emerald-100 border border-emerald-700/50"
              onClick={formatStyle}
              title={ig.llmModeFormatAce}
            >
              {busyFormat ? ig.llmGenerating : ig.llmModeFormatAce}
            </button>
            <p className="text-[10px] text-slate-500 leading-tight flex-1 min-w-0">{ig.stylePromptHint}</p>
          </div>
        </div>
      </div>

      {/* ── Lyrics ───────────────────────────────────────────────────────── */}
      <ModeToggle
        label={ig.lyricsModeLabel}
        mode={block.lyricsMode ?? 'manual'}
        onModeChange={m => update({ lyricsMode: m })}
        subMode={block.lyricsLlmMode}
        onSub={generateLyrics}
        busy={busyLyrics}
        llmEnabled={llmEnabled}
        copy={{
          manual:       ig.promptModeManual,
          llm:          ig.promptModeLlm,
          continueMode: ig.llmModeContinue,
          rephrase:     ig.llmModeRephrase,
          hint:         ig.llmModeHint,
          generating:   ig.llmGenerating,
        }}
      />
      <div className="flex items-start gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0 pt-2">{ig.lyricsLabel}</label>
        <div className="flex-1 flex flex-col gap-1">
          <textarea
            className="w-full bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 min-h-[120px] font-mono"
            placeholder={ig.lyricsPlaceholder}
            value={block.lyrics ?? ''}
            onChange={e => update({ lyrics: e.target.value })}
          />
          <p className="text-[10px] text-slate-500 leading-tight whitespace-pre-line">{ig.lyricsHint}</p>
        </div>
      </div>

      {/* ── Composed-payload preview (debug helper) ─────────────────────── */}
      <details className="text-xs border border-slate-700/50 rounded bg-slate-900/30">
        <summary className="cursor-pointer text-slate-400 px-2 py-1 hover:bg-slate-800/50 select-none">
          {ig.composedPreviewLabel}
        </summary>
        <div className="px-2 pb-2 pt-1 font-mono text-[10px] text-slate-300 space-y-1">
          {(() => {
            const composedTags = (block.stylePrompt ?? '').trim();
            const usedSeed = seedMode === 'manual' ? (block.seed ?? 0) : null;
            const rows: [string, string][] = [
              [ig.composedPreviewTagsLabel,     composedTags || ig.composedPreviewEmpty],
              [ig.composedPreviewLyricsLabel,   (block.lyrics ?? '') || ig.composedPreviewEmpty],
              [ig.composedPreviewSeedLabel,     usedSeed !== null ? String(usedSeed) : 'random (assigned at generation time)'],
              [ig.composedPreviewDurationLabel, block.duration !== undefined ? String(block.duration) : ig.composedPreviewEmpty],
              [ig.composedPreviewBpmLabel,      block.bpm !== undefined ? String(block.bpm) : ig.composedPreviewEmpty],
            ];
            return rows.map(([tok, val]) => (
              <div key={tok} className="flex gap-2">
                <span className="text-slate-500 shrink-0">{tok}</span>
                <span className="text-slate-300 break-all whitespace-pre-wrap">{val}</span>
              </div>
            ));
          })()}
        </div>
      </details>

      {/* ── Generate / Cancel ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busyAudio}
            className="px-3 py-1.5 text-xs rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white cursor-pointer"
            onClick={generateAudio}
          >
            {busyAudio ? ig.generatingAudio : ig.generateAudio}
          </button>
          {busyAudio && (
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
        {busyAudio && (
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

      {/* ── History ──────────────────────────────────────────────────────── */}
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

      {/* ── Approve / Unapprove ──────────────────────────────────────────── */}
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
                title={ig.unapproveAudioTitle}
                className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-red-800 text-slate-300 hover:text-white cursor-pointer transition-colors"
                onClick={unapproveAudio}
              >
                {ig.unapproveAudio}
              </button>
            </>
          ) : (
            <>
              <span className="text-xs px-2 py-0.5 rounded bg-amber-900/50 border border-amber-700 text-amber-400">
                <EmojiIcon name="warning" size={20} /> {ig.draftBadge}
              </span>
              <button
                type="button"
                title={ig.approveAudioTitle}
                className="px-2 py-1 text-xs rounded bg-emerald-800 hover:bg-emerald-700 text-white cursor-pointer transition-colors"
                onClick={approveAudio}
              >
                {ig.approveAudio}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Audio preview ────────────────────────────────────────────────── */}
      {/*
        We render the <audio> element as soon as block.src is set, even before
        the blob URL is ready, so the controls always show up while the bytes
        load. Browsers tolerate a transient empty `src`.
      */}
      {block.src && (
        <audio
          src={previewBlobUrl ?? undefined}
          controls
          className="w-full"
        />
      )}

      {/* ── Playback settings ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3 rounded bg-slate-900/40 border border-slate-700/50 mt-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{ig.playbackSection}</div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0">{ab.triggerLabel}</label>
          <div className="flex items-center gap-3">
            {(['immediate', 'delay'] as const).map(tr => (
              <label key={tr} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  className="accent-indigo-500"
                  name={`audiogen-trigger-${block.id}`}
                  checked={block.trigger === tr}
                  onChange={() => update({ trigger: tr })}
                />
                <span className="text-xs text-slate-300">
                  {tr === 'immediate' ? ab.triggerImmediate : ab.triggerDelay}
                </span>
              </label>
            ))}
            {block.trigger === 'delay' && (
              <div className="flex items-center gap-1">
                <NumericInput
                  className="w-16 bg-slate-800 text-sm text-white rounded px-2 py-0.5 outline-none border border-slate-600 focus:border-indigo-500"
                  min={0}
                  step={0.5}
                  float
                  value={block.triggerDelay ?? 0}
                  onChange={v => update({ triggerDelay: v })}
                />
                <span className="text-xs text-slate-500">{ab.seconds}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0">{ab.onLeaveLabel}</label>
          <div className="flex items-center gap-3">
            {(['stop', 'persist'] as const).map(b => (
              <label key={b} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  className="accent-indigo-500"
                  name={`audiogen-onleave-${block.id}`}
                  checked={block.onLeave === b}
                  onChange={() => update({ onLeave: b })}
                />
                <span className="text-xs text-slate-300">
                  {b === 'stop' ? ab.onLeaveStop : ab.onLeavePersist}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="accent-indigo-500"
              checked={block.loop}
              onChange={e => update({ loop: e.target.checked })}
            />
            <span className="text-xs text-slate-300">{ab.loop}</span>
          </label>
          <div className="flex flex-col gap-0.5">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                className="accent-indigo-500"
                checked={block.stopOthers}
                onChange={e => update({ stopOthers: e.target.checked })}
              />
              <span className="text-xs text-slate-300">{ab.stopOthers}</span>
            </label>
            {block.stopOthers && (
              <p className="text-xs text-slate-500 ml-5">{ab.stopOthersHint}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-20 shrink-0">{ab.volumeLabel}</label>
          <input
            type="range"
            min="0"
            max="100"
            value={block.volume}
            onChange={e => update({ volume: parseInt(e.target.value) })}
            className="flex-1 accent-indigo-500"
          />
          <span className="text-xs text-slate-400 w-10 text-right">{block.volume}%</span>
        </div>
      </div>

      {/* ── Error modal ─────────────────────────────────────────────────── */}
      {errorInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => { setErrorInfo(null); setErrorCopied(false); }}
        >
          <div
            className="relative bg-slate-800 border border-red-700/60 rounded-lg shadow-2xl w-[560px] max-h-[80vh] p-4 flex flex-col gap-3 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <EmojiIcon name="warning" size={22} />
              <h3 className="text-sm font-semibold text-red-300">{errorInfo.title}</h3>
            </div>

            {/* Category banner — short, human-readable tldr of what likely went wrong */}
            <div className="inline-flex self-start text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-900/40 border border-amber-700/60 text-amber-300">
              {errorInfo.categoryLabel}
            </div>

            {/* Summary — direct error message */}
            <p className="text-xs text-slate-200 bg-red-950/30 border border-red-900/50 rounded px-2 py-1.5 break-all whitespace-pre-wrap font-mono">
              {errorInfo.summary}
            </p>

            {/* Contextual hints */}
            {errorInfo.hints.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  {ig.errorModalHintsHeader}
                </div>
                <ul className="text-xs text-slate-300 list-disc list-inside space-y-1">
                  {errorInfo.hints.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </div>
            )}

            {/* Technical details (collapsible, scrollable) */}
            <details className="text-[10px] text-slate-500 border border-slate-700 rounded bg-slate-900/50 overflow-hidden">
              <summary className="cursor-pointer text-slate-400 px-2 py-1 hover:bg-slate-800/50 select-none">
                {ig.errorModalTechnicalDetails}
              </summary>
              <pre className="px-2 py-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-slate-400">
                {errorInfo.technicalDetails}
              </pre>
            </details>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 text-xs text-slate-300 hover:text-white rounded border border-slate-600 hover:border-slate-400 transition-colors cursor-pointer"
                onClick={async () => {
                  const payload = [
                    errorInfo.title,
                    '',
                    'Summary:',
                    errorInfo.summary,
                    '',
                    'Possible causes:',
                    ...errorInfo.hints.map(h => `  - ${h}`),
                    '',
                    'Technical details:',
                    errorInfo.technicalDetails,
                  ].join('\n');
                  try {
                    await navigator.clipboard.writeText(payload);
                    setErrorCopied(true);
                    setTimeout(() => setErrorCopied(false), 1500);
                  } catch {
                    // clipboard write may fail in some sandboxed contexts — silently ignore
                  }
                }}
              >
                {errorCopied ? ig.errorModalCopied : ig.errorModalCopyDetails}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs text-white rounded bg-slate-700 hover:bg-slate-600 transition-colors cursor-pointer"
                onClick={() => { setErrorInfo(null); setErrorCopied(false); }}
              >
                {ig.errorModalClose}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve dialog ───────────────────────────────────────────────── */}
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

            {previewBlobUrl && (
              <audio
                src={previewBlobUrl}
                controls
                className="w-full"
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
                  placeholder="audio"
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
