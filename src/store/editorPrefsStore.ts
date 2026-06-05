import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BlockType } from '../types';
import type { LLMProvider } from '../utils/llm';

// ── Panel layout (single-window split panels) ──────────────────────────────

export interface PanelLayout {
  previewVisible: boolean;
  graphVisible:   boolean;
  /** Playable-preview column — sits between the editor and the code/graph column. */
  playVisible?:   boolean;
  // Horizontal split weights across the visible columns (editor / play / right).
  // Relative — normalized over whichever columns are visible at render time.
  // Optional for back-compat with layouts persisted before the 3-column split.
  editorWeight?:  number;   // default 50
  playWeight?:    number;   // default 38
  rightWeight?:   number;   // default 34
  previewSizePct: number;   // % height of code preview vs graph in the right column (default 50)
}

export interface PanelLayoutPreset {
  id:       string;
  name:     string;
  builtIn:  boolean;
  layout:   PanelLayout;
}

export const BUILTIN_PANEL_PRESETS: PanelLayoutPreset[] = [
  { id: '__bp_all',           builtIn: true, name: 'All Panels',   layout: { previewVisible: true,  graphVisible: true,  playVisible: false, editorWeight: 50,  playWeight: 38, rightWeight: 34, previewSizePct: 50 } },
  { id: '__bp_flow',          builtIn: true, name: 'Flow',         layout: { previewVisible: false, graphVisible: true,  playVisible: false, editorWeight: 60,  playWeight: 38, rightWeight: 40, previewSizePct: 50 } },
  { id: '__bp_code_preview',  builtIn: true, name: 'Code Preview', layout: { previewVisible: true,  graphVisible: false, playVisible: false, editorWeight: 60,  playWeight: 38, rightWeight: 40, previewSizePct: 50 } },
  { id: '__bp_play',          builtIn: true, name: 'Play',         layout: { previewVisible: false, graphVisible: false, playVisible: true,  editorWeight: 55,  playWeight: 45, rightWeight: 34, previewSizePct: 50 } },
  { id: '__bp_constructor',   builtIn: true, name: 'Constructor',  layout: { previewVisible: false, graphVisible: false, playVisible: false, editorWeight: 100, playWeight: 38, rightWeight: 34, previewSizePct: 50 } },
];

export interface EditorPrefs {
  // ── Autosave ──────────────────────────────────────────────────────────────
  autosave:         boolean;
  autosaveInterval: number;   // minutes: 1 | 5 | 10 | 30
  saveOnExit:       boolean;

  // ── Appearance ────────────────────────────────────────────────────────────
  compactMode: boolean;
  /** Subtle knit / yarn texture across the UI (echoes the app name "Purl"). Cosmetic. */
  knitTheme: boolean;

  // ── Validator ───────────────────────────────────────────────────────────────
  /** 'live' = the Validate panel recomputes automatically (debounced); 'manual' =
   *  it runs only when the panel's Run button is pressed (better for huge stories). */
  validationMode: 'live' | 'manual';

  // ── Preview / Play compile ──────────────────────────────────────────────────
  /** 'live' = Code Preview & the Play panel rebuild automatically (debounced);
   *  'manual' = they rebuild only on the panel's Compile/Run button (better for
   *  huge stories where rebuilding on every edit would lag). */
  compileMode: 'live' | 'manual';
  /** 'live' = the Stats panel recomputes automatically (debounced); 'manual' = only
   *  on the panel's Refresh button (better for huge stories). */
  statsMode: 'live' | 'manual';
  /** 'live' = the scene graph rebuilds automatically (debounced); 'manual' = only on
   *  the graph's Refresh button (the graph re-layout is the heaviest panel). */
  graphMode: 'live' | 'manual';
  /** Height (px) of the Play-panel inspector pane (variables + errors). */
  playInspectorSizePx?: number;

