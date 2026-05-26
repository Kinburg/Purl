// ─── Style overrides (cascade: standard → common custom → spot custom) ──────

/** Static = one style applied always. Bound = numeric-variable-driven mapping. */
export type StyleMode = 'static' | 'bound';

/**
 * One variant in a variable-bound style override. Numeric variables only.
 * - matchType 'exact': fires when $var === value
 * - matchType 'range': fires when rangeMin ≤ $var ≤ rangeMax (inclusive)
 */
export interface StyleMappingEntry {
  id: string;
  matchType: 'exact' | 'range';
  /** Numeric literal as string (parsed on use). Used when matchType === 'exact'. */
  value?: string;
  /** Numeric literal as string. Used when matchType === 'range' (inclusive). */
  rangeMin?: string;
  rangeMax?: string;
  /** Structured field overrides for this variant (keys depend on block type). */
  fields?: Record<string, string | number | boolean>;
  /** Raw CSS body for this variant — auto-scoped to the variant's class. */
  rawCss?: string;
}

/**
 * Generic style override. Applied at one of three cascade layers:
 *   1. Standard         — built-in fields on Character/Block (no override)
 *   2. Common custom    — Character.customDialogueStyle / ProjectSettings.defaultBlockStyles[type]
 *   3. Spot custom      — block.customStyle (always static)
 *
 * Bound mode is allowed only at the common-custom layer. Spot-custom is always static.
 */
export interface BlockStyleOverride {
  /** Master switch. When false, the whole override is ignored. */
  enabled: boolean;
  /**
   * 'static' = single style applied always. Default.
   * 'bound'  = variable-driven mapping (common-custom layer only; treat as 'static' at spot layer).
   */
  mode?: StyleMode;

  // ─── Static mode ─────────────────────────────────────────────────────────
  fields?: Record<string, string | number | boolean>;
  /** Auto-scoped to the layer's class; appears after `fields` in the rule body. */
  rawCss?: string;

  // ─── Bound mode (common-custom layer only) ───────────────────────────────
  /** Numeric variable's ID. */
  variableId?: string;
  /** Variants — first matching entry wins (top-to-bottom = priority). */
  mapping?: StyleMappingEntry[];
  /** Fallback fields when no entry matches (or variable is undefined/non-numeric). */
  defaultFields?: Record<string, string | number | boolean>;
  defaultRawCss?: string;
}

// ─── Block appearance effects ────────────────────────────────────────────────

/** Delayed appearance: wraps block in <<timed Xs>>...<</timed>> on export */
export interface BlockDelay {
  delay: number;          // seconds, supports decimals (0.5)
  animation?: boolean;    // enable entrance animation
  animDuration?: number;  // animation duration in seconds, default 0.4
  animFade?: boolean;     // fade in (opacity 0→1); default true when animation is enabled
  animOffsetX?: number;   // horizontal start offset px (negative = from left, positive = from right)
  animOffsetY?: number;   // vertical start offset px (negative = from above, positive = from below)
}

/** Typewriter effect: wraps content in <<type Nms per char>>...<</type>> on export */
export interface BlockTypewriter {
  speed: number;  // ms per character (e.g. 40)
}

// ─── Generation history ──────────────────────────────────────────────────────

export interface GenerationHistoryEntry {
  text: string;
  mode: 'continue' | 'rephrase' | 'hint' | 'translate';
  timestamp: number;
}

// ─── Block types ────────────────────────────────────────────────────────────

export interface TextBlock {
  id: string;
  type: 'text';
  content: string;
  live?: boolean;          // wrap in <<live 200>> on export for auto-refresh
  delay?: BlockDelay;
  typewriter?: BlockTypewriter;
  generationHistory?: GenerationHistoryEntry[];
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.text). */
  customStyle?: BlockStyleOverride;
}

export interface DialogueBlock {
  id: string;
  type: 'dialogue';
  characterId: string;
  text: string;
  align?: 'left' | 'right';  // avatar + name position, default 'left'
  live?: boolean;             // wrap in <<live 200>> on export for auto-refresh
  nameSuffix?: string;        // optional postfix shown as "Name (suffix)", e.g. "кричит"
  innerBlocks?: Block[];      // blocks rendered inside the dialogue bubble after the text
  delay?: BlockDelay;
  typewriter?: BlockTypewriter;
  generationHistory?: GenerationHistoryEntry[];
  /** Spot-level style override (always static; supersedes character's common custom). */
  customStyle?: BlockStyleOverride;
}

export interface ChoiceOption {
  id: string;
  label: string;
  targetSceneId: string;
  condition: string; // legacy free-text SugarCube expression (kept for backward compat)
  // ── Structured condition (mirrors ConditionBranch) ──────────────────────────
  conditionVariableId?: string;
  conditionOperator?: ConditionOperator;
  conditionValue?: string;
  /** Range mode: generates `$var >= rangeMin && $var <= rangeMax` (numbers only) */
  conditionRangeMode?: boolean;
  conditionRangeMin?: string;
  conditionRangeMax?: string;
}

export interface ChoiceBlock {
  id: string;
  type: 'choice';
  options: ChoiceOption[];
  delay?: BlockDelay;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.choice). */
  customStyle?: BlockStyleOverride;
}

export type ConditionOperator =
  | '==' | '!=' | '>' | '<' | '>=' | '<='
  | 'contains' | '!contains'   // whole array: $arr.includes("x")
  | 'empty' | '!empty';        // whole array: $arr.length === 0

// ─── Array accessor ──────────────────────────────────────────────────────────

/** How the index is specified when accessing an array element */
export type ArrayIndexSource =
  | { kind: 'literal';  index: number }      // $arr[0]
  | { kind: 'variable'; variableId: string } // $arr[$i]

/**
 * Describes which part of an array variable is being accessed.
 * Used in conditions, variable-set, button actions, and input fields.
 */
export type ArrayAccessor =
  | { kind: 'whole' }                              // $arr (default when omitted)
  | { kind: 'index'; source: ArrayIndexSource }    // $arr[0] or $arr[$i]
  | { kind: 'length' };                            // $arr.length (read-only)
export type ConditionBranchType = 'if' | 'elseif' | 'else';

export interface ConditionBranch {
  id: string;
  branchType: ConditionBranchType;
  variableId: string;    // empty for 'else'
  operator: ConditionOperator;
  value: string;
  /** Range mode: generates `$var >= rangeMin && $var <= rangeMax` instead of single comparison.
   *  Only valid for numeric variables. */
  rangeMode?: boolean;
  rangeMin?: string;     // lower bound (inclusive)
  rangeMax?: string;     // upper bound (inclusive)
  /** Array accessor — only relevant when variableId points to an array variable. */
  accessor?: ArrayAccessor;
  /**
   * Escape-hatch for conditions Purl can't express structurally:
   *  - compound `or` chains
   *  - LHS expressions like `$day + 1 > 23`
   *  - function calls
   *  - anything else that doesn't fit variableId/operator/value
   *
   * When set, this raw SugarCube expression is emitted verbatim and the
   * structured fields above are ignored.
   */
  rawExpression?: string;
  blocks: Block[];
}

