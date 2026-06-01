import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useProjectStore, DEFAULT_PROJECT_SETTINGS, makeSidePanelGroup } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useT } from '../../i18n';
import { fsApi, joinPath, safeName } from '../../lib/fsApi';
import { toast } from 'sonner';
import { PRESET_TRANSLATION_LANGUAGES } from '../../utils/translationLanguages';
import type {
  Project, ProjectSettings,
  BlockStyleOverride, VariableTreeNode,
} from '../../types';
import {
  ModalShell, ModalBody,
  ModalField, ModalRow, ModalSection,
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
  TABS_FIELD_SCHEMA, TABS_RAW_CSS_HELP,
} from '../../utils/styleCascade';
import type { StyleFieldDescriptor, StyleRawCssHelp } from '../../utils/styleCascade';
import type { BlockType } from '../../types';

/** AI-button label: sparkle SVG followed by the action text. */
function AiLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <EmojiIcon name="sparkle" size={20} /> {children}
    </span>
  );
}
import {
  expandDescriptionWithLlm,
  generateLoreFromDescriptionWithLlm,
} from '../../utils/imageGen/llmPrompt';

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════════════════

type TabId = 'general' | 'appearance' | 'blockDefaults' | 'advanced';

interface Props {
  mode: 'create' | 'edit';
  onClose: () => void;
  /** Initial tab to show. */
  initialTab?: TabId;
}