  // ── Confirm on delete ─────────────────────────────────────────────────────
  confirmDeleteScene:     boolean;
  confirmDeleteGroup:     boolean;
  confirmDeleteVariable:  boolean;
  confirmDeleteWatcher:   boolean;
  confirmDeleteBlock:     boolean;
  confirmDeleteCharacter: boolean;

  // ── Group deletion behaviour ──────────────────────────────────────────────
  /** true = delete the group AND all scenes inside it; false = ungroup only */
  deleteGroupWithScenes: boolean;

  // ── Export ────────────────────────────────────────────────────────────────
  confirmOpenFolderAfterExport: boolean;

  // ── Projects ────────────────────────────────────────────────────────────────
  /** Default parent folder suggested when creating / first-saving a project.
   *  A sub-folder named after the project is created inside it.
   *  Empty = use the built-in default (Documents/Purl/Projects). */
  projectsDir: string;

  // ── Add-block menu ──────────────────────────────────────────────────────
  recentBlockTypes: BlockType[];

  // ── Panel layout ──────────────────────────────────────────────────────────
  panelLayout: PanelLayout;
  panelPresets: PanelLayoutPreset[];       // user-defined presets
  activePanelPresetId: string | null;

  // ── LLM ────────────────────────────────────────────────────────────────────
  llmEnabled:          boolean;
  llmProvider:         LLMProvider;
  llmUrl:              string; // KoboldCPP URL
  llmGeminiApiKey:     string; // Gemini API Key (separate from KoboldCPP URL)
  llmGeminiModel:      string;
  llmGeminiModelsList: string[]; // Cache for fetched Gemini models (model names)
  llmOpenaiUrl:        string; // OpenAI-compatible endpoint URL
  llmOpenaiApiKey:     string; // OpenAI-compatible API key
  llmOpenaiModel:      string; // OpenAI-compatible model name
  llmMaxTokens:        number;
  llmTemperature:      number;
  llmSystemPrompt:     string;
  llmFilterThought:    boolean; // Filter <thought> blocks
  llmGenerationHistory: 'memory' | 'project' | 'disabled';

  // ── Image Generation ──────────────────────────────────────────────────────
  /** Global default image generation provider. */
  imageGenProvider: 'comfyui' | 'pollinations';
  /** Global ComfyUI server URL. */
  comfyUiUrl: string;
  /** Global ComfyUI workflows folder. Empty = use comfyUI_workflows/ inside each project. */
  comfyUiWorkflowsDir: string;
  /** Global Pollinations model (empty = use default 'flux'). */
  pollinationsModel: string;
  /** Global Pollinations API token. */
  pollinationsToken: string;
}

const DEFAULTS: EditorPrefs = {
  autosave:         false,
  autosaveInterval: 5,
  saveOnExit:       false,

  compactMode: false,
  knitTheme: true,

  validationMode: 'live',
  compileMode: 'live',
  statsMode: 'live',
  graphMode: 'live',
  playInspectorSizePx: 220,

  confirmDeleteScene:     true,
  confirmDeleteGroup:     true,
  confirmDeleteVariable:  true,
  confirmDeleteWatcher:   true,
  confirmDeleteBlock:     false,
  confirmDeleteCharacter: true,

  deleteGroupWithScenes: false,

  confirmOpenFolderAfterExport: true,

  projectsDir: '',

  recentBlockTypes: [],

  panelLayout: { previewVisible: false, graphVisible: false, playVisible: false, editorWeight: 50, playWeight: 38, rightWeight: 34, previewSizePct: 50 },
  panelPresets: [],
  activePanelPresetId: null,

  llmEnabled:          false,
  llmProvider:         'koboldcpp',
  llmUrl:              'http://localhost:5001/api/v1/generate',
  llmGeminiApiKey:     '',
  llmGeminiModel:      'gemma-4-31b-it',
  llmGeminiModelsList: [],
  llmOpenaiUrl:        'https://api.openai.com/v1/chat/completions',
  llmOpenaiApiKey:     '',
  llmOpenaiModel:      'gpt-4o-mini',
  llmMaxTokens:        200,
  llmTemperature:      0.7,
  llmSystemPrompt:     'You are a professional storyteller. Write a continuation of the story based on the context provided. Maintain the tone and style of the existing text.',
  llmFilterThought:    true,
  llmGenerationHistory: 'memory',

  imageGenProvider:    'comfyui',
  comfyUiUrl:          'http://127.0.0.1:8188',
  comfyUiWorkflowsDir: '',
  pollinationsModel:   '',
  pollinationsToken:   '',
};