export interface ConditionBlock {
  id: string;
  type: 'condition';
  branches: ConditionBranch[];
}

export type VarOperator = '=' | '+=' | '-=' | '*=' | '/='
  | 'push'    // $arr.push("value")
  | 'remove'  // $arr.deleteWith(v => v === "value")
  | 'clear';  // $arr = []

/**
 * How the value is determined in a VariableSetBlock.
 * - 'manual'     — hardcoded literal
 * - 'random'     — generated randomly (see RandomConfig)
 * - 'expression' — arbitrary SugarCube numeric expression (number vars only)
 * - 'dynamic'    — string value chosen by mapping another variable's value (string vars only)
 */
export type VarValueMode = 'manual' | 'random' | 'expression' | 'dynamic';

/**
 * Configuration for generating a random value.
 * Used when valueMode is 'random'.
 */
export type RandomConfig =
  | { kind: 'number';  min: number; max: number }
  | { kind: 'boolean' }
  | { kind: 'string';  length: number };

/**
 * A single entry in the dynamic string mapping.
 * Maps a controlling variable's value (exact or range) to a string result.
 */
export interface StringBoundEntry {
  id?: string;
  matchType?: 'exact' | 'range';
  value: string;       // used when matchType === 'exact' (or undefined)
  rangeMin?: string;   // used when matchType === 'range'
  rangeMax?: string;   // used when matchType === 'range'
  result: string;      // the string value to assign to the target variable
}

/**
 * One entry inside a SetObjectBlock — a single key/value pair.
 * Nested objects are represented by valueType === 'object' + children entries.
 */
export interface SetObjectEntry {
  id: string;
  /** Dictionary key. May contain spaces / special chars; export quotes when needed. */
  key: string;
  /** Type of the value at this position. */
  valueType: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Raw value for primitive types. For 'array', a JSON literal string like `[1,2,3]`. */
  value?: string;
  /** Child entries when valueType === 'object'. */
  entries?: SetObjectEntry[];
}

/**
 * SugarCube `<<for>>` loop. Three structurally distinct modes:
 *  - 'range'  — iterate over a collection: <<for [_k, ]_v range $coll>>
 *  - 'while'  — repeat while condition holds: <<for $cond>>
 *  - 'cstyle' — classic for: <<for INIT; COND; STEP>>
 *
 * Loop variables (`_name`, `_i`, …) live in SugarCube's temp-var scope and
 * are NOT modelled as project variables — stored as raw strings here.
 */
export type ForLoopMode = 'range' | 'while' | 'cstyle';

export interface ForBlock {
  id: string;
  type: 'for';
  delay?: BlockDelay;
  mode: ForLoopMode;
  // ── range mode ───────────────────────────────────────────────────────────
  /** Optional key temp-var name (e.g. "_name"). */
  keyVar?: string;
  /** Value temp-var name (e.g. "_data" or "_item"). */
  valueVar?: string;
  /** Source expression — usually `$collection`. */
  source?: string;
  // ── while mode ──────────────────────────────────────────────────────────
  /** Raw SC condition expression. */
  whileCondition?: string;
  // ── c-style mode ─────────────────────────────────────────────────────────
  /** Init expression — e.g. `_i to 0`. Emitted as part of the for header. */
  initExpr?: string;
  /** Condition expression. */
  cstyleCondition?: string;
  /** Step expression — e.g. `_i++` or `_i += 1`. */
  stepExpr?: string;
  /** Body — recursively built. */
  blocks: Block[];
}

/**
 * Assigns a structured JS object literal to a variable.
 * Exports as `<<set $name = { key1: value1, key2: { ... } }>>`.
 * Counterpart to VariableSetBlock for `<<set $obj = {...}>>` patterns that
 * can't be flattened into the usual primitive-valued set.
 */
export interface SetObjectBlock {
  id: string;
  type: 'set-object';
  delay?: BlockDelay;
  variableId: string;
  entries: SetObjectEntry[];
}

export interface VariableSetBlock {
  id: string;
  type: 'variable-set';
  delay?: BlockDelay;
  variableId: string;
  operator: VarOperator;
  value: string;
  /** Array accessor — only relevant when variableId points to an array variable. */
  accessor?: ArrayAccessor;
  /** How the value is set. Defaults to 'manual'. */
  valueMode?: VarValueMode;
  /** Kept for backward compatibility with saves that used the old randomize checkbox. */
  randomize?: boolean;
  randomConfig?: RandomConfig;
  /** SugarCube expression used when valueMode is 'expression' (numbers only). */
  expression?: string;
  // ── Dynamic mode (string vars only, valueMode === 'dynamic') ─────────────
  /** Variable whose value controls which string is assigned. */
  dynamicVariableId?: string;
  dynamicMapping?: StringBoundEntry[];
  dynamicDefault?: string;  // fallback string when no mapping entry matches
}

export type ImageMode = 'static' | 'bound';

export interface ImageBlock {
  id: string;
  type: 'image';
  delay?: BlockDelay;
  /** Display mode. Defaults to 'static' for backward compat. */
  mode?: ImageMode;
  // ── Static mode ───────────────────────────────────────────────────────
  src: string;      // URL or asset relative path
  alt: string;
  width: number;    // 0 = auto
  // ── Bound mode (image changes based on a variable's value) ───────────
  variableId?: string;
  mapping?: ImageBoundMapping[];
  defaultSrc?: string;   // fallback when no mapping matches
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.image). */
  customStyle?: BlockStyleOverride;
}

export interface ImageGenHistoryEntry {
  id: string;
  src: string;          // relative path in assets/
  prompt: string;
  seed?: number;
  createdAt: number;
  provider: string;
}

export type ImageGenPromptMode = 'manual' | 'llm';
export type ImageGenProvider = 'comfyui' | 'pollinations';
export type ImageGenSeedMode = 'manual' | 'random';

export interface ImageGenBlock {
  id: string;
  type: 'image-gen';
  delay?: BlockDelay;
  provider: ImageGenProvider;
  providerUrl?: string;              // legacy per-block URL; provider/URL now set globally in AI Settings
  workflowFile: string;             // project-relative path to workflow JSON (ComfyUI only)
  pollinationsModel?: string;        // legacy; now set globally in AI Settings
  pollinationsToken?: string;        // legacy; now set globally in AI Settings
  promptMode: ImageGenPromptMode;
  llmPromptMode?: 'hint' | 'rephrase' | 'continue'; // which LLM sub-mode to use when promptMode === 'llm'
  prompt: string;
  negativePrompt?: string;
  styleHints?: string[];            // art style tags appended to prompt at generation time
  seedMode: ImageGenSeedMode;
  seed?: number;
  width: number;                    // 0 = auto (display width in HTML output)
  genWidth?: number;                // generation resolution width, 0 = auto
  genHeight?: number;               // generation resolution height, 0 = auto
  alt: string;
  src: string;                      // currently selected generated image (relative path)
  approvedHistoryId?: string;       // id of the history entry that was approved and copied to assets
  lastApprovedDir?: string;         // last folder used when approving (relative to release/), e.g. "assets/chars"
  history?: ImageGenHistoryEntry[]; // previous generations for this block
  // ── Bound mode (image changes based on a variable's value) ────────────
  mode?: ImageMode;
  variableId?: string;
  mapping?: ImageBoundMapping[];
  defaultSrc?: string;              // fallback when no mapping matches
  /** Per-slot AI generation settings (one slot per mapping entry + default) — used in bound mode */
  genSettings?: AvatarGenSettings;
  /** When true (bound + ComfyUI), pass the default-slot image as ${base64Image} into variant generations. */
  useRefImage?: boolean;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles['image-gen']). */
  customStyle?: BlockStyleOverride;
}