export function ProjectSettingsModal({ mode, onClose, initialTab = 'general' }: Props) {
  const t = useT();
  const ps = t.projectSettings;

  const project             = useProjectStore(s => s.project);
  const updateProjectMeta   = useProjectStore(s => s.updateProjectMeta);
  const loadProject         = useProjectStore(s => s.loadProject);
  const setProjectSettingsOpen = useEditorStore(s => s.setProjectSettingsOpen);
  // Whole-store subscription is intentional here: this modal renders dozens of
  // prefs fields and is short-lived (only mounted while open).
  const prefs = useEditorPrefsStore();
  const {
    llmEnabled, llmProvider,
    llmUrl,
    llmGeminiApiKey, llmGeminiModel,
    llmOpenaiUrl, llmOpenaiApiKey, llmOpenaiModel,
    llmMaxTokens, llmTemperature, llmSystemPrompt,
  } = prefs;

  // ─── Tabs ───────────────────────────────────────────────────────────────────

  const [tab, setTab] = useState<TabId>(initialTab);

  // ─── Form state — project fields ────────────────────────────────────────────

  const [title, setTitle]             = useState(mode === 'edit' ? project.title : '');
  const [author, setAuthor]           = useState(mode === 'edit' ? (project.author ?? '') : '');
  const [description, setDescription] = useState(mode === 'edit' ? (project.description ?? '') : '');
  const [lore, setLore]               = useState(mode === 'edit' ? (project.lore ?? '') : '');

  // Appearance
  const existing = mode === 'edit' ? project.settings : DEFAULT_PROJECT_SETTINGS;
  const [bgColor,      setBgColor]      = useState(existing.bgColor      ?? '');
  const [storyLanguage, setStoryLanguage] = useState(existing.storyLanguage ?? '');
  // sidebarColor moved to the sidebar scene's systemConfig.bgColor (System tab).
  // titleColor / titleFont moved to the title scene's systemConfig (kind 'title').
  // Edit both via the System tab in SceneModal on the respective system scene.

  // Advanced
  const [audioUnlockText,  setAudioUnlockText]  = useState(existing.audioUnlockText  ?? '');
  const [autoloadSave,     setAutoloadSave]     = useState(existing.autoloadSave ?? false);
  const [customInit,         setCustomInit]         = useState(existing.customInit         ?? '');
  const [passageReadyScript, setPassageReadyScript] = useState(existing.passageReadyScript ?? '');
  const [passageDoneScript,  setPassageDoneScript]  = useState(existing.passageDoneScript  ?? '');

  // Block defaults (per-block-type cascade common-custom). Empty record = no overrides.
  const [defaultBlockStyles, setDefaultBlockStyles] = useState<ProjectSettings['defaultBlockStyles']>(
    existing.defaultBlockStyles ?? {},
  );

  const [titleError, setTitleError] = useState<string | null>(null);
  const [busy, setBusy]             = useState(false);

  // AI handlers (description/lore expansion) — image gen for the legacy sidebar
  // header is gone, but text expansion stayed.
  const [busyExpandDesc, setBusyExpandDesc]     = useState(false);
  const [busyGenerateLore, setBusyGenerateLore] = useState(false);
  const descAbortRef = useRef<AbortController | null>(null);
  const loreAbortRef = useRef<AbortController | null>(null);


  // ─── Title validation ───────────────────────────────────────────────────────

  useEffect(() => { if (title.trim()) setTitleError(null); }, [title]);

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



  // ─── Build settings / save / create ─────────────────────────────────────────

  function buildSettings(): ProjectSettings {
    const s: ProjectSettings = {};
    if (storyLanguage.trim()) s.storyLanguage = storyLanguage.trim();
    if (bgColor.trim())      s.bgColor      = bgColor.trim();
    if (audioUnlockText.trim())  s.audioUnlockText  = audioUnlockText.trim();
    if (autoloadSave)            s.autoloadSave     = true;
    if (customInit.trim())         s.customInit         = customInit.trim();
    if (passageReadyScript.trim()) s.passageReadyScript = passageReadyScript.trim();
    if (passageDoneScript.trim())  s.passageDoneScript  = passageDoneScript.trim();
    // Block defaults (cascade common-custom per block type) — set when at least one entry exists.
    if (defaultBlockStyles && Object.keys(defaultBlockStyles).length > 0) {
      s.defaultBlockStyles = defaultBlockStyles;
    }
    return s;
  }



  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setTitleError(ps.titleEmpty); setTab('general'); return; }

    setBusy(true);
    try {
      updateProjectMeta({
        title:        trimmedTitle,
        author:       author.trim() || undefined,
        description:  description.trim() || undefined,
        lore:         lore.trim() || undefined,
        settings:     buildSettings(),
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

      // Create project — no header image (legacy SidebarPanel feature is gone).
      // Pre-created `sidePanel` variable group — wired to StoryCaption.systemConfig
      // so story code can mutate `$sidePanel.*` at runtime to control every UIBar
      // wrapper setting (hidden, width, position, bgColor, history nav, saves menu, …).
      const sp = makeSidePanelGroup();

      const newProject: Project = {
        id:    crypto.randomUUID(),
        title: trimmedTitle,
        ifid:  (crypto.randomUUID()).toUpperCase(),
        author:       author.trim()      || undefined,
        description:  description.trim() || undefined,
        lore:         lore.trim()        || undefined,
        settings:     buildSettings(),
        scenes: [
          { id: crypto.randomUUID(), name: 'Start', tags: ['start'], blocks: [] },
          // StoryCaption — sidebar scene (`sidebar` system tag routes to ::StoryCaption on export).
          {
            id: crypto.randomUUID(),
            name: 'StoryCaption',
            tags: ['sidebar'],
            blocks: [],
            systemConfig: sp.systemConfig,
          },
        ],
        sceneGroups:  [],
        characters:   [],
        items:        [],
        containers:   [],
        variableNodes: [sp.group],
        assetNodes:   [],
        watchers:     [],
      };

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



  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: 'general',       label: ps.tabGeneral,        icon: <IconDocument /> },
    { id: 'appearance',    label: ps.tabAppearance,     icon: <IconPalette /> },
    { id: 'blockDefaults', label: ps.tabBlockDefaults,  icon: <IconPalette /> },
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

              <ModalField label={ps.fieldStoryLanguage} note={ps.fieldStoryLanguageNote}>
                <input
                  className={INPUT_CLS}
                  list="purl-story-langs"
                  placeholder={ps.fieldStoryLanguagePlaceholder}
                  value={storyLanguage}
                  onChange={e => setStoryLanguage(e.target.value)}
                />
                <datalist id="purl-story-langs">
                  {PRESET_TRANSLATION_LANGUAGES.map(l => <option key={l} value={l} />)}
                </datalist>
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
                <p className="text-[10px] text-slate-500 mt-1">{ps.sidebarStyleHint}</p>
                <p className="text-[10px] text-slate-500">{ps.titleStyleHint}</p>
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

          {/* ── Advanced ───────────────────────────────────────────────── */}
          {tab === 'advanced' && (
            <>
              <ModalSection title={ps.sectionAdvanced}>
                <p className="text-[10px] text-slate-500 -mt-1 mb-1">
                  History navigation and save/load menu are now configured per-scene on the <code className="text-slate-400 bg-slate-800 px-1 rounded">StoryCaption</code> scene's «System» tab (UIBar settings).
                </p>

                <ModalField label={ps.fieldAudioUnlockText} note={ps.fieldAudioUnlockTextNote}>
                  <input
                    className={INPUT_CLS}
                    placeholder={ps.fieldAudioUnlockTextPlaceholder}
                    value={audioUnlockText}
                    onChange={e => setAudioUnlockText(e.target.value)}
                  />
                </ModalField>

                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={autoloadSave}
                      onChange={e => setAutoloadSave(e.target.checked)}
                      className="accent-indigo-500 cursor-pointer"
                    />
                    {ps.fieldAutoloadSave}
                  </label>
                  <p className="text-[10px] text-slate-500">{ps.fieldAutoloadSaveNote}</p>
                </div>
              </ModalSection>

              <ModalSection title={ps.sectionLifecycleHooks}>
                <p className="text-[10px] text-slate-500 -mt-1 mb-1">{ps.lifecycleHooksNote}</p>

                <ModalField label={ps.fieldCustomInit} note={ps.fieldCustomInitNote}>
                  <textarea
                    className={`${INPUT_CLS} resize-y font-mono text-xs`}
                    rows={4}
                    placeholder={ps.fieldCustomInitPlaceholder}
                    value={customInit}
                    onChange={e => setCustomInit(e.target.value)}
                  />
                </ModalField>

                <ModalField label={ps.fieldPassageReadyScript} note={ps.fieldPassageReadyScriptNote}>
                  <textarea
                    className={`${INPUT_CLS} resize-y font-mono text-xs`}
                    rows={4}
                    placeholder={ps.fieldPassageReadyScriptPlaceholder}
                    value={passageReadyScript}
                    onChange={e => setPassageReadyScript(e.target.value)}
                  />
                </ModalField>

                <ModalField label={ps.fieldPassageDoneScript} note={ps.fieldPassageDoneScriptNote}>
                  <textarea
                    className={`${INPUT_CLS} resize-y font-mono text-xs`}
                    rows={4}
                    placeholder={ps.fieldPassageDoneScriptPlaceholder}
                    value={passageDoneScript}
                    onChange={e => setPassageDoneScript(e.target.value)}
                  />
                </ModalField>
              </ModalSection>
            </>
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
  { type: 'tabs',        titleKey: 'sectionBlockDefaultsTabs',        descKey: 'blockDefaultsTabsDesc',        schema: TABS_FIELD_SCHEMA,          help: TABS_RAW_CSS_HELP },
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

