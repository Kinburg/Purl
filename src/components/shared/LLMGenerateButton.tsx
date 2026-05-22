import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationHistoryStore } from '../../store/generationHistoryStore';
import { generateText, abortGeneration, type LLMMode } from '../../utils/llm';
import type { GenerationHistoryEntry } from '../../types';
import { toast } from 'sonner';
import { useT } from '../../i18n';

const MAX_PROJECT_HISTORY = 10;

interface Props {
  sceneId: string;
  blockId: string;
  currentValue: string;
  onGenerated: (text: string) => void;
  onStreaming?: (text: string) => void;
}

export function LLMGenerateButton({ sceneId, blockId, currentValue, onGenerated, onStreaming }: Props) {
  const t = useT();
  const llmT = t.llmGenerateButton;
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
    llmFilterThought,
    llmGenerationHistory,
    llmTranslationLanguage,
  } = useEditorPrefsStore();
  const { project, saveSnapshot, updateBlock } = useProjectStore();
  const memHistory = useGenerationHistoryStore();
  const [loading, setLoading] = useState<LLMMode | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // History navigation state
  const entries = llmGenerationHistory === 'memory'
    ? memHistory.getEntries(blockId)
    : llmGenerationHistory === 'project'
      ? getProjectHistory(project, sceneId, blockId)
      : [];
  const histIndex = llmGenerationHistory === 'memory'
    ? memHistory.getIndex(blockId)
    : -1; // for project mode, we don't track index (always at latest)
  const [projHistIndex, setProjHistIndex] = useState(-1);
  const activeIndex = llmGenerationHistory === 'memory' ? histIndex : projHistIndex;
  const hasHistory = entries.length > 0;

  // Reset project history index when entries change
  useEffect(() => {
    if (llmGenerationHistory === 'project' && entries.length > 0) {
      setProjHistIndex(entries.length - 1);
    }
  }, [entries.length, llmGenerationHistory]);

  const toggle = useCallback(() => {
    if (loading) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      abortGeneration(llmProvider, llmUrl);
      setLoading(null);
      toast.info(llmT.generationStopped);
      return;
    }

    if (open) {
      setOpen(false);
      return;
    }
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const left = Math.min(rect.right - 220, window.innerWidth - 228);
      setPos({ top: rect.bottom + 2, left: Math.max(4, left) });
    }
    setOpen(true);
  }, [open, loading, llmUrl, llmProvider]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [open]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (!llmEnabled) return null;

  const addToHistory = (text: string, mode: LLMMode) => {
    if (llmGenerationHistory === 'disabled') return;

    const entry: GenerationHistoryEntry = {
      text,
      mode,
      timestamp: Date.now(),
    };

    if (llmGenerationHistory === 'memory') {
      memHistory.addEntry(blockId, entry);
    } else if (llmGenerationHistory === 'project') {
      const scene = project.scenes.find(s => s.id === sceneId);
      const block = scene?.blocks.find(b => b.id === blockId);
      if (block && (block.type === 'text' || block.type === 'dialogue')) {
        const existing = (block as any).generationHistory ?? [];
        const updated = [...existing, entry].slice(-MAX_PROJECT_HISTORY);
        updateBlock(sceneId, blockId, { generationHistory: updated });
      }
    }
  };

  const navigateHistory = (direction: -1 | 1) => {
    if (llmGenerationHistory === 'disabled' || entries.length === 0) return;

    let targetEntry: GenerationHistoryEntry | null = null;

    if (llmGenerationHistory === 'memory') {
      targetEntry = memHistory.navigate(blockId, direction);
    } else {
      const next = projHistIndex + direction;
      if (next >= 0 && next < entries.length) {
        setProjHistIndex(next);
        targetEntry = entries[next];
      }
    }

    if (targetEntry) {
      saveSnapshot();
      onGenerated(targetEntry.text);
    }
  };

  const handleGenerate = async (mode: LLMMode) => {
    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setOpen(false);
    setLoading(mode);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let urlOrApiKey = llmUrl;
      let model = llmGeminiModel;
      if (llmProvider === 'gemini') {
        urlOrApiKey = llmGeminiApiKey;
      } else if (llmProvider === 'openai') {
        urlOrApiKey = llmOpenaiUrl;
        model = llmOpenaiModel;
      }

      let temperature = llmTemperature;
      const targetBlock = scene.blocks.find(b => b.id === blockId);
      if (targetBlock?.type === 'dialogue') {
        const char = project.characters.find(c => c.id === (targetBlock as any).characterId);
        if (char?.llm_temperature !== undefined) {
          temperature = char.llm_temperature;
        }
      }

      saveSnapshot();
      const result = await generateText(
        llmProvider,
        urlOrApiKey,
        model,
        llmSystemPrompt,
        project,
        scene,
        blockId,
        currentValue,
        {
          maxTokens: llmMaxTokens,
          temperature,
          filterThought: llmFilterThought,
          translationLanguage: llmTranslationLanguage,
        },
        mode,
        controller.signal,
        onStreaming,
        llmProvider === 'openai' ? llmOpenaiApiKey : undefined
      );

      if (result) {
        const trimmed = result.trim();
        onGenerated(trimmed);
        addToHistory(trimmed, mode);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Stopped by user
      } else {
        toast.error(llmT.generateFailed(llmProvider));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(null);
        abortControllerRef.current = null;
      }
    }
  };

  const canGoBack = hasHistory && activeIndex > 0;
  const canGoForward = hasHistory && activeIndex < entries.length - 1;

  return (
    <>
      {/* History navigation arrows */}
      {hasHistory && llmGenerationHistory !== 'disabled' && (
        <>
          <button
            type="button"
            disabled={!canGoBack}
            onClick={() => navigateHistory(-1)}
            className="px-0.5 py-0.5 text-xs border rounded cursor-pointer transition-colors leading-none flex items-center justify-center text-slate-500 hover:text-indigo-400 bg-slate-800 border-slate-600 hover:border-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
            title={llmT.prevGeneration}
          >
            <ChevronLeftIcon />
          </button>
          <span className="text-[9px] text-slate-500 tabular-nums leading-none flex items-center">
            {activeIndex + 1}/{entries.length}
          </span>
          <button
            type="button"
            disabled={!canGoForward}
            onClick={() => navigateHistory(1)}
            className="px-0.5 py-0.5 text-xs border rounded cursor-pointer transition-colors leading-none flex items-center justify-center text-slate-500 hover:text-indigo-400 bg-slate-800 border-slate-600 hover:border-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
            title={llmT.nextGeneration}
          >
            <ChevronRightIcon />
          </button>
        </>
      )}

      {/* Generate button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={`px-1.5 py-0.5 text-xs border rounded cursor-pointer transition-colors leading-none flex items-center justify-center ${
          open || loading
            ? 'text-indigo-400 bg-slate-700 border-indigo-500'
            : 'text-slate-500 hover:text-indigo-400 bg-slate-800 border-slate-600 hover:border-indigo-500'
        }`}
        title={loading ? llmT.stopGeneration : llmT.aiTools}
      >
        {loading ? <StopLoadingIcon /> : <SparklesIcon />}
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          className="fixed z-[9999] bg-slate-800 border border-slate-600 rounded shadow-lg overflow-hidden py-1"
          style={{ top: pos.top, left: pos.left, width: 220 }}
        >
          <MenuOption
            icon={<GenerateIcon />}
            label={llmT.continueGeneration}
            onClick={() => handleGenerate('continue')}
            colorClass="text-indigo-400"
          />
          <MenuOption
            icon={<RephraseIcon />}
            label={llmT.rephraseImprove}
            disabled={!currentValue.trim()}
            onClick={() => handleGenerate('rephrase')}
            colorClass="text-emerald-400"
          />
          <MenuOption
            icon={<HintIcon />}
            label={llmT.generateFromHint}
            disabled={!currentValue.trim()}
            onClick={() => handleGenerate('hint')}
            colorClass="text-amber-400"
          />
          <MenuOption
            icon={<TranslateIcon />}
            label={llmT.translateTo(llmTranslationLanguage || 'English')}
            disabled={!currentValue.trim()}
            onClick={() => handleGenerate('translate')}
            colorClass="text-sky-400"
          />
        </div>
      )}
    </>
  );
}

// --- Helper: read project-stored history ---

function getProjectHistory(project: any, sceneId: string, blockId: string): GenerationHistoryEntry[] {
  const scene = project.scenes?.find((s: any) => s.id === sceneId);
  const block = scene?.blocks?.find((b: any) => b.id === blockId);
  return block?.generationHistory ?? [];
}

// --- Sub-components ---

function MenuOption({
  icon,
  label,
  onClick,
  disabled,
  colorClass
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  colorClass: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      onClick={onClick}
    >
      <span className={`shrink-0 ${colorClass}`}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function StopLoadingIcon() {
  return (
    <div className="relative h-4 w-4 flex items-center justify-center">
      <svg className="animate-spin h-4 w-4 absolute" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <div className="h-1.5 w-1.5 bg-indigo-400 rounded-sm" />
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function GenerateIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function RephraseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function HintIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function TranslateIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
    </svg>
  );
}