export interface VideoBlock {
  id: string;
  type: 'video';
  src: string;
  autoplay: boolean;
  loop: boolean;
  controls: boolean;
  width: number;
  delay?: BlockDelay;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.video). */
  customStyle?: BlockStyleOverride;
}

// ── Audio block ──────────────────────────────────────────────────────────────

export type AudioTrigger = 'immediate' | 'delay';
export type AudioOnLeave = 'stop' | 'persist';

export interface AudioBlock {
  id: string;
  type: 'audio';
  src: string;
  trigger: AudioTrigger;
  triggerDelay?: number;   // seconds, used when trigger === 'delay'
  loop: boolean;
  onLeave: AudioOnLeave;  // 'stop' = stop when leaving scene; 'persist' = keep playing globally
  stopOthers: boolean;     // stop all currently playing audio before this block plays
  volume: number;          // 0–100
}

// ── Audio generation (ComfyUI) ───────────────────────────────────────────────

export interface AudioGenHistoryEntry {
  id: string;
  src: string;            // relative path under history/ (or assets/ after approve)
  stylePrompt: string;    // saved style prompt at the time of generation (includes any chip-inserted tags)
  lyrics?: string;        // saved lyrics (may be empty for instrumentals)
  seed?: number;
  duration?: number;      // seconds of audio
  bpm?: number;
  createdAt: number;
  provider: string;
}

/**
 * "Audio generation" block tailored for ACE Step v1.5 (and similar) ComfyUI
 * workflows that expect tokens `${lyrics}`, `${tags}`, `${seed}`, `${duration}`,
 * `${bpm}` in the workflow JSON.
 *
 * The free-text **style prompt** describes the music style (instruments, mood,
 * tempo). At generation time we send to the workflow's `${tags}` slot:
 *   `${stylePrompt}. ${tags.join(", ")}`
 * The **lyrics** field goes straight into `${lyrics}` and follows the standard
 * ACE Step structure (`[Verse 1]`, `[Chorus]`, …).
 *
 * Combines:
 *  - AudioBlock playback (trigger / loop / volume / onLeave / stopOthers / triggerDelay)
 *  - ImageGenBlock-style approve + history flow
 *  - Two LLM-assisted free-text fields: style + lyrics
 *
 * Exported to SugarCube only when `src` lives under `assets/` (approved). Drafts
 * stay under `history/` for editor-only use.
 */
export interface AudioGenBlock {
  id: string;
  type: 'audio-gen';
  // ── ComfyUI generation fields ────────────────────────────────────────────
  provider: 'comfyui';
  workflowFile: string;
  // Style prompt — free-text sent verbatim to the workflow's ${tags} slot.
  // No mode toggle: the field is always manual editable; the Format button
  // (ACE Step formatter) is the only LLM action for this field.
  // Tag chips below the field are insert-only shortcuts — they append directly
  // into this string, they don't have separate storage.
  stylePrompt: string;
  // Lyrics — separate free-text field with its own Manual/LLM toggle.
  lyrics: string;
  lyricsMode: ImageGenPromptMode;                            // 'manual' | 'llm'
  lyricsLlmMode?: 'hint' | 'rephrase' | 'continue';
  // ACE Step audio parameters.
  seedMode: ImageGenSeedMode;
  seed?: number;
  duration?: number;
  bpm?: number;
  // ── Current/approved file ───────────────────────────────────────────────
  src: string;
  approvedHistoryId?: string;
  lastApprovedDir?: string;
  history?: AudioGenHistoryEntry[];
  // ── Playback fields (mirror AudioBlock) ──────────────────────────────────
  trigger: AudioTrigger;
  triggerDelay?: number;
  loop: boolean;
  onLeave: AudioOnLeave;
  stopOthers: boolean;
  volume: number;       // 0–100
}

// ── Button block ──────────────────────────────────────────────────────────────

/** Visual style of a button block */
export interface ButtonStyle {
  bgColor: string;       // background-color
  textColor: string;     // color
  borderColor: string;   // border color
  borderRadius: number;  // px
  paddingV: number;      // vertical padding px
  paddingH: number;      // horizontal padding px
  fontSize: number;      // em × 10 — e.g. 10 = 1.0em, 12 = 1.2em
  bold: boolean;
  fullWidth: boolean;
}

/** A variable mutation action (default action type). */
export interface VarSetAction {
  id: string;
  type?: 'set-variable';
  variableId: string;
  operator: VarOperator;
  value: string;
  /** Array accessor — only relevant when variableId points to an array variable. */
  accessor?: ArrayAccessor;
}

/** Opens a SugarCube Dialog with the specified popup-tagged scene. */
export interface OpenPopupAction {
  id: string;
  type: 'open-popup';
  /** Scene NAME (must be tagged 'popup'). */
  targetSceneId: string;
  /** Optional dialog title bar text. Empty string = no title bar. */
  title?: string;
}

export type ButtonAction = VarSetAction | OpenPopupAction;

export interface WatcherCondition {
  variableId: string;
  operator: ConditionOperator;
  value: string;
  accessor?: ArrayAccessor;
}

export interface Watcher {
  id: string;
  label: string;
  enabled: boolean;
  condition: WatcherCondition;
  actions: ButtonAction[];
  navigate?: { type: 'back' } | { type: 'scene'; sceneId: string };
}

export interface ButtonBlock {
  id: string;
  type: 'button';
  delay?: BlockDelay;
  label: string;
  style: ButtonStyle;
  actions: ButtonAction[];
  refreshScene?: boolean;  // add <<run Engine.show()>> on export to re-render passage
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.button). */
  customStyle?: BlockStyleOverride;
}

/** Navigation target for LinkBlock */
export type LinkTarget = 'scene' | 'back';

/**
 * A styled button that navigates to another scene (or goes back) and
 * optionally mutates variables before navigating.
 */
export interface LinkBlock {
  id: string;
  type: 'link';
  delay?: BlockDelay;
  label: string;
  target: LinkTarget;
  targetSceneId?: string;  // used when target === 'scene'
  actions: ButtonAction[];
  style: ButtonStyle;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.link). */
  customStyle?: BlockStyleOverride;
}

