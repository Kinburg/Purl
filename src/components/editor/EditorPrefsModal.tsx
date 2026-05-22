import { useEditorPrefsStore, BUILTIN_PANEL_PRESETS } from '../../store/editorPrefsStore';
import type { PanelLayoutPreset } from '../../store/editorPrefsStore';
import { useT, useLocaleStore, getLocales } from '../../i18n';
import type { Translations } from '../../i18n/types';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  ModalShell, ModalBody,
  Toggle, Segmented, PasswordInput,
  INPUT_CLS,
  ModalField, ModalRow, ModalSection,
} from '../shared/ModalShell';
import {
  type LLMProvider, fetchGeminiModels, classifyModel, type GeminiModelWithTier,
} from '../../utils/llm';
import { toast } from 'sonner';

const AUTOSAVE_INTERVALS = [1, 5, 10, 30] as const;

type TabId = 'appearance' | 'shortcuts' | 'workspace' | 'behavior' | 'ai';

interface Props {
  onClose: () => void;
  /** Tab to open on mount. Defaults to 'appearance'. */
  initialTab?: TabId;
}

export function EditorPrefsModal({ onClose, initialTab = 'appearance' }: Props) {
  const t  = useT();
  const ep = t.editorPrefs;
  const [tab, setTab] = useState<TabId>(initialTab);

  // Tabs definition — labels from i18n if present, fallback to English
  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: 'appearance', label: ep.tabAppearance, icon: <IconPalette /> },
    { id: 'shortcuts',  label: ep.tabShortcuts,  icon: <IconCommand /> },
    { id: 'workspace',  label: ep.tabWorkspace,  icon: <IconLayout /> },
    { id: 'behavior',   label: ep.tabBehavior,   icon: <IconCog /> },
    { id: 'ai',         label: ep.tabAi,         icon: <IconSparkle /> },
  ];

  return (
    <ModalShell onClose={onClose} width={900} height={600}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-700">
        <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
          <IconCog />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-100 leading-tight">{ep.title}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {ep.subtitle}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 transition-colors p-1 -m-1 cursor-pointer"
          aria-label={ep.close}
        >
          <IconX />
        </button>
      </div>

      {/* ── Body: sidebar + content ────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
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

        {/* Content */}
        <ModalBody className="flex-1 gap-6 px-6 py-5">
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'shortcuts'  && <ShortcutsTab />}
          {tab === 'workspace'  && <WorkspaceTab />}
          {tab === 'behavior'   && <BehaviorTab />}
          {tab === 'ai'         && <AiTab />}
        </ModalBody>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-700">
        <span className="text-[11px] text-slate-500 font-mono">
          {ep.footerHint}
        </span>
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer transition-colors"
        >
          {t.common.confirm}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Section helpers ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
      {children}
    </h3>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  APPEARANCE TAB
// ═══════════════════════════════════════════════════════════════════════════

function AppearanceTab() {
  const t  = useT();
  const ep = t.editorPrefs;
  const { compactMode, setPrefs } = useEditorPrefsStore();
  const { locale, setLocale } = useLocaleStore();
  const locales = getLocales();

  return (
    <>
      {/* Theme — dark only for now */}
      <Section title={ep.sectionTheme}>
        <div className="grid grid-cols-3 gap-3">
          <ThemeCard name={ep.themeDark} active swatch={['#0f172a', '#1e293b']} />
          <ThemeCard name={ep.themeMidnight} locked swatch={['#020617', '#0b1220']} />
          <ThemeCard name={ep.themeWarm} locked swatch={['#1c1917', '#292524']} />
        </div>
      </Section>

      {/* Density (compactMode boolean → two-option segmented) */}
      <Section title={ep.sectionDensity}>
        <Segmented
          value={compactMode ? 'compact' : 'comfortable'}
          onChange={v => setPrefs({ compactMode: v === 'compact' })}
          options={[
            { value: 'compact',     label: ep.densityCompact },
            { value: 'comfortable', label: ep.densityComfortable },
          ]}
        />
      </Section>

      {/* Interface language */}
      <Section title={ep.sectionLanguage}>
        <Segmented
          value={locale}
          onChange={setLocale}
          options={locales.map(l => ({ value: l.code, label: l.code.toUpperCase() }))}
        />
      </Section>
    </>
  );
}

