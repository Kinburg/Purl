import { create } from 'zustand';
import type { Block } from '../types';

/**
 * Ephemeral (non-persisted) editor state — clipboard, search query, and other session-only data.
 */
interface EditorState {
  /** Block copied to clipboard; null when clipboard is empty. */
  clipboardBlock: Block | null;
  copyToClipboard: (block: Block) => void;
  clearClipboard: () => void;

  /** Current search query string (empty = no search active). */
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  /** Whether the Project Settings modal is open. */
  projectSettingsOpen: boolean;
  setProjectSettingsOpen: (open: boolean) => void;

  /** Whether the Editor Preferences modal is open. */
  editorPrefsOpen: boolean;
  setEditorPrefsOpen: (open: boolean) => void;

  /** Whether the LLM Settings modal is open. */
  llmSettingsOpen: boolean;
  setLLMSettingsOpen: (open: boolean) => void;

  /** Whether the Find & Replace modal is open. */
  replaceOpen: boolean;
  setReplaceOpen: (open: boolean) => void;

  /** Currently open plugin editor (null = closed). Either a plugin id (edit existing) or 'new' (create). */
  pluginEditorTarget: string | null;
  openPluginEditor: (id: string | 'new') => void;
  closePluginEditor: () => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  clipboardBlock: null,
  copyToClipboard: (block) => set({ clipboardBlock: block }),
  clearClipboard: () => set({ clipboardBlock: null }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  projectSettingsOpen: false,
  setProjectSettingsOpen: (open) => set({ projectSettingsOpen: open }),

  editorPrefsOpen: false,
  setEditorPrefsOpen: (open) => set({ editorPrefsOpen: open }),

  llmSettingsOpen: false,
  setLLMSettingsOpen: (open) => set({ llmSettingsOpen: open }),

  replaceOpen: false,
  setReplaceOpen: (open) => set({ replaceOpen: open }),

  pluginEditorTarget: null,
  openPluginEditor: (id) => set({ pluginEditorTarget: id }),
  closePluginEditor: () => set({ pluginEditorTarget: null }),
}));