/**
 * Player-facing input field that updates a story variable.
 * Exports as <<textbox>> for string/boolean variables,
 * <<numberbox>> for number variables.
 */
export interface InputFieldBlock {
  id: string;
  type: 'input-field';
  delay?: BlockDelay;
  label: string;        // prompt text shown above the input
  variableId: string;   // which variable to update
  placeholder: string;  // default value pre-filled in the field
  /** Array accessor — only kind: 'index' is valid here. */
  accessor?: ArrayAccessor;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.input-field). */
  customStyle?: BlockStyleOverride;
}

/**
 * Raw SugarCube / HTML code block.
 * Content is inserted verbatim into the exported passage — no transformation.
 */
export interface RawBlock {
  id: string;
  type: 'raw';
  code: string;
  delay?: BlockDelay;
}

/**
 * Developer note block — visible only in the editor, never exported.
 * Useful for inline logic comments and as a search target.
 */
export interface NoteBlock {
  id: string;
  type: 'note';
  text: string;
}

/** Inline HTML table with rows, cells and per-block border/gap style. */
export interface TableBlock {
  id: string;
  type: 'table';
  rows: SidebarRow[];
  style: PanelStyle;
  delay?: BlockDelay;
}

/** Displays a character's paperdoll (equipment grid) as a standalone scene block. */
export interface PaperdollBlock {
  id: string;
  type: 'paperdoll';
  charId: string;
  showLabels?: boolean;
  delay?: BlockDelay;
}

/** Displays a character's inventory (grid + detail panel + category filters) as a standalone scene block. */
export interface InventoryBlock {
  id: string;
  type: 'inventory';
  charId: string;
  title?: string;
  delay?: BlockDelay;
}

/**
 * Includes another passage/scene via <<include "PassageName">>.
 * Optionally wraps the result in a styled <div>.
 */
export interface IncludeBlock {
  id: string;
  type: 'include';
  passageName: string;
  // Optional wrapper div styling — if none are set, no <div> wrapper is generated
  maxWidth?: number;      // px, 0 or undefined = no constraint
  bordered?: boolean;     // show border
  borderColor?: string;   // default '#555555'
  borderWidth?: number;   // px, default 1
  borderRadius?: number;  // px, default 0
  padding?: number;       // inner padding px
  bgColor?: string;       // background color; undefined = transparent
  delay?: BlockDelay;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.include). */
  customStyle?: BlockStyleOverride;
}

export interface DividerBlock {
  id: string;
  type: 'divider';
  color?: string;      // line color, default '#555555'
  thickness?: number;  // px, default 1
  marginV?: number;    // vertical margin (top + bottom) in px, default 8
  delay?: BlockDelay;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.divider). */
  customStyle?: BlockStyleOverride;
}

// ─── Checkbox block ──────────────────────────────────────────────────────────

export interface CheckboxOption {
  id: string;
  label: string;
  /** flags mode: the boolean variable toggled by this checkbox */
  variableId?: string;
  /** array mode: the string value pushed into / removed from the array variable */
  value?: string;
}

/**
 * Renders a group of checkboxes.
 * - mode 'flags': each option is bound to its own boolean variable
 * - mode 'array': all options toggle membership in a single array variable
 */
export interface CheckboxBlock {
  id: string;
  type: 'checkbox';
  label?: string;            // optional group label shown above the checkboxes
  mode: 'flags' | 'array';
  options: CheckboxOption[];
  variableId?: string;       // array mode only: the target array variable
  delay?: BlockDelay;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.checkbox). */
  customStyle?: BlockStyleOverride;
}

// ─── Radio block ─────────────────────────────────────────────────────────────

export interface RadioOption {
  id: string;
  label: string;   // display text next to the radio button
  value: string;   // value written to the variable when selected
}

/**
 * Renders a group of radio buttons that set a single string variable.
 * Exports as SugarCube <<radiobutton>> macros.
 */
export interface RadioBlock {
  id: string;
  type: 'radio';
  label?: string;          // optional group label
  options: RadioOption[];
  variableId: string;      // the string variable to set
  delay?: BlockDelay;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.radio). */
  customStyle?: BlockStyleOverride;
}

// ─── System tags ──────────────────────────────────────────────────────────────

/** Predefined tags with special editor behavior (filtered from navigation dropdowns, distinct visual in graph). */
export const SYSTEM_TAGS = ['func', 'popup', 'sidebar'] as const;
export type SystemTag = typeof SYSTEM_TAGS[number];

/**
 * 'multi' — any number of scenes may carry the tag (e.g. many functions, many popups).
 * 'singleton' — at most ONE scene may carry the tag at a time, because it maps to a
 *   specific named SugarCube passage (e.g. `sidebar` → `::StoryCaption`). Setting a
 *   singleton tag on a scene must strip it from any other scene that had it (radio semantics).
 */
export type SystemTagKind = 'multi' | 'singleton';
export const SYSTEM_TAG_KIND: Record<SystemTag, SystemTagKind> = {
  func:    'multi',
  popup:   'multi',
  sidebar: 'singleton',
};

/** Accent colors for system tag chips and graph nodes. */
export const SYSTEM_TAG_COLORS: Record<SystemTag, string> = {
  func:    '#a855f7',  // violet
  popup:   '#3b82f6',  // blue
  sidebar: '#14b8a6',  // teal
};

/**
 * Canonical SugarCube passage name a singleton system tag maps to.
 * When a scene carries the tag, its name is force-locked to this value (in editor +
 * data layer), so the mapping `editor-scene ↔ SugarCube special passage` is unambiguous.
 * Multi-kind system tags (func, popup) are absent — they use user-chosen names.
 */
export const SINGLETON_TAG_PASSAGE_NAME: Partial<Record<SystemTag, string>> = {
  sidebar: 'StoryCaption',
  // future: title: 'StoryTitle', menu: 'StoryMenu', etc.
};

/** Editor-only tag that marks the starting scene. Not exported to Twee/HTML. */
export const START_TAG = 'start' as const;
export const START_TAG_COLOR = '#22c55e'; // green

/**
 * Auto-opens a SugarCube Dialog with a popup-tagged scene when the passage renders.
 * The dialog is created via Dialog.setup() / Dialog.wiki() / Dialog.open().
 */
export interface PopupBlock {
  id: string;
  type: 'popup';
  /** Scene NAME — must be tagged 'popup'. */
  targetSceneId: string;
  /** Optional dialog title bar text. Empty string = no title bar. */
  title?: string;
  delay?: BlockDelay;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.popup). */
  customStyle?: BlockStyleOverride;
}

/**
 * A styled button that executes a "function" scene (tagged func) on click,
 * running its passage macros silently without navigating.
 * Optionally mutates variables before executing the function.
 */
export interface FunctionBlock {
  id: string;
  type: 'function';
  label: string;
  targetSceneId: string;   // scene NAME — must be a func-tagged scene
  actions: ButtonAction[];
  style: ButtonStyle;
  delay?: BlockDelay;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.function). */
  customStyle?: BlockStyleOverride;
}