function ThemeCard({
  name, swatch, active, locked,
}: {
  name: string;
  swatch: [string, string];
  active?: boolean;
  locked?: boolean;
}) {
  const ep = useT().editorPrefs;
  return (
    <div
      className={`rounded-lg border overflow-hidden transition-all ${
        active
          ? 'border-indigo-500 ring-2 ring-indigo-500/30'
          : locked
          ? 'border-slate-700 opacity-50'
          : 'border-slate-600 hover:border-slate-400 cursor-pointer'
      }`}
    >
      <div
        className="h-20 w-full"
        style={{
          background: `linear-gradient(135deg, ${swatch[0]} 0%, ${swatch[1]} 100%)`,
        }}
      />
      <div className="px-3 py-2 flex items-center justify-between bg-slate-800/60">
        <span className="text-xs text-slate-200">{name}</span>
        {active && <span className="text-[10px] text-indigo-300">●</span>}
        {locked && <span className="text-[9px] text-slate-500 uppercase tracking-wider">{ep.soon}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHORTCUTS TAB (read-only)
// ═══════════════════════════════════════════════════════════════════════════

const SHORTCUT_GROUPS: { titleKey: keyof Translations['editorPrefs']; items: [string, keyof Translations['editorPrefs']][] }[] = [
  {
    titleKey: 'shortcutsGeneral',
    items: [
      ['Ctrl+S',       'saveProject'],
      ['Ctrl+Z',       'undo'],
      ['Ctrl+Shift+Z', 'redo'],
      ['Ctrl+,',       'openPreferences'],
      ['Ctrl+Shift+P', 'projectSettings'],
    ],
  },
  {
    titleKey: 'shortcutsEditor',
    items: [
      ['Ctrl+F',       'find'],
      ['Ctrl+H',       'replace'],
      ['Ctrl+/',       'toggleComment'],
      ['Alt+↑ / Alt+↓', 'moveLine'],
    ],
  },
  {
    titleKey: 'shortcutsNavigation',
    items: [
      ['Ctrl+1..4',    'switchWorkspaceTab'],
      ['Ctrl+Tab',     'nextScene'],
      ['Ctrl+Shift+Tab','previousScene'],
      ['Esc',          'closeModalCancel'],
    ],
  },
];

function ShortcutsTab() {
  const t  = useT();
  const ep = t.editorPrefs;

  return (
    <>
      <p className="text-xs text-slate-400 -mt-1">
        {ep.shortcutsHint}
      </p>
      {SHORTCUT_GROUPS.map(group => (
        <Section key={group.titleKey as string} title={ep[group.titleKey] as string}>
          <div className="rounded-md border border-slate-700 overflow-hidden">
            {group.items.map(([combo, descKey], i) => (
              <div
                key={combo}
                className={`flex items-center justify-between px-3 py-2 text-xs ${
                  i > 0 ? 'border-t border-slate-700/60' : ''
                }`}
              >
                <span className="text-slate-300">{ep[descKey] as string}</span>
                <kbd className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900/60 border border-slate-600 text-slate-200">
                  {combo}
                </kbd>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  WORKSPACE TAB
// ═══════════════════════════════════════════════════════════════════════════

function WorkspaceTab() {
  const t  = useT();
  const ep = t.editorPrefs;
  const {
    panelPresets, activePanelPresetId,
    savePanelPreset, applyPanelPreset, overwritePanelPreset, deletePanelPreset,
  } = useEditorPrefsStore();

  const [newPresetName, setNewPresetName] = useState('');
  const allPresets: PanelLayoutPreset[] = [...BUILTIN_PANEL_PRESETS, ...panelPresets];
  const builtInPresets = allPresets.filter(p => p.builtIn);
  const userPresets    = allPresets.filter(p => !p.builtIn);

  const handleSavePreset = () => {
    const name = newPresetName.trim();
    if (!name) return;
    savePanelPreset(name);
    setNewPresetName('');
  };

  return (
    <>
      <div className="text-xs text-slate-400">
        {ep.activePresetLabel}{' '}
        <span className="text-slate-200 font-medium">
          {allPresets.find(p => p.id === activePanelPresetId)?.name ?? ep.customLayout}
        </span>
      </div>

      {builtInPresets.length > 0 && (
        <Section title={ep.builtInPresets}>
          <div className="flex flex-col gap-1.5">
            {builtInPresets.map(p => (
              <PresetRow
                key={p.id}
                preset={p}
                isActive={p.id === activePanelPresetId}
                ep={ep}
                onApply={applyPanelPreset}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title={ep.userPresets}>
        {userPresets.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-2">{ep.noPresetsSaved}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {userPresets.map(p => (
              <PresetRow
                key={p.id}
                preset={p}
                isActive={p.id === activePanelPresetId}
                ep={ep}
                onApply={applyPanelPreset}
                onOverwrite={overwritePanelPreset}
                onDelete={deletePanelPreset}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={newPresetName}
            onChange={e => setNewPresetName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); }}
            placeholder={ep.presetNamePlaceholder}
            className={INPUT_CLS + ' min-w-0 flex-1'}
          />
          <button
            onClick={handleSavePreset}
            disabled={!newPresetName.trim()}
            className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs cursor-pointer transition-colors shrink-0"
          >
            {ep.saveCurrentLayout}
          </button>
        </div>
      </Section>
    </>
  );
}

function PresetRow({ preset, isActive, ep, onApply, onOverwrite, onDelete }: {
  preset: PanelLayoutPreset;
  isActive: boolean;
  ep: { applyPreset: string; overwritePreset: string; deletePreset: string };
  onApply: (id: string) => void;
  onOverwrite?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-xs px-3 py-2 rounded border transition-colors ${
        isActive
          ? 'bg-indigo-900/40 border-indigo-600 text-indigo-200'
          : 'bg-slate-700/50 border-slate-600 text-slate-300'
      }`}
    >
      <span className="flex-1 truncate">{preset.name}</span>
      <button
        onClick={() => onApply(preset.id)}
        className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] cursor-pointer transition-colors shrink-0"
      >
        {ep.applyPreset}
      </button>
      {onOverwrite && (
        <button
          onClick={() => onOverwrite(preset.id)}
          className="px-2 py-0.5 rounded bg-slate-600 hover:bg-amber-600 text-slate-300 hover:text-white text-[10px] cursor-pointer transition-colors shrink-0"
        >
          {ep.overwritePreset}
        </button>
      )}
      {onDelete && (
        <button
          onClick={() => onDelete(preset.id)}
          className="px-2 py-0.5 rounded bg-slate-600 hover:bg-red-600 text-slate-300 hover:text-white text-[10px] cursor-pointer transition-colors shrink-0"
        >
          {ep.deletePreset}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  BEHAVIOR TAB
// ═══════════════════════════════════════════════════════════════════════════

function BehaviorTab() {
  const t  = useT();
  const ep = t.editorPrefs;
  const { setPrefs, ...prefs } = useEditorPrefsStore();

  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const hasTitleBarControl = !!api?.getTitleBarStyle;
  const [titleBarStyle, setTitleBarStyleState] = useState<'custom' | 'native'>('custom');

  useEffect(() => {
    if (!api?.getTitleBarStyle) return;
    api.getTitleBarStyle().then(s => setTitleBarStyleState(s));
  }, []);

  const toggle = (key: keyof typeof prefs) =>
    setPrefs({ [key]: !prefs[key] } as any);

  return (
    <>
      {/* Autosave */}
      <Section title={ep.sectionAutosave}>
        <div className="flex flex-col gap-2">
          <Row label={ep.autosaveLabel}>
            <Toggle value={prefs.autosave} onChange={() => toggle('autosave')} />
          </Row>
          {prefs.autosave && (
            <Row label={ep.autosaveIntervalLabel}>
              <Segmented
                value={String(prefs.autosaveInterval)}
                options={AUTOSAVE_INTERVALS.map(n => ({ value: String(n), label: ep.intervalMinutes(n) }))}
                onChange={v => setPrefs({ autosaveInterval: parseInt(v, 10) as typeof AUTOSAVE_INTERVALS[number] })}
              />
            </Row>
          )}
          <Row label={ep.saveOnExitLabel}>
            <Toggle value={prefs.saveOnExit} onChange={() => toggle('saveOnExit')} />
          </Row>
        </div>
      </Section>

      {/* Window title bar */}
      {hasTitleBarControl && (
        <Section title={ep.titleBarStyleLabel}>
          <div className="flex flex-col gap-1">
            {(['custom', 'native'] as const).map(style => (
              <button
                key={style}
                onClick={() => {
                  if (style !== titleBarStyle && api?.setTitleBarStyle) api.setTitleBarStyle(style);
                }}
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded border cursor-pointer transition-colors text-left ${
                  titleBarStyle === style
                    ? 'bg-indigo-900/40 border-indigo-600 text-indigo-200'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-400'
                }`}
              >
                <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                  titleBarStyle === style
                    ? 'border-indigo-400 bg-indigo-400'
                    : 'border-slate-500 bg-transparent'
                }`} />
                <span className="flex-1">{style === 'custom' ? ep.titleBarStyleCustom : ep.titleBarStyleNative}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">{ep.titleBarStyleRestartNote}</p>
        </Section>
      )}

      {/* Confirm on delete */}
      <Section title={ep.sectionConfirms}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <Row label={ep.confirmDeleteScene}>
            <Toggle value={prefs.confirmDeleteScene} onChange={() => toggle('confirmDeleteScene')} />
          </Row>
          <Row label={ep.confirmDeleteGroup}>
            <Toggle value={prefs.confirmDeleteGroup} onChange={() => toggle('confirmDeleteGroup')} />
          </Row>
          <Row label={ep.confirmDeleteVariable}>
            <Toggle value={prefs.confirmDeleteVariable} onChange={() => toggle('confirmDeleteVariable')} />
          </Row>
          <Row label={ep.confirmDeleteWatcher}>
            <Toggle value={prefs.confirmDeleteWatcher} onChange={() => toggle('confirmDeleteWatcher')} />
          </Row>
          <Row label={ep.confirmDeleteBlock}>
            <Toggle value={prefs.confirmDeleteBlock} onChange={() => toggle('confirmDeleteBlock')} />
          </Row>
          <Row label={ep.confirmDeleteCharacter}>
            <Toggle value={prefs.confirmDeleteCharacter} onChange={() => toggle('confirmDeleteCharacter')} />
          </Row>
        </div>
      </Section>

      {/* Group deletion behaviour */}
      <Section title={ep.sectionGroupDelete}>
        <p className="text-xs text-slate-400 mb-2">{ep.deleteGroupBehaviorLabel}</p>
        <div className="flex flex-col gap-1">
          {([false, true] as const).map(withScenes => (
            <button
              key={String(withScenes)}
              onClick={() => setPrefs({ deleteGroupWithScenes: withScenes })}
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded border cursor-pointer transition-colors text-left ${
                prefs.deleteGroupWithScenes === withScenes
                  ? 'bg-indigo-900/40 border-indigo-600 text-indigo-200'
                  : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-400'
              }`}
            >
              <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                prefs.deleteGroupWithScenes === withScenes
                  ? 'border-indigo-400 bg-indigo-400'
                  : 'border-slate-500 bg-transparent'
              }`} />
              {withScenes ? ep.deleteGroupWithScenes : ep.deleteGroupUngroup}
            </button>
          ))}
        </div>
      </Section>

      {/* Export */}
      <Section title={ep.sectionExport}>
        <div className="flex flex-col gap-2">
          <Row label={ep.confirmOpenFolderAfterExport}>
            <Toggle value={prefs.confirmOpenFolderAfterExport} onChange={() => toggle('confirmOpenFolderAfterExport')} />
          </Row>
        </div>
      </Section>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-slate-300 cursor-pointer">
      <span className="flex-1 min-w-0">{label}</span>
      <span className="shrink-0">{children}</span>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  AI / LLM TAB  (moved here from former standalone LLMSettingsModal)
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT_PRESETS = [
  { label: 'presetStoryteller', value: 'You are a professional storyteller. Write a continuation of the story based on the context provided. Maintain the tone and style of the existing text.' },
  { label: 'presetLiteraryNovelist',     value: 'You are a literary author crafting immersive prose fiction. Continue the narrative with rich sensory detail, deep psychological insight, and elegant language. Match the established voice precisely.' },
  { label: 'presetVisualNovelWriter',   value: 'You are writing dialogue and narration for a visual novel. Keep prose concise and punchy. Convey emotion through character reactions and subtext. End naturally for player pacing.' },
  { label: 'presetHorrorSuspense',     value: 'You are a horror writer. Build dread through atmosphere, ambiguity, and the unseen. Use short, tense sentences during high-stress moments. Never explain the horror fully.' },
  { label: 'presetFantasyAdventure',   value: 'You are writing high-fantasy adventure fiction. Embrace vivid world-building, heroic action, and mythic language. Keep the momentum going and the stakes clear.' },
  { label: 'presetDialogueFocused',      value: 'You are writing character dialogue for a visual novel. Each character must have a distinct voice and speech pattern. Dialogue should feel natural, emotionally resonant, and advance the relationship or plot.' },
  { label: 'presetRomance',               value: 'You are writing a romance story. Focus on emotional tension, chemistry between characters, and meaningful moments. Use sensory detail to convey longing and connection.' },
  { label: 'presetSciFi',                value: 'You are writing science fiction. Ground fantastical elements in consistent internal logic. Balance wonder with plausibility. Explore the human dimension of technological or cosmic themes.' },
] as const;

function AiTab() {
  const t = useT();
  const ep = t.editorPrefs;
  const llm = t.llmSettingsModal;

  const prefs = useEditorPrefsStore();
  const {
    setPrefs,
    llmEnabled, llmProvider,
    llmUrl,
    llmGeminiApiKey, llmGeminiModel, llmGeminiModelsList,
    llmOpenaiUrl, llmOpenaiApiKey, llmOpenaiModel,
    llmMaxTokens, llmTemperature, llmSystemPrompt,
    llmFilterThought, llmGenerationHistory, llmTranslationLanguage,
    imageGenProvider, comfyUiUrl, comfyUiWorkflowsDir,
    pollinationsModel, pollinationsToken,
  } = prefs;

  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels]   = useState<GeminiModelWithTier[]>([]);
  const [isCustomModel, setIsCustomModel]   = useState(!llmGeminiModelsList.includes(llmGeminiModel));
  const [presetsOpen, setPresetsOpen]       = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!llmGeminiModelsList.includes(llmGeminiModel) && !isCustomModel) setIsCustomModel(true);
  }, [isCustomModel, llmGeminiModel, llmGeminiModelsList]);

  useEffect(() => {
    if (!presetsOpen) return;
    const handler = (e: MouseEvent) => {
      if (!presetsRef.current?.contains(e.target as Node)) setPresetsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [presetsOpen]);

  const handleRefreshModels = async () => {
    if (!llmGeminiApiKey) { toast.error(llm.apiKeyRequired); return; }
    setFetchingModels(true);
    try {
      const models = await fetchGeminiModels(llmGeminiApiKey);
      const modelNames = models.map(m => m.name);
      setFetchedModels(models);
      setPrefs({ llmGeminiModelsList: modelNames });
      toast.success(llm.modelsFetched(modelNames.length));
      if (modelNames.includes(llmGeminiModel)) setIsCustomModel(false);
    } catch {
      toast.error(llm.fetchModelsFailed);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleModelChange = (val: string) => {
    if (val === 'custom') setIsCustomModel(true);
    else { setIsCustomModel(false); setPrefs({ llmGeminiModel: val }); }
  };

  return (
    <>
      <ModalSection title={llm.sectionLlm}>
        <ModalRow label={ep.llmEnabled} hint={llm.llmEnabledHint}>
          <Toggle value={llmEnabled} onChange={() => setPrefs({ llmEnabled: !llmEnabled })} />
        </ModalRow>

        <div className={`flex flex-col gap-3 transition-opacity duration-200 ${llmEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <ModalField label={llm.providerLabel}>
            <select
              value={llmProvider}
              onChange={e => setPrefs({ llmProvider: e.target.value as LLMProvider })}
              className={INPUT_CLS}
            >
              <option value="koboldcpp">{llm.koboldcpp}</option>
              <option value="gemini">{llm.gemini}</option>
              <option value="openai">{llm.openai}</option>
            </select>
          </ModalField>

          {llmProvider === 'koboldcpp' && (
            <ModalField label={llm.urlLabel}>
              <input
                type="text"
                value={llmUrl}
                onChange={e => setPrefs({ llmUrl: e.target.value })}
                placeholder={llm.koboldcppPlaceholder}
                className={INPUT_CLS}
              />
            </ModalField>
          )}

          {llmProvider === 'gemini' && (
            <>
              <ModalField label={llm.geminiApiKeyLabel}>
                <PasswordInput
                  value={llmGeminiApiKey}
                  onChange={e => setPrefs({ llmGeminiApiKey: e.target.value })}
                  placeholder={llm.geminiApiKeyPlaceholder}
                />
              </ModalField>

              <ModalField
                label={
                  <div className="flex items-center justify-between w-full">
                    <span>{llm.geminiModelLabel}</span>
                    <button
                      onClick={handleRefreshModels}
                      disabled={fetchingModels}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors cursor-pointer normal-case tracking-normal font-normal"
                    >
                      {fetchingModels ? llm.refreshingModels : llm.refreshModels}
                    </button>
                  </div>
                }
              >
                <div className="flex flex-col gap-2">
                  <GeminiModelSelect
                    modelNames={llmGeminiModelsList}
                    fetchedModels={fetchedModels}
                    value={isCustomModel ? 'custom' : llmGeminiModel}
                    onChange={handleModelChange}
                  />
                  {isCustomModel && (
                    <input
                      type="text"
                      value={llmGeminiModel}
                      onChange={e => setPrefs({ llmGeminiModel: e.target.value })}
                      placeholder={llm.customModelPlaceholder}
                      className={INPUT_CLS}
                      autoFocus
                    />
                  )}
                </div>
              </ModalField>
            </>
          )}

          {llmProvider === 'openai' && (
            <>
              <ModalField label={llm.openaiUrlLabel} note={llm.openaiUrlHint}>
                <input
                  type="text"
                  value={llmOpenaiUrl}
                  onChange={e => setPrefs({ llmOpenaiUrl: e.target.value })}
                  placeholder={llm.openaiUrlPlaceholder}
                  className={INPUT_CLS}
                />
              </ModalField>

              <ModalField label={llm.openaiApiKeyLabel}>
                <PasswordInput
                  value={llmOpenaiApiKey}
                  onChange={e => setPrefs({ llmOpenaiApiKey: e.target.value })}
                  placeholder={llm.openaiApiKeyPlaceholder}
                />
              </ModalField>

              <ModalField label={llm.openaiModelLabel}>
                <input
                  type="text"
                  value={llmOpenaiModel}
                  onChange={e => setPrefs({ llmOpenaiModel: e.target.value })}
                  placeholder={llm.openaiModelPlaceholder}
                  className={INPUT_CLS}
                />
              </ModalField>
            </>
          )}
        </div>
      </ModalSection>

      <ModalSection title={llm.sectionParams}>
        <div className={`flex flex-col gap-3 ${llmEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <ModalRow label={llm.filterThoughtLabel} hint={llm.filterThoughtHint}>
            <Toggle value={llmFilterThought} onChange={() => setPrefs({ llmFilterThought: !llmFilterThought })} />
          </ModalRow>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label={llm.maxTokensLabel}>
              <input
                type="number"
                value={llmMaxTokens}
                onChange={e => setPrefs({ llmMaxTokens: parseInt(e.target.value) || 100 })}
                className={INPUT_CLS}
              />
            </ModalField>
            <ModalField label={llm.temperatureLabel}>
              <input
                type="number" step="0.1" min="0.1" max="2.0"
                value={llmTemperature}
                onChange={e => setPrefs({ llmTemperature: parseFloat(e.target.value) || 0.7 })}
                className={INPUT_CLS}
              />
            </ModalField>
          </div>

          <ModalField
            label={
              <div className="flex items-center justify-between w-full">
                <span>{llm.systemPromptLabel}</span>
                <div className="relative" ref={presetsRef}>
                  <button
                    type="button"
                    onClick={() => setPresetsOpen(v => !v)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer normal-case tracking-normal font-normal"
                  >
                    {llm.presetsLabel} ▾
                  </button>
                  {presetsOpen && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-slate-900 border border-slate-600 rounded shadow-lg min-w-[220px] py-1">
                      {SYSTEM_PROMPT_PRESETS.map(p => (
                        <button
                          key={p.label}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer normal-case tracking-normal font-normal"
                          onClick={() => { setPrefs({ llmSystemPrompt: p.value }); setPresetsOpen(false); }}
                        >
                          {llm[p.label as keyof typeof llm] as string}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            }
          >
            <textarea
              value={llmSystemPrompt}
              onChange={e => setPrefs({ llmSystemPrompt: e.target.value })}
              placeholder={llm.systemPromptPlaceholder}
              className={INPUT_CLS + ' min-h-[110px] resize-y'}
            />
            <div className="text-right text-[10px] text-slate-500 tabular-nums">
              {llmSystemPrompt.length} {llm.chars}
            </div>
          </ModalField>
        </div>
      </ModalSection>

      <ModalSection title={llm.imageGenSectionLabel}>
        <div className={`flex flex-col gap-3 ${llmEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <ModalField label={llm.generationHistoryLabel}>
            <select
              value={llmGenerationHistory}
              onChange={e => setPrefs({ llmGenerationHistory: e.target.value as 'memory' | 'project' | 'disabled' })}
              className={INPUT_CLS}
            >
              <option value="memory">{llm.generationHistoryMemory}</option>
              <option value="project">{llm.generationHistoryProject}</option>
              <option value="disabled">{llm.generationHistoryDisabled}</option>
            </select>
          </ModalField>

          <ModalField label={llm.translationLanguageLabel} note={llm.translationLanguageHint}>
            <input
              type="text"
              value={llmTranslationLanguage}
              onChange={e => setPrefs({ llmTranslationLanguage: e.target.value })}
              placeholder={llm.translationLanguagePlaceholder}
              className={INPUT_CLS}
            />
          </ModalField>

          <ModalField label={llm.imageGenProviderLabel}>
            <select
              value={imageGenProvider}
              onChange={e => setPrefs({ imageGenProvider: e.target.value as 'comfyui' | 'pollinations' })}
              className={INPUT_CLS}
            >
              <option value="comfyui">{llm.comfyUi}</option>
              <option value="pollinations">{llm.pollinationsAi}</option>
            </select>
          </ModalField>

          {imageGenProvider === 'comfyui' && (
            <>
              <ModalField label={llm.comfyUiUrlLabel}>
                <input
                  type="text"
                  value={comfyUiUrl}
                  onChange={e => setPrefs({ comfyUiUrl: e.target.value })}
                  placeholder={llm.comfyUiUrlPlaceholder}
                  className={INPUT_CLS}
                />
              </ModalField>

              <ModalField label={llm.comfyUiWorkflowsDirLabel} note={llm.comfyUiWorkflowsDirHint}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={comfyUiWorkflowsDir}
                    onChange={e => setPrefs({ comfyUiWorkflowsDir: e.target.value })}
                    placeholder={llm.comfyUiWorkflowsDirPlaceholder}
                    className={INPUT_CLS + ' flex-1'}
                  />
                  <button
                    type="button"
                    className="px-2 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors cursor-pointer shrink-0"
                    onClick={async () => {
                      const dir = await window.electronAPI?.openFolderDialog?.();
                      if (dir) setPrefs({ comfyUiWorkflowsDir: dir });
                    }}
                  >
                    {llm.comfyUiWorkflowsDirBrowse}
                  </button>
                </div>
              </ModalField>
            </>
          )}

          {imageGenProvider === 'pollinations' && (
            <>
              <ModalField label={llm.pollinationsModelLabel}>
                <input
                  type="text"
                  value={pollinationsModel}
                  onChange={e => setPrefs({ pollinationsModel: e.target.value })}
                  placeholder={llm.pollinationsModelPlaceholder}
                  className={INPUT_CLS}
                />
              </ModalField>
              <ModalField label={llm.pollinationsTokenLabel}>
                <PasswordInput
                  value={pollinationsToken}
                  onChange={e => setPrefs({ pollinationsToken: e.target.value })}
                  placeholder={llm.pollinationsTokenPlaceholder}
                />
              </ModalField>
            </>
          )}
        </div>
      </ModalSection>
    </>
  );
}

// Gemini model select (grouped by tier)
const TIER_LABELS: Record<string, keyof Translations['llmSettingsModal']> = {
  free:           'tierFree',
  'free-limited': 'tierFreeLimited',
  paid:           'tierPaid',
  experimental:   'tierExperimental',
};
const TIER_ORDER = ['free', 'free-limited', 'paid', 'experimental'];

function GeminiModelSelect({
  modelNames, fetchedModels, value, onChange,
}: {
  modelNames: string[];
  fetchedModels: GeminiModelWithTier[];
  value: string;
  onChange: (v: string) => void;
}) {
  const llm = useT().llmSettingsModal;
  const displayByName = new Map(fetchedModels.map(m => [m.name, m.displayName]));
  const grouped = new Map<string, string[]>();
  for (const name of modelNames) {
    const tier = classifyModel(name);
    if (!grouped.has(tier)) grouped.set(tier, []);
    grouped.get(tier)!.push(name);
  }
  const hasGroups = grouped.size > 1;
  const renderOption = (name: string) => (
    <option key={name} value={name}>
      {displayByName.get(name) ?? name.replace('models/', '')}
    </option>
  );
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={INPUT_CLS}>
      {hasGroups ? (
        TIER_ORDER.filter(t => grouped.has(t)).map(tier => (
          <optgroup key={tier} label={llm[TIER_LABELS[tier]] as string}>
            {grouped.get(tier)!.map(renderOption)}
          </optgroup>
        ))
      ) : (
        modelNames.map(renderOption)
      )}
      <option value="custom">{llm.customModelName}</option>
    </select>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Icons (inline SVG)
// ═══════════════════════════════════════════════════════════════════════════

const Ico = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const IconX        = () => <Ico d="M6 6l12 12M18 6L6 18" />;
const IconCog      = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const IconPalette  = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.9-4.5-8.6-10-8.6z" />
  </svg>
);
const IconCommand  = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
  </svg>
);
const IconLayout   = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </svg>
);
const IconSparkle  = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
  </svg>
);