const MAX_RECENT = 5;

interface EditorPrefsState extends EditorPrefs {
  setPrefs: (patch: Partial<EditorPrefs>) => void;
  trackRecentBlock: (type: BlockType) => void;
  // Panel layout actions
  setPanelLayout: (patch: Partial<PanelLayout>) => void;
  togglePreviewPanel: () => void;
  toggleGraphPanel: () => void;
  togglePlayPanel: () => void;
  savePanelPreset: (name: string) => void;
  applyPanelPreset: (id: string) => void;
  overwritePanelPreset: (id: string) => void;
  deletePanelPreset: (id: string) => void;
}

export const useEditorPrefsStore = create<EditorPrefsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      setPrefs: (patch) => set(patch),
      trackRecentBlock: (type) => set((s) => ({
        recentBlockTypes: [type, ...s.recentBlockTypes.filter((t) => t !== type)].slice(0, MAX_RECENT),
      })),

      // ── Panel layout actions ───────────────────────────────────────────────
      setPanelLayout: (patch) => set((s) => ({
        panelLayout: { ...s.panelLayout, ...patch },
        activePanelPresetId: null,
      })),

      // Visibility toggles just flip the flag — column widths auto-normalize from
      // the stored weights in WorkspaceLayout, so a newly-opened column gets its
      // share without any manual size juggling here.
      togglePreviewPanel: () => set((s) => ({
        panelLayout: { ...s.panelLayout, previewVisible: !s.panelLayout.previewVisible },
        activePanelPresetId: null,
      })),

      toggleGraphPanel: () => set((s) => ({
        panelLayout: { ...s.panelLayout, graphVisible: !s.panelLayout.graphVisible },
        activePanelPresetId: null,
      })),

      togglePlayPanel: () => set((s) => ({
        panelLayout: { ...s.panelLayout, playVisible: !(s.panelLayout.playVisible ?? false) },
        activePanelPresetId: null,
      })),

      savePanelPreset: (name) => set((s) => ({
        panelPresets: [
          ...s.panelPresets,
          { id: crypto.randomUUID(), name, builtIn: false, layout: { ...s.panelLayout } },
        ],
      })),

      applyPanelPreset: (id) => {
        const all = [...BUILTIN_PANEL_PRESETS, ...get().panelPresets];
        const preset = all.find(p => p.id === id);
        if (!preset) return;
        set({ panelLayout: { ...preset.layout }, activePanelPresetId: id });
      },

      overwritePanelPreset: (id) => set((s) => ({
        panelPresets: s.panelPresets.map(p =>
          p.id === id ? { ...p, layout: { ...s.panelLayout } } : p,
        ),
        activePanelPresetId: id,
      })),

      deletePanelPreset: (id) => set((s) => ({
        panelPresets: s.panelPresets.filter(p => p.id !== id),
        activePanelPresetId: s.activePanelPresetId === id ? null : s.activePanelPresetId,
      })),
    }),
    {
      name: 'purl-editor-prefs',
      onRehydrateStorage: () => (state) => {
        // Migration: move Gemini API key from llmUrl to llmGeminiApiKey
        if (
          state &&
          !state.llmGeminiApiKey &&
          state.llmUrl &&
          state.llmUrl !== 'http://localhost:5001/api/v1/generate' &&
          !state.llmUrl.startsWith('http')
        ) {
          state.llmGeminiApiKey = state.llmUrl;
          state.llmUrl = 'http://localhost:5001/api/v1/generate';
        }
      },
    },
  ),
);