/** Renders a container (shop/chest/loot) in a passage */
export interface ContainerBlock {
  id: string;
  type: 'container';
  containerId: string;   // ContainerDefinition.id
  charId?: string;       // character who is the buyer/receiver (deprecated; use main hero instead)
  title?: string;
  delay?: BlockDelay;
}

/**
 * Invisible block that modifies a date/time variable.
 */
export interface TimeManipulationBlock {
  id: string;
  type: 'time-manipulation';
  variableId: string;
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  delay?: BlockDelay;
}

/** One tab in a TabsBlock — a labeled container holding a nested block list. */
export interface TabsTab {
  id: string;
  label: string;
  blocks: Block[];
}

/**
 * Renders a tabbed container — a row of clickable tab labels above a switchable body.
 * The active tab is persisted in a SugarCube variable so tab state survives navigation
 * and is part of saves. Body is re-rendered on tab switch via `Engine.show()`.
 *
 * Storage of the active tab:
 *   - If `controlVariableId` is set → bind to that user-defined number variable.
 *   - Otherwise → auto-generated `$__tabs_<blockId>` (managed by the export pipeline).
 *
 * Nesting is allowed (a TabsBlock can contain another TabsBlock). Recursive walkers
 * (export, search, navigation collection) must traverse `tabs[].blocks` like they
 * already traverse `ConditionBranch.blocks` and `DialogueBlock.innerBlocks`.
 */
export interface TabsBlock {
  id: string;
  type: 'tabs';
  tabs: TabsTab[];
  /** Index of the tab that is active on first render (default 0). */
  defaultTabIndex?: number;
  /** Optional user-defined number variable that controls the active tab (overrides auto-gen). */
  controlVariableId?: string;
  delay?: BlockDelay;
  /** Spot-level style override (always static; supersedes ProjectSettings.defaultBlockStyles.tabs). */
  customStyle?: BlockStyleOverride;
}

export type Block =
  | TextBlock
  | DialogueBlock
  | ChoiceBlock
  | ConditionBlock
  | VariableSetBlock
  | SetObjectBlock
  | ForBlock
  | ImageBlock
  | ImageGenBlock
  | VideoBlock
  | ButtonBlock
  | LinkBlock
  | InputFieldBlock
  | RawBlock
  | NoteBlock
  | TableBlock
  | PaperdollBlock
  | InventoryBlock
  | IncludeBlock
  | DividerBlock
  | CheckboxBlock
  | RadioBlock
  | FunctionBlock
  | PopupBlock
  | AudioBlock
  | AudioGenBlock
  | ContainerBlock
  | TimeManipulationBlock
  | TabsBlock
  | PluginBlock;

export type BlockType = Block['type'];

// ─── Plugin (custom block) types ─────────────────────────────────────────────

/** Instance of a custom plugin block inside a scene. */
export interface PluginBlock {
  id: string;
  type: 'plugin';
  pluginId: string;                     // ref to PluginBlockDef.id (= filename slug)
  values: Record<string, string>;       // param key → value string
  delay?: BlockDelay;
}

export type PluginParamKind =
  | 'text' | 'number' | 'bool' | 'array' | 'datetime' | 'object' | 'scene';

export interface PluginParam {
  key: string;                          // [a-zA-Z_][a-zA-Z0-9_]* — used as SugarCube `_key` temp-var
  label: string;
  kind: PluginParamKind;
  default?: string;
  /** For `object` kind: the id of the project variable-group whose fields are exposed
   *  as navigable sub-variables inside the plugin body editor. */
  typeGroupId?: string;
}

/** Definition of a reusable plugin block (stored as JSON on disk). */
export interface PluginBlockDef {
  id: string;                           // slug, matches filename ("hp-bar")
  name: string;                         // display name
  color: string;                        // #hex, card + instance border tint
  icon?: string;                        // emoji, default '🧩'
  description?: string;
  version?: string;                     // default "1.0.0"
  params: PluginParam[];
  blocks: Block[];                      // plugin body — rendered as hidden passage
}

// ─── Scene ──────────────────────────────────────────────────────────────────

export interface SceneGroup {
  id: string;
  name: string;
  notes?: string;
  collapsed?: boolean;
}

export type SceneBgImageType = 'none' | 'static' | 'bound' | 'ai-static' | 'ai-bound';
export type SceneBgSize = 'cover' | 'contain' | 'fill';

export interface SceneBackground {
  imageType: SceneBgImageType;
  /** Solid background color — used in 'none' mode without an image */
  bgColor?: string;
  /** Image path — static and ai-static modes */
  src?: string;
  /** Variable ID — bound and ai-bound modes */
  variableId?: string;
  /** Mapping entries — bound and ai-bound modes */
  mapping?: ImageBoundMapping[];
  /** Fallback image when no mapping matches */
  defaultSrc?: string;
  /** AI generation settings — ai-static and ai-bound */
  genSettings?: AvatarGenSettings;
  /** CSS blur in px (0 = no blur) */
  blur?: number;
  /** Opacity 0–100 (default 100) */
  opacity?: number;
  /** CSS background-size (default 'cover') */
  size?: SceneBgSize;
  /** background-position-x 0–100 (default 50) */
  posX?: number;
  /** background-position-y 0–100 (default 50) */
  posY?: number;
  /** Optional color overlay (#rrggbb) */
  overlayColor?: string;
  /** Overlay opacity 0–100 (default 0) */
  overlayOpacity?: number;
}

// ─── System scene config ────────────────────────────────────────────────────
//
// When a scene carries a singleton system tag (e.g. 'sidebar'), it represents a
// specific SugarCube special passage. Config that applies to the WRAPPER of that
// passage (not its body) lives here as a discriminated union — e.g. for
// 'sidebar' that's the UIBar's width/position/visibility. The exporter reads
// this and injects the corresponding CSS / Config.ui.stowBarInitially.

/**
 * A setting that can be either a static value or bound to a story variable
 * (read at runtime, reactive when the variable changes). `undefined` = caller's
 * default behavior. The export pipeline emits JS that re-reads the variable on
 * `:storyready` and `:passagedisplay` so changes during play take effect.
 */
export type BoundBool   = boolean | { variableId: string };
export type BoundNumber = number  | { variableId: string };
export type BoundString = string  | { variableId: string };

/** Configuration for the sidebar scene (mapped to UIBar via ::StoryCaption). */
export interface SidebarSceneConfig {
  kind: 'sidebar';
  /** Override UIBar width. Default 17.5em when omitted. */
  width?: BoundNumber;
  /** Unit for width — em or px. Default 'em'. Static (no binding). */
  widthUnit?: 'em' | 'px';
  /** Render the UIBar on the right instead of the default left. Bound variable
   *  should hold the literal string `"right"` or `"left"`. */
  position?: BoundString;
  /** Start with the UIBar collapsed (maps to Config.ui.stowBarInitially).
   *  Binding reads the variable at startup only — Config.ui is not reactive
   *  after first render. */
  initiallyCollapsed?: BoundBool;
  /** When false, the hamburger toggle button is hidden — UIBar can't be collapsed. */
  allowCollapse?: BoundBool;
  /** When true, the UIBar is hidden entirely (#ui-bar { display: none }). */
  hidden?: BoundBool;
  /** Background color of the UIBar wrapper. CSS color string. */
  bgColor?: BoundString;
  /** Show back/forward history navigation buttons. undefined = true (default). */
  historyControls?: BoundBool;
  /** Show SugarCube save/load menu in UIBar. undefined = true (default). */
  saveLoadMenu?: BoundBool;
}

/** Discriminated union — extend with new kinds as more system tags are added. */
export type SystemSceneConfig = SidebarSceneConfig;
// Future:
//   | { kind: 'title';   textColor?: string; font?: string }
//   | { kind: 'menu';    /* TBD */ };

export interface Scene {
  id: string;
  name: string;
  tags: string[];
  blocks: Block[];
  /** Optional developer note — shown in the editor only, never exported. */
  notes?: string;
  /** Group this scene belongs to (undefined = ungrouped). */
  groupId?: string;
  /** Position of this scene's node in the scene graph window. */
  graphPosition?: { x: number; y: number };
  /** Optional background image configuration */
  background?: SceneBackground;
  /**
   * Configuration for the SugarCube special passage this scene maps to
   * (only relevant when scene has a singleton system tag, e.g. 'sidebar').
   * The `kind` field must match the active system tag.
   */
  systemConfig?: SystemSceneConfig;
}

// ─── Character ──────────────────────────────────────────────────────────────

/**
 * IDs of automatically created variable nodes for a character.
 * Stored on the Character so the store can keep variables in sync
 * when name/colors change, and can clean them up on deletion.
 */
export interface CharacterVarIds {
  groupId: string;          // top-level VariableGroup id
  stylesGroupId: string;    // "styles" sub-group id
  nameVarId: string;        // $prefix_name variable id
  bgColorVarId: string;     // $prefix_bgColor variable id
  borderColorVarId: string; // $prefix_borderColor variable id
  nameColorVarId: string;   // $prefix_nameColor variable id
  avatarVarId: string;      // $prefix_avatar variable id (URL string, empty = hidden)
  textColorVarId?: string;  // $prefix_textColor variable id (added in v1.7)
  llmDescrVarId?: string;   // $prefix_llm_descr variable id (added in v1.8)
  llmTemperatureVarId?: string; // $prefix_llm_temperature variable id
  inventoryVarId?: string;  // $chars.{name}.inventory array variable id
  moneyVarId?: string;      // $chars.{name}.money number variable id
  equipmentGroupId?: string; // $chars.{name}.equipment VariableGroup id
}

// ─── Paperdoll ───────────────────────────────────────────────────────────────

/**
 * Config for the image shown in an empty paperdoll slot.
 * mode 'static' — fixed image path.
 * mode 'bound'  — image chosen via if/elseif chain based on a character variable.
 */
export interface SlotPlaceholderConfig {
  mode: 'static' | 'bound';
  /** Static image path, or default fallback image for bound mode */
  src: string;
  /** Which character variable drives the image (bound mode) */
  variableId: string;
  /** if/elseif mapping entries (bound mode) */
  mapping: ImageBoundMapping[];
  /** Fallback image when no mapping matches (bound mode) */
  defaultSrc: string;
  /** AI generation settings (reuses AvatarGenSettings infrastructure) */
  genSettings?: AvatarGenSettings;
}

/** One named slot in a paperdoll grid (e.g. head, chest, weapon) */
export interface PaperdollSlot {
  id: string;                   // used as key in $chars.hero.equipment and as variable name
  label: string;                // display name shown in editor, e.g. "Head"
  row: number;                  // grid row (1-based)
  col: number;                  // grid column (1-based)
  defaultItemVarName?: string;  // item varName that starts equipped in this slot
  clickable?: boolean;          // whether clicking this slot unequips the item at runtime
  /** @deprecated use placeholder instead */
  placeholderIcon?: string;
  /** Config for the image shown when this slot is empty */
  placeholder?: SlotPlaceholderConfig;
}

/** Paperdoll layout config attached to a Character */
export interface PaperdollConfig {
  slots: PaperdollSlot[];
  gridCols: number;   // total columns in grid (default 3)
  gridRows: number;   // total rows in grid (default 4)
  cellSize: number;   // px per cell (default 64)
}

export type AvatarMode = 'static' | 'bound';

/**
 * Avatar display configuration for a character.
 * mode 'static' — fixed URL stored in $prefix_avatar variable.
 * mode 'bound'  — image chosen via if/elseif chain based on another variable's value.
 * Uses the same ImageBoundMapping structure as panel image-bound cells.
 */
export interface AvatarConfig {
  mode: AvatarMode;
  src: string;              // static URL (static mode); mirrors $prefix_avatar defaultValue
  variableId: string;       // which variable drives the image (bound mode)
  mapping: ImageBoundMapping[];
  defaultSrc: string;       // fallback image when no mapping matches (bound mode)
  genSettings?: AvatarGenSettings; // optional generation settings (persisted across sessions)
}

export interface AvatarGenHistoryEntry {
  id: string;
  src: string;       // relative path under history/
  prompt: string;
  seed: number;
  createdAt: number;
}

export interface AvatarGenSlotData {
  slotId: string;           // mapping.id | 'static' | 'default'
  prompt: string;
  negativePrompt?: string;
  hint?: string;            // short hint for variant slots (emotion/state), used with reference prompt
  history: AvatarGenHistoryEntry[];
  currentSrc: string;       // currently selected path (history/ or assets/)
}

export interface AvatarGenSettings {
  provider: 'comfyui' | 'pollinations';  // legacy; provider now set globally in AI Settings
  providerUrl?: string;                  // legacy; URL now set globally in AI Settings
  workflowFile?: string;
  pollinationsModel?: string;            // legacy; now set globally in AI Settings
  pollinationsToken?: string;            // legacy; now set globally in AI Settings
  genWidth?: number;
  genHeight?: number;
  styleHints?: string[];  // shared art style tags for all slots
  useRefImage?: boolean;  // pass default slot image as ${base64Image} to ComfyUI workflow
  lockedSeed?: number;    // fixed seed for all slot generations (undefined = random each time)
  slots: AvatarGenSlotData[];
}

/** One item slot in a character's initial inventory */
export interface CharacterInventorySlot {
  id: string;
  itemVarName: string;   // matches ItemDefinition.varName
  quantity: number;      // initial quantity (default 1)
  equipped: boolean;     // initial equipped state (only meaningful for wearable)
}

export interface Character {
  id: string;
  name: string;
  /** Explicit variable prefix (ASCII-only). Falls back to charToVarPrefix(name) when absent. */
  varName?: string;
  nameColor: string;    // color for character name label
  textColor?: string;   // color for dialogue text body (added in v1.7)
  bgColor: string;      // dialogue box background
  borderColor: string;  // left border accent
  /** LLM description for generating dialogue/text for this character. */
  llm_descr?: string;
  /** Per-character LLM temperature (0-2). undefined = use global setting. */
  llm_temperature?: number;
  /** @deprecated Use avatarConfig instead. Kept for migration from pre-v1.4 saves. */
  avatarUrl?: string;
  /** Avatar settings (static URL or variable-bound). Added in v1.4. */
  avatarConfig?: AvatarConfig;
  /** Items the character starts the story with. */
  initialInventory?: CharacterInventorySlot[];
  /** Paperdoll equipment slot configuration. */
  paperdoll?: PaperdollConfig;
  /** Auto-created variable group. Absent on characters from old saves. */
  varIds?: CharacterVarIds;
  /** Marks this character as the main hero (used automatically in container interactions). */
  isHero?: boolean;
  /**
   * Common custom dialogue style for this character (cascade layer 2).
   * Supports both static and bound (number-variable-driven) modes.
   */
  customDialogueStyle?: BlockStyleOverride;
}

// ─── Item ────────────────────────────────────────────────────────────────────

/** Determines how an item is used/equipped */
export type ItemCategory = 'wearable' | 'consumable' | 'misc';

/** How the item icon is sourced */
export type ItemIconMode = 'static' | 'generated' | 'bound';

/**
 * Item icon config.
 * mode 'static'    — fixed image path.
 * mode 'generated' — AI-generated image.
 * mode 'bound'     — image chosen via if/elseif chain based on one of the item's own variables.
 */
export interface ItemIconConfig {
  mode: ItemIconMode;
  /** Current image path (relative to project root) */
  src: string;
  /** Which variable drives the image (bound mode) — must be a variable from this item's own group */
  variableId?: string;
  /** if/elseif mapping entries (bound mode) */
  mapping?: ImageBoundMapping[];
  /** Fallback image when no mapping matches (bound mode) */
  defaultSrc?: string;
  /** AI generation settings (reuses AvatarGenSettings infrastructure) */
  genSettings?: AvatarGenSettings;
}

/** A user-defined extra property on an item (e.g. damage, weight, duration) */
export interface ItemCustomProp {
  id: string;
  name: string;
  varType: 'number' | 'string' | 'boolean';
  defaultValue: string;
}

/** References to auto-created VariableGroup nodes for an item */
export interface ItemVarIds {
  /** ID of the top-level 'items' VariableGroup in variableNodes */
  itemsRootGroupId: string;
  /** ID of this item's own VariableGroup (child of the root) */
  groupId: string;
  nameVarId: string;
  iconVarId: string;
  priceVarId: string;
  descVarId: string;
  stackableVarId: string;
  /** Only present when category === 'wearable' */
  slotVarId?: string;
}

/**
 * A game item definition. Stored in Project.items[].
 * Variables live in $items.{varName}.{field} via auto-created VariableGroup.
 * Consumable items get an auto-created [func] scene for use-effects.
 */
export interface ItemDefinition {
  id: string;
  name: string;
  /** Used as the SugarCube sub-group name: $items.{varName}.name */
  varName: string;
  category: ItemCategory;
  stackable: boolean;
  /** Paperdoll slot name this item occupies — only relevant for 'wearable' */
  targetSlot?: string;
  /** ID of the auto-created [func] scene for use-effects — only for 'consumable' */
  useFuncSceneId?: string;
  /** Short description shown in the item preview */
  description?: string;
  iconConfig: ItemIconConfig;
  /** User-defined extra properties (become variables in the item's group) */
  customProps: ItemCustomProp[];
  varIds?: ItemVarIds;
}

// ─── Container ───────────────────────────────────────────────────────────────

/** How the container behaves at runtime */
export type ContainerMode = 'shop' | 'chest' | 'loot';

/** One item slot in a container's initial stock */
export interface ContainerItemSlot {
  id: string;
  itemVarName: string;   // matches ItemDefinition.varName
  quantity: number;      // -1 = infinite
  price?: number;        // override item's default price (shop mode)
}

export interface ContainerVarIds {
  containersRootGroupId: string;
  groupId: string;       // $containers.{varName} group id
  itemsVarId: string;    // $containers.{varName}.items array variable id
}

/**
 * A container entity (shop, chest, loot box).
 * Variables live in $containers.{varName}.items via auto-created VariableGroup.
 */
export interface ContainerDefinition {
  id: string;
  name: string;
  /** Used as SugarCube sub-group name: $containers.{varName} */
  varName: string;
  mode: ContainerMode;
  initialItems: ContainerItemSlot[];
  /** Optional background image path shown behind the container UI at runtime */
  bgImage?: string;
  varIds?: ContainerVarIds;
}

// ─── Variable ───────────────────────────────────────────────────────────────

export type VariableType = 'number' | 'string' | 'boolean' | 'array' | 'datetime';

export interface Variable {
  kind: 'variable';
  id: string;
  name: string;          // without $
  varType: VariableType;
  defaultValue: string;
  description: string;
  /**
   * When true, `defaultValue` holds a raw SC expression (e.g. `random(3,10)`,
   * `either("a","b")`, `"hello " + $name`) and is emitted verbatim by the
   * exporter instead of being wrapped in quotes. Used by the importer when
   * StoryInit contains `<<set>>` calls whose RHS we can't safeEval but want
   * to preserve as-is.
   */
  isExpression?: boolean;
}

export interface VariableGroup {
  kind: 'group';
  id: string;
  name: string;
  children: VariableTreeNode[];
}

export type VariableTreeNode = VariableGroup | Variable;

// ─── Asset ───────────────────────────────────────────────────────────────────

export type AssetType = 'image' | 'video' | 'audio';

/** A leaf node in the asset tree — represents a single media file on disk */
export interface Asset {
  kind: 'asset';
  id: string;
  name: string;
  assetType: AssetType;
  /**
   * Path relative to the project root, using forward slashes.
   * E.g. "assets/chars/hero.png" or "assets/logo.png"
   */
  relativePath: string;
}

/** A group node in the asset tree — maps to a folder on disk */
export interface AssetGroup {
  kind: 'group';
  id: string;
  name: string;
  /**
   * Path relative to the project root, using forward slashes.
   * E.g. "assets/chars" or "assets/chars/heroes"
   */
  relativePath: string;
  children: AssetTreeNode[];
}

export type AssetTreeNode = AssetGroup | Asset;

// ─── Sidebar panel (story UI bar content) ────────────────────────────────────

/** Static text in a cell */
export interface CellText {
  type: 'text';
  value: string;
}

/** Displays a variable value, with optional prefix/suffix labels */
export interface CellVariable {
  type: 'variable';
  variableId: string;
  prefix: string;   // shown before the value, e.g. "HP: "
  suffix: string;   // shown after the value, e.g. " pts"
}

/** Progress bar driven by a numeric variable */
export interface CellProgress {
  type: 'progress';
  variableId: string;   // current value
  maxValue: number;     // static maximum
  color: string;        // CSS fill color (used when colorRange is null/unset)
  emptyColor?: string;  // background of empty portion (default: '#333')
  textColor?: string;   // text color; '' or undefined = inherit from page
  colorRange?: { from: string; to: string } | null;  // if set, fill interpolates 0%→from, 100%→to
  showText: boolean;    // show "cur/max" as text
  vertical?: boolean;   // fill grows upward instead of rightward
}

/** Static image from assets */
export interface CellImageStatic {
  type: 'image-static';
  src: string;           // relativePath from assets
  objectFit: 'cover' | 'contain';
}

/**
 * A single entry in image-bound mapping.
 * matchType 'exact'  — show src when $var equals value
 * matchType 'range'  — show src when rangeMin ≤ $var ≤ rangeMax (numeric)
 * Fields id/matchType/rangeMin/rangeMax are optional for backward compat with
 * old saved data that only had { value, src }.
 */
export interface ImageBoundMapping {
  id?: string;
  matchType?: 'exact' | 'range';
  value: string;      // used when matchType === 'exact' (or undefined)
  rangeMin?: string;  // used when matchType === 'range'
  rangeMax?: string;  // used when matchType === 'range'
  src: string;
}

/** Image that changes based on a variable value */
export interface CellImageBound {
  type: 'image-bound';
  variableId: string;
  mapping: ImageBoundMapping[];
  defaultSrc: string;   // shown when no mapping matches
  objectFit: 'cover' | 'contain';
  genSettings?: AvatarGenSettings; // optional AI generation settings (one slot per mapping entry + default)
}

/** Image cell with embedded AI generation. Fields mirror ImageGenBlock (minus block-level fields). */
export interface CellImageGen {
  type: 'image-gen';
  promptMode: ImageGenPromptMode;
  llmPromptMode?: 'hint' | 'rephrase' | 'continue';
  prompt: string;
  negativePrompt?: string;
  styleHints?: string[];
  seedMode: ImageGenSeedMode;
  seed?: number;
  genWidth?: number;
  genHeight?: number;
  workflowFile: string;
  alt: string;
  src: string;
  width: number;
  approvedHistoryId?: string;
  lastApprovedDir?: string;
  history?: ImageGenHistoryEntry[];
}

/** Image cell where src is taken directly from a variable value (no value→file mapping). */
export interface CellImageFromVar {
  type: 'image-from-var';
  variableId: string;
  objectFit: 'cover' | 'contain';
}

/** Raw SugarCube / HTML code inserted verbatim into the StoryCaption cell */
export interface CellRaw {
  type: 'raw';
  code: string;
}

/**
 * Embeds another passage (scene) inside a sidebar cell via `<<include "name">>`.
 * Lets users keep complex panel content in a regular Scene (with typed blocks)
 * and reference it from the sidebar, instead of duplicating logic across cells.
 */
export interface CellInclude {
  type: 'include';
  /** Target scene NAME (consistent with IncludeBlock.passageName). */
  passageName: string;
}

/** Displays the contents of an array variable as a joined string */
export interface CellList {
  type: 'list';
  variableId: string;  // must be an array variable
  separator: string;   // join separator, default ', '
  emptyText: string;   // shown when the array is empty
  prefix: string;      // prepended before the joined string
  suffix: string;      // appended after the joined string
}

/** Navigation target for a sidebar button cell */
export type CellButtonNavigate =
  | { type: 'scene'; sceneId: string }
  | { type: 'back' };

/**
 * A styled button inside a sidebar panel cell.
 * Can change variables and/or navigate to a scene / go back.
 */
export interface CellButton {
  type: 'button';
  label: string;
  style: ButtonStyle;
  actions: ButtonAction[];
  navigate?: CellButtonNavigate;
}

/** Master audio volume slider + optional mute button */
export interface CellAudioVolume {
  type: 'audio-volume';
  showMuteButton: boolean;
}

export type DateTimeDisplayMode = 'text' | 'clock' | 'digital' | 'calendar' | 'clock-calendar' | 'digital-calendar';

/** Displays a date/time variable with a custom format or graphical widget */
export interface CellDateTime {
  type: 'date-time';
  variableId: string;
  displayMode?: DateTimeDisplayMode;
  format: string;     // e.g. "DD.MM.YYYY HH:mm", only used when displayMode === 'text'
  prefix?: string;
  suffix?: string;
}

/** Displays a character's paperdoll (equipment grid) in a sidebar panel cell */
export interface CellPaperdoll {
  type: 'paperdoll';
  charId: string;
  showLabels?: boolean;
}

export type CellContent =
  | CellText
  | CellVariable
  | CellProgress
  | CellImageStatic
  | CellImageBound
  | CellImageGen
  | CellImageFromVar
  | CellRaw
  | CellInclude
  | CellButton
  | CellList
  | CellAudioVolume
  | CellDateTime
  | CellPaperdoll;

export interface SidebarCell {
  id: string;
  /** Cell width as a percentage (0–100). All cells in a row should sum to 100. */
  width: number;
  content: CellContent;
}

export interface SidebarRow {
  id: string;
  height: number;  // px
  cells: SidebarCell[];
}

/** Visual style for the TableBlock (rows, borders, gaps). Used by TableBlock — the
 *  legacy `SidebarPanel` that originally owned this type is gone. */
export interface PanelStyle {
  rowGap:          number;   // px gap between rows
  borderWidth:     number;   // px, line thickness
  borderColor:     string;   // CSS color
  showOuterBorder: boolean;  // outer frame of the whole table
  showRowBorders:  boolean;  // horizontal dividers between rows
  showCellBorders: boolean;  // vertical dividers between cells
}

// ─── Project ─────────────────────────────────────────────────────────────────

export interface ProjectSettings {
  bgColor?:        string;   // story background color
  sidebarColor?:   string;   // sidebar/StoryCaption background color
  titleColor?:     string;   // StoryTitle text color
  titleFont?:      string;   // StoryTitle font-family
  /** Text shown on the click-to-begin overlay when audio autoplay is blocked */
  audioUnlockText?: string;
  /**
   * Common custom styles per block type (cascade layer 2 for non-dialogue blocks).
   * Dialogue uses Character.customDialogueStyle instead.
   * Supports both static and bound modes.
   */
  defaultBlockStyles?: Partial<Record<BlockType, BlockStyleOverride>>;
}

export interface Project {
  id: string;
  title: string;
  ifid: string;
  author?: string;
  description?: string;
  /** Story lore/context for LLM generation. */
  lore?: string;
  settings: ProjectSettings;
  scenes: Scene[];
  sceneGroups: SceneGroup[];
  characters: Character[];
  /** Item definitions — variables stored under $items.{varName} */
  items: ItemDefinition[];
  /** Container definitions (shops, chests, loot) — $containers.{varName}.items */
  containers: ContainerDefinition[];
  variableNodes: VariableTreeNode[];
  assetNodes: AssetTreeNode[];
  watchers: Watcher[];
  /** Raw user CSS appended to the generated StoryStylesheet (preserved from imports / hand-edited). */
  customCss?: string;
  /** Raw user JS appended to the generated StoryScript (preserved from imports / hand-edited). */
  customScript?: string;
}
