/**
 * Cascade-based block styling system.
 *
 * Three layers per block, in increasing priority:
 *   1. Standard     — built-in fields on Character / Block (no override)
 *   2. Common custom — Character.customDialogueStyle (dialogues)
 *                      or ProjectSettings.defaultBlockStyles[type] (others)
 *                      Supports static or bound (numeric-variable-driven) mode.
 *   3. Spot custom  — block.customStyle (always static)
 *
 * Bound mode emits one CSS class per variant + a default; runtime script
 * (`_tgRefreshStyleBind`) swaps classes based on the current variable value.
 *
 * All raw CSS is auto-scoped to the layer's class via `autoScopeRawCss()`.
 */

import type {
  Block,
  ButtonBlock,
  Character,
  CheckboxBlock,
  ChoiceBlock,
  DialogueBlock,
  DisplayObjectBlock,
  DividerBlock,
  FunctionBlock,
  ImageBlock,
  ImageGenBlock,
  VideoGenBlock,
  IncludeBlock,
  InputFieldBlock,
  LinkBlock,
  PopupBlock,
  Project,
  ProjectSettings,
  RadioBlock,
  Scene,
  TabsBlock,
  TextBlock,
  VideoBlock,
} from '../types';
import { getVariablePath } from './treeUtils';

// ─── Field schemas (shared with StyleOverrideEditor) ─────────────────────────

/** Type of a single editable field in a style override. */
type StyleFieldType = 'color' | 'number' | 'boolean' | 'enum';

/**
 * Schema describing one editable field of `BlockStyleOverride.fields`.
 * Used both for UI rendering (StyleOverrideEditor) and CSS emission helpers.
 */
export interface StyleFieldDescriptor {
  /** Key inside `BlockStyleOverride.fields`. */
  key: string;
  type: StyleFieldType;
  /** i18n key under `t.styleOverride.fields`. */
  labelKey: string;
  /** For type === 'number'. */
  min?: number;
  max?: number;
  suffix?: string;
  /**
   * For type === 'enum'. Each option's `value` is stored as the field value;
   * `labelKey` resolves to a label under `t.styleOverride.options`.
   */
  options?: ReadonlyArray<{ value: string; labelKey: string }>;
}

/** Help block shown inside the raw-CSS editor's <details> panel. */
export interface StyleRawCssHelp {
  /** Class/element selector names valid for this block type. */
  selectors: Array<{ name: string; descKey: string }>;
  /** Example raw-CSS snippet shown in <pre>. */
  exampleCode: string;
  /**
   * i18n key under `t.styleOverride` resolving to a block-type-specific
   * placeholder for the textarea. Falls back to `t.styleOverride.rawCssPlaceholder`
   * when unset or when the resolved value is empty.
   */
  placeholderKey?: string;
}

export const DIALOGUE_FIELD_SCHEMA: ReadonlyArray<StyleFieldDescriptor> = [
  { key: 'bgColor',     type: 'color', labelKey: 'bgColor' },
  { key: 'borderColor', type: 'color', labelKey: 'borderColor' },
  { key: 'nameColor',   type: 'color', labelKey: 'nameColor' },
  { key: 'textColor',   type: 'color', labelKey: 'textColor' },
];

export const BUTTON_FIELD_SCHEMA: ReadonlyArray<StyleFieldDescriptor> = [
  { key: 'bgColor',      type: 'color',   labelKey: 'bgColor' },
  { key: 'textColor',    type: 'color',   labelKey: 'textColor' },
  { key: 'borderColor',  type: 'color',   labelKey: 'borderColor' },
  { key: 'borderRadius', type: 'number',  labelKey: 'borderRadius', min: 0, max: 50, suffix: 'px' },
  { key: 'paddingV',     type: 'number',  labelKey: 'paddingV',     min: 0, max: 40, suffix: 'px' },
  { key: 'paddingH',     type: 'number',  labelKey: 'paddingH',     min: 0, max: 80, suffix: 'px' },
  { key: 'fontSize',     type: 'number',  labelKey: 'fontSize',     min: 6, max: 30, suffix: '×0.1em' },
  { key: 'bold',         type: 'boolean', labelKey: 'bold' },
  { key: 'fullWidth',    type: 'boolean', labelKey: 'fullWidth' },
];

export const DIALOGUE_RAW_CSS_HELP: StyleRawCssHelp = {
  selectors: [
    { name: '.char-body',   descKey: 'selectorBody' },
    { name: '.char-name',   descKey: 'selectorName' },
    { name: '.char-text',   descKey: 'selectorText' },
    { name: '.char-avatar', descKey: 'selectorAvatar' },
  ],
  exampleCode:
`.char-body { border-radius: 12px; padding: 14px 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
.char-name { font-family: 'Georgia', serif; letter-spacing: 0.04em; }
.char-text { line-height: 1.6; }
.char-avatar { border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }`,
  placeholderKey: 'placeholderDialogue',
};

/**
 * Media-block schema (Image / Video). Border / borderRadius / opacity target the
 * inner media element by default (controlled by `borderTarget`). `align` picks
 * how the media sits inside the wrapper.
 */
export const MEDIA_BLOCK_FIELD_SCHEMA: ReadonlyArray<StyleFieldDescriptor> = [
  { key: 'bgColor',      type: 'color',  labelKey: 'bgColor' },
  { key: 'align',        type: 'enum',   labelKey: 'align', options: [
    { value: 'left',   labelKey: 'alignLeft' },
    { value: 'center', labelKey: 'alignCenter' },
    { value: 'right',  labelKey: 'alignRight' },
  ] },
  { key: 'borderColor',  type: 'color',  labelKey: 'borderColor' },
  { key: 'borderWidth',  type: 'number', labelKey: 'borderWidth',  min: 0, max: 20,   suffix: 'px' },
  { key: 'borderRadius', type: 'number', labelKey: 'borderRadius', min: 0, max: 100,  suffix: 'px' },
  { key: 'borderTarget', type: 'enum',   labelKey: 'borderTarget', options: [
    { value: 'content', labelKey: 'borderTargetContent' },
    { value: 'wrapper', labelKey: 'borderTargetWrapper' },
  ] },
  { key: 'paddingV',     type: 'number', labelKey: 'paddingV',     min: 0, max: 80,   suffix: 'px' },
  { key: 'paddingH',     type: 'number', labelKey: 'paddingH',     min: 0, max: 80,   suffix: 'px' },
  { key: 'maxWidth',     type: 'number', labelKey: 'maxWidth',     min: 0, max: 2000, suffix: 'px' },
  { key: 'opacity',      type: 'number', labelKey: 'opacity',      min: 0, max: 100,  suffix: '%' },
];

/**
 * Choice schema. Two layers: wrapper layout (direction / gap) + per-option link
 * styling (same field set as buttons, applied to each `<<link>>` → `<a>`).
 */
export const CHOICE_FIELD_SCHEMA: ReadonlyArray<StyleFieldDescriptor> = [
  // Wrapper layout
  { key: 'direction', type: 'enum',   labelKey: 'direction', options: [
    { value: 'row',    labelKey: 'directionRow' },
    { value: 'column', labelKey: 'directionColumn' },
  ] },
  { key: 'gap',          type: 'number',  labelKey: 'gap',          min: 0, max: 40,   suffix: 'px' },
  // Per-link styling
  { key: 'bgColor',      type: 'color',   labelKey: 'bgColor' },
  { key: 'textColor',    type: 'color',   labelKey: 'textColor' },
  { key: 'borderColor',  type: 'color',   labelKey: 'borderColor' },
  { key: 'borderWidth',  type: 'number',  labelKey: 'borderWidth',  min: 0, max: 20,   suffix: 'px' },
  { key: 'borderRadius', type: 'number',  labelKey: 'borderRadius', min: 0, max: 50,   suffix: 'px' },
  { key: 'paddingV',     type: 'number',  labelKey: 'paddingV',     min: 0, max: 40,   suffix: 'px' },
  { key: 'paddingH',     type: 'number',  labelKey: 'paddingH',     min: 0, max: 80,   suffix: 'px' },
  { key: 'fontSize',     type: 'number',  labelKey: 'fontSize',     min: 6, max: 30,   suffix: '×0.1em' },
  { key: 'bold',         type: 'boolean', labelKey: 'bold' },
  { key: 'fullWidth',    type: 'boolean', labelKey: 'fullWidth' },
];

export const CHOICE_RAW_CSS_HELP: StyleRawCssHelp = {
  selectors: [
    { name: '(no selector)', descKey: 'selectorBlockSelf' },
    { name: 'a',             descKey: 'selectorChoiceA' },
    { name: 'a:hover',       descKey: 'selectorButtonAHover' },
    { name: 'a:active',      descKey: 'selectorButtonAActive' },
  ],
  exampleCode:
`/* spacing rules on the wrapper */
{ background: rgba(255,255,255,0.04); padding: 12px; border-radius: 8px; }
/* per-option hover */
a:hover { transform: translateX(4px); }`,
  placeholderKey: 'placeholderChoice',
};

/**
 * Popup schema — only title / header / frame styling. Background and text of
 * the popup body come from the popup-scene's own blocks, not from this override.
 */
export const POPUP_FIELD_SCHEMA: ReadonlyArray<StyleFieldDescriptor> = [
  { key: 'titlebarBg',   type: 'color',   labelKey: 'titlebarBg' },
  { key: 'titleColor',   type: 'color',   labelKey: 'titleColor' },
  { key: 'borderColor',  type: 'color',   labelKey: 'borderColor' },
  { key: 'borderWidth',  type: 'number',  labelKey: 'borderWidth',  min: 0, max: 20,   suffix: 'px' },
  { key: 'borderRadius', type: 'number',  labelKey: 'borderRadius', min: 0, max: 50,   suffix: 'px' },
  { key: 'maxWidth',     type: 'number',  labelKey: 'maxWidth',     min: 0, max: 2000, suffix: 'px' },
];

/**
 * Tabs schema — bar layout + per-tab styling (the rendered <a> inside each tab
 * <span>), with separate `active*` fields applied to the currently selected tab.
 * Default fields target inactive tabs; active fields are overlay rules.
 */
export const TABS_FIELD_SCHEMA: ReadonlyArray<StyleFieldDescriptor> = [
  // Bar layout
  { key: 'gap',          type: 'number',  labelKey: 'gap',          min: 0, max: 40,  suffix: 'px' },
  // Per-tab (inactive) styling
  { key: 'bgColor',      type: 'color',   labelKey: 'bgColor' },
  { key: 'textColor',    type: 'color',   labelKey: 'textColor' },
  { key: 'borderColor',  type: 'color',   labelKey: 'borderColor' },
  { key: 'borderWidth',  type: 'number',  labelKey: 'borderWidth',  min: 0, max: 20,  suffix: 'px' },
  { key: 'borderRadius', type: 'number',  labelKey: 'borderRadius', min: 0, max: 50,  suffix: 'px' },
  { key: 'paddingV',     type: 'number',  labelKey: 'paddingV',     min: 0, max: 40,  suffix: 'px' },
  { key: 'paddingH',     type: 'number',  labelKey: 'paddingH',     min: 0, max: 80,  suffix: 'px' },
  { key: 'fontSize',     type: 'number',  labelKey: 'fontSize',     min: 6, max: 30,  suffix: '×0.1em' },
  { key: 'bold',         type: 'boolean', labelKey: 'bold' },
  // Active-tab overrides
  { key: 'activeBgColor',     type: 'color',   labelKey: 'activeBgColor' },
  { key: 'activeTextColor',   type: 'color',   labelKey: 'activeTextColor' },
  { key: 'activeBorderColor', type: 'color',   labelKey: 'activeBorderColor' },
  { key: 'activeBold',        type: 'boolean', labelKey: 'activeBold' },
];

export const TABS_RAW_CSS_HELP: StyleRawCssHelp = {
  selectors: [
    { name: '(no selector)',      descKey: 'selectorBlockSelf' },
    { name: 'a',                  descKey: 'selectorTabsItem' },
    { name: 'a:hover',            descKey: 'selectorButtonAHover' },
    { name: 'a.tg-tabs-active',   descKey: 'selectorTabsActive' },
  ],
  exampleCode:
`/* tab bar */
{ border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; }
/* hover */
a:hover { background: rgba(99,102,241,0.15); }`,
  placeholderKey: 'placeholderTabs',
};

export const POPUP_RAW_CSS_HELP: StyleRawCssHelp = {
  selectors: [
    { name: '(no selector)',     descKey: 'selectorPopupDialog' },
    { name: '#ui-dialog-titlebar', descKey: 'selectorPopupTitlebar' },
    { name: '#ui-dialog-title',    descKey: 'selectorPopupTitle' },
    { name: '#ui-dialog-close',    descKey: 'selectorPopupClose' },
  ],
  exampleCode:
`/* dialog frame */
{ box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
/* titlebar accent */
#ui-dialog-titlebar { background: linear-gradient(90deg, #6366f1, transparent); }
#ui-dialog-title { font-family: 'Georgia', serif; letter-spacing: 0.04em; }`,
  placeholderKey: 'placeholderPopup',
};

export const MEDIA_BLOCK_RAW_CSS_HELP: StyleRawCssHelp = {
  selectors: [
    { name: '(no selector)', descKey: 'selectorBlockSelf' },
    { name: 'img',           descKey: 'selectorBlockImg' },
    { name: 'video',         descKey: 'selectorBlockVideo' },
  ],
  exampleCode:
`/* clip child to wrapper's rounded corners */
{ overflow: hidden; }
/* effects on the media element itself */
img, video { filter: saturate(1.2) contrast(1.05); }`,
  placeholderKey: 'placeholderContent',
};

export const BUTTON_RAW_CSS_HELP: StyleRawCssHelp = {
  selectors: [
    { name: 'a',        descKey: 'selectorButtonA' },
    { name: 'a:hover',  descKey: 'selectorButtonAHover' },
    { name: 'a:active', descKey: 'selectorButtonAActive' },
  ],
  exampleCode:
`a { box-shadow: 0 2px 8px rgba(0,0,0,0.3); text-transform: uppercase; letter-spacing: 0.06em; }
a:hover { transform: translateY(-1px); filter: brightness(1.15); }
a:active { transform: translateY(1px); }`,
  placeholderKey: 'placeholderButton',
};

/**
 * Generic content-block schema (Text / Image / Include / Checkbox / Radio / InputField).
 * Same set of CSS-mappable fields applied to the block's wrapper element.
 */
export const CONTENT_BLOCK_FIELD_SCHEMA: ReadonlyArray<StyleFieldDescriptor> = [
  { key: 'bgColor',      type: 'color',  labelKey: 'bgColor' },
  { key: 'textColor',    type: 'color',  labelKey: 'textColor' },
  { key: 'borderColor',  type: 'color',  labelKey: 'borderColor' },
  { key: 'borderWidth',  type: 'number', labelKey: 'borderWidth',  min: 0, max: 20,   suffix: 'px' },
  { key: 'borderRadius', type: 'number', labelKey: 'borderRadius', min: 0, max: 100,  suffix: 'px' },
  { key: 'paddingV',     type: 'number', labelKey: 'paddingV',     min: 0, max: 80,   suffix: 'px' },
  { key: 'paddingH',     type: 'number', labelKey: 'paddingH',     min: 0, max: 80,   suffix: 'px' },
  { key: 'maxWidth',     type: 'number', labelKey: 'maxWidth',     min: 0, max: 2000, suffix: 'px' },
  { key: 'fontSize',     type: 'number', labelKey: 'fontSize',     min: 6, max: 40,   suffix: '×0.1em' },
  { key: 'opacity',      type: 'number', labelKey: 'opacity',      min: 0, max: 100,  suffix: '%' },
];

/**
 * Divider has no structured override fields — the inherent fields
 * (color / thickness / marginV) are already editable in DividerBlockEditor's
 * main UI, so the override panel only exposes raw CSS for advanced tweaks
 * (dashed/dotted lines, gradients, double-line effects, etc.).
 *
 * Kept here as an empty array so callers can still pass `fieldsSchema={DIVIDER_FIELD_SCHEMA}`
 * for consistency — StyleOverrideEditor hides the FieldsEditor when schema is empty.
 */
export const DIVIDER_FIELD_SCHEMA: ReadonlyArray<StyleFieldDescriptor> = [];

export const CONTENT_BLOCK_RAW_CSS_HELP: StyleRawCssHelp = {
  selectors: [
    { name: '(no selector)', descKey: 'selectorBlockSelf' },
    { name: 'img',           descKey: 'selectorBlockImg' },
    { name: 'input',         descKey: 'selectorBlockInput' },
    { name: 'label',         descKey: 'selectorBlockLabel' },
  ],
  exampleCode:
`/* applies to the block wrapper itself */
{ box-shadow: 0 2px 12px rgba(0,0,0,0.25); }
/* target inner elements (when present) */
img { object-fit: cover; }
input:focus { outline: 2px solid #6366f1; }`,
  placeholderKey: 'placeholderContent',
};

/**
 * DisplayObject schema — container fields (bg/border/padding/font/gap) plus
 * sub-element colors (`labelColor` / `valueColor` / `barColor` / `barEmptyColor`)
 * which the rule builder maps to `.tg-do-label / .tg-do-value / .tg-do-bar-fill`.
 */
export const DISPLAY_OBJECT_FIELD_SCHEMA: ReadonlyArray<StyleFieldDescriptor> = [
  { key: 'bgColor',       type: 'color',  labelKey: 'bgColor' },
  { key: 'textColor',     type: 'color',  labelKey: 'textColor' },
  { key: 'labelColor',    type: 'color',  labelKey: 'labelColor' },
  { key: 'valueColor',    type: 'color',  labelKey: 'valueColor' },
  { key: 'borderColor',   type: 'color',  labelKey: 'borderColor' },
  { key: 'borderWidth',   type: 'number', labelKey: 'borderWidth',  min: 0, max: 20,  suffix: 'px' },
  { key: 'borderRadius',  type: 'number', labelKey: 'borderRadius', min: 0, max: 100, suffix: 'px' },
  { key: 'paddingV',      type: 'number', labelKey: 'paddingV',     min: 0, max: 80,  suffix: 'px' },
  { key: 'paddingH',      type: 'number', labelKey: 'paddingH',     min: 0, max: 80,  suffix: 'px' },
  { key: 'gap',           type: 'number', labelKey: 'gap',          min: 0, max: 40,  suffix: 'px' },
  { key: 'fontSize',      type: 'number', labelKey: 'fontSize',     min: 6, max: 40,  suffix: '×0.1em' },
  { key: 'barColor',      type: 'color',  labelKey: 'barColor' },
  { key: 'barEmptyColor', type: 'color',  labelKey: 'barEmptyColor' },
];

export const DISPLAY_OBJECT_RAW_CSS_HELP: StyleRawCssHelp = {
  selectors: [
    { name: '(no selector)',   descKey: 'selectorBlockSelf' },
    { name: '.tg-do-row',      descKey: 'selectorDoRow' },
    { name: '.tg-do-label',    descKey: 'selectorDoLabel' },
    { name: '.tg-do-value',    descKey: 'selectorDoValue' },
    { name: '.tg-do-bar',      descKey: 'selectorDoBar' },
    { name: '.tg-do-bar-fill', descKey: 'selectorDoBarFill' },
    { name: '.tg-do-card',     descKey: 'selectorDoCard' },
    { name: '.tg-do-badge',    descKey: 'selectorDoBadge' },
  ],
  exampleCode:
`/* container */
{ box-shadow: 0 2px 12px rgba(0,0,0,0.25); }
.tg-do-row { padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.08); }
.tg-do-label { font-variant: small-caps; letter-spacing: 0.05em; }
.tg-do-bar-fill { transition: width 0.4s ease-out; }
.tg-do-card { background: rgba(0,0,0,0.25); border-radius: 6px; padding: 6px 8px; }`,
  placeholderKey: 'placeholderDisplayObject',
};

export const DIVIDER_RAW_CSS_HELP: StyleRawCssHelp = {
  selectors: [
    { name: '(no selector)', descKey: 'selectorBlockSelf' },
  ],
  exampleCode:
`/* dashed line */
{ border-top-style: dashed; }

/* gradient line */
{ border: none; height: 2px; background: linear-gradient(90deg, transparent, #6366f1, transparent); }

/* double-line via outer ring */
{ border-top-style: double; border-top-width: 5px; }

/* glowing line */
{ box-shadow: 0 0 6px var(--tg-div-color, #6366f1); }`,
  placeholderKey: 'placeholderDivider',
};

// ─── Dialogue field → CSS mapping ─────────────────────────────────────────────

/**
 * Translate a `fields` record into per-sub-element CSS declarations.
 * Returns separate buckets per CSS selector group:
 *   body / bodyRight / name / text  → matches the `.char-body`, `.char-name`, `.char-text` structure.
 *
 * Border colour fans out to `border-left` (default) and `border-right` (dlg-right).
 */
function dialogueFieldsToDecls(fields: Record<string, string | number | boolean>): {
  body: string[];
  bodyRight: string[];
  name: string[];
  text: string[];
} {
  const body: string[] = [];
  const bodyRight: string[] = [];
  const name: string[] = [];
  const text: string[] = [];

  if (fields.bgColor !== undefined && fields.bgColor !== '') {
    body.push(`background: ${fields.bgColor}`);
  }
  if (fields.borderColor !== undefined && fields.borderColor !== '') {
    body.push(`border-left: 4px solid ${fields.borderColor}`);
    bodyRight.push(`border-left: none`);
    bodyRight.push(`border-right: 4px solid ${fields.borderColor}`);
  }
  if (fields.nameColor !== undefined && fields.nameColor !== '') {
    name.push(`color: ${fields.nameColor}`);
  }
  if (fields.textColor !== undefined && fields.textColor !== '') {
    text.push(`color: ${fields.textColor}`);
  }

  return { body, bodyRight, name, text };
}

// ─── Raw CSS auto-scoping ────────────────────────────────────────────────────

/**
 * Prefix every rule in `rawCss` with `scopeSelector` so user CSS can't escape
 * its layer. Best-effort parsing:
 *   - Bare declarations (`color: red; padding: 8px;`) → wrap as `scope { … }`.
 *   - Selector blocks  (`.char-name { color: red; }`) → become `scope .char-name { color: red; }`.
 *   - `@media (…)` blocks are left alone (no inner scoping); rare in practice.
 *
 * Naive but safe: if user wrote `body { … }` we'd produce
 *   `<scope> body { … }` — selector matches nothing, no global pollution.
 */
function autoScopeRawCss(scopeSelector: string, rawCss: string): string {
  const trimmed = rawCss.trim();
  if (!trimmed) return '';

  // No braces → treat as bare declarations
  if (!trimmed.includes('{')) {
    return `${scopeSelector} { ${trimmed} }`;
  }

  // Split top-level rules by walking through and tracking brace depth.
  const rules: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        rules.push(trimmed.slice(start, i + 1).trim());
        start = i + 1;
      }
    }
  }
  // Trailing bare declarations after last rule
  const tail = trimmed.slice(start).trim();
  if (tail) rules.push(tail);

  return rules
    .map(rule => {
      if (!rule) return '';
      // @-rules pass through verbatim
      if (rule.startsWith('@')) return rule;
      const braceIdx = rule.indexOf('{');
      if (braceIdx === -1) {
        // Bare declaration tail
        return `${scopeSelector} { ${rule} }`;
      }
      const selectorPart = rule.slice(0, braceIdx).trim();
      const bodyPart = rule.slice(braceIdx);
      // Split comma-separated selectors and prefix each
      const prefixed = selectorPart
        .split(',')
        .map(s => `${scopeSelector} ${s.trim()}`)
        .join(', ');
      return `${prefixed} ${bodyPart}`;
    })
    .filter(Boolean)
    .join('\n');
}

// ─── Cascade resolution helpers ──────────────────────────────────────────────

/** Standard dialogue fields derived from a Character's base properties. */
function dialogueStdFields(char: Character): Record<string, string | number | boolean> {
  return {
    bgColor:     char.bgColor,
    borderColor: char.borderColor,
    nameColor:   char.nameColor,
    textColor:   char.textColor ?? '#e2e8f0',
  };
}

/** Merge std with override `fields`, taking override values when present. */
function mergeFields(
  std: Record<string, string | number | boolean>,
  override?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  return { ...std, ...(override ?? {}) };
}

// ─── Dialogue: build CSS rule for one class scope ────────────────────────────

/**
 * Build dialogue CSS rules targeting a single scope class
 * (e.g. `.dlg-hero` or `.dlg-hero-v-0` or `.dlg-spot-abc`).
 */
function buildDialogueRulesForScope(
  scopeClass: string,
  fields: Record<string, string | number | boolean>,
  rawCss?: string,
): string {
  const { body, bodyRight, name, text } = dialogueFieldsToDecls(fields);
  const parts: string[] = [];

  if (body.length > 0) {
    parts.push(`.dialogue.${scopeClass} .char-body { ${body.join('; ')}; }`);
  }
  if (bodyRight.length > 0) {
    parts.push(`.dialogue.dlg-right.${scopeClass} .char-body { ${bodyRight.join('; ')}; }`);
  }
  if (name.length > 0) {
    parts.push(`.dialogue.${scopeClass} .char-name { ${name.join('; ')}; }`);
  }
  if (text.length > 0) {
    parts.push(`.dialogue.${scopeClass} .char-text { ${text.join('; ')}; }`);
  }
  if (rawCss && rawCss.trim()) {
    parts.push(autoScopeRawCss(`.dialogue.${scopeClass}`, rawCss));
  }

  return parts.join('\n');
}

// ─── Class-name helpers ──────────────────────────────────────────────────────

/** Stable identifier-friendly class fragment from a character ID. */
function charClassId(charId: string): string {
  return charId.replace(/[^a-zA-Z0-9]/g, '');
}

function dialogueBaseClass(charId: string): string {
  return `dlg-${charClassId(charId)}`;
}

function dialogueVariantClass(charId: string, variantKey: string): string {
  return `dlg-${charClassId(charId)}-v-${variantKey}`;
}

function dialogueSpotClass(blockId: string): string {
  return `dlg-spot-${blockId.replace(/[^a-zA-Z0-9]/g, '')}`;
}

// ─── Public: per-character CSS for story.css ─────────────────────────────────

/**
 * Generate the full CSS rule set for one character (Layer 1 + Layer 2).
 * In static (or absent) common-custom: one set of rules under `.dlg-{charId}`.
 * In bound common-custom: one set per variant under `.dlg-{charId}-v-{N|default}`.
 */
function buildDialogueCharCss(char: Character): string {
  const baseCls = dialogueBaseClass(char.id);
  const std = dialogueStdFields(char);
  const cs = char.customDialogueStyle;

  if (!cs?.enabled) {
    // Pure standard
    return buildDialogueRulesForScope(baseCls, std);
  }

  if ((cs.mode ?? 'static') === 'static') {
    // Standard + common-static
    const merged = mergeFields(std, cs.fields);
    return buildDialogueRulesForScope(baseCls, merged, cs.rawCss);
  }

  // Bound mode: emit one rule set per variant + default
  const parts: string[] = [];

  // Default variant (used when variable is undefined or no entry matches)
  const defaultMerged = mergeFields(std, cs.defaultFields);
  parts.push(
    buildDialogueRulesForScope(
      dialogueVariantClass(char.id, 'default'),
      defaultMerged,
      cs.defaultRawCss,
    ),
  );

  // Each mapping entry
  (cs.mapping ?? []).forEach((entry, idx) => {
    const merged = mergeFields(std, entry.fields);
    parts.push(
      buildDialogueRulesForScope(
        dialogueVariantClass(char.id, String(idx)),
        merged,
        entry.rawCss,
      ),
    );
  });

  return parts.filter(Boolean).join('\n');
}

/** Combined CSS for all characters. Used by story.css + editor injection. */
export function buildAllDialogueCss(characters: Character[]): string {
  const base = [
    '.dialogue { display: flex; align-items: flex-start; gap: 8px; margin: 4px 0; font-style: italic; }',
    '.dialogue.dlg-right { flex-direction: row-reverse; }',
    '.char-avatar { width: 96px; height: 96px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }',
    '.char-body { flex: 1; padding: 8px 12px; border-radius: 4px; }',
    '.char-name { font-weight: bold; display: block; margin-bottom: 4px; }',
    '.char-text { display: block; margin: 0 !important; padding: 0; }',
  ].join('\n');
  if (characters.length === 0) return base;
  const perChar = characters.map(buildDialogueCharCss).filter(Boolean).join('\n\n');
  return `${base}\n\n${perChar}`;
}

// ─── Public: spot CSS for a single block (inline <style>) ────────────────────

/**
 * Generate a `<style>` block scoped to a unique class for the block's spot override.
 * Returns '' when the block has no enabled spot override.
 *
 * Spot is always static — bound mode is ignored at this layer.
 */
export function buildDialogueSpotStyleBlock(block: DialogueBlock): string {
  const cs = block.customStyle;
  if (!cs?.enabled) return '';
  // Force static at spot layer
  const fields = cs.fields ?? {};
  const rawCss = cs.rawCss;
  if (Object.keys(fields).length === 0 && (!rawCss || !rawCss.trim())) return '';

  const scopeCls = dialogueSpotClass(block.id);
  const rules = buildDialogueRulesForScope(scopeCls, fields, rawCss);
  return rules ? `<style>${rules}</style>` : '';
}

// ─── Class lists for the rendered element ────────────────────────────────────

/**
 * Compute the classes to apply on a dialogue element.
 *
 * @param char     — the character (mandatory).
 * @param block    — the dialogue block (optional, for spot class).
 * @param variantOverride — when set, applies this variant key instead of 'default'.
 *                          Used by the editor preview cycling.
 */
export function dialogueElementClasses(
  char: Character,
  block?: DialogueBlock,
  variantOverride?: string,
): string[] {
  const out = ['dialogue', dialogueBaseClass(char.id)];

  const cs = char.customDialogueStyle;
  if (cs?.enabled && (cs.mode ?? 'static') === 'bound') {
    const variantKey = variantOverride ?? 'default';
    out.push(dialogueVariantClass(char.id, variantKey));
  }

  if (block?.customStyle?.enabled) {
    out.push(dialogueSpotClass(block.id));
  }

  return out;
}

/** Returns the `data-style-bind` attribute value, or '' when none needed. */
export function dialogueDataStyleBind(char: Character): string {
  const cs = char.customDialogueStyle;
  if (cs?.enabled && (cs.mode ?? 'static') === 'bound') {
    return charClassId(char.id);
  }
  return '';
}

// ─── Button family (Button / Link / Function) ────────────────────────────────

type ButtonFamilyType = 'button' | 'link' | 'function';
type ButtonFamilyBlock = ButtonBlock | LinkBlock | FunctionBlock;

function buttonShortId(blockId: string): string {
  return blockId.replace(/-/g, '').substring(0, 12);
}

/** Per-instance Std class — same shape as today's `tg-btn-{id}`. */
function buttonInstanceClass(blockId: string): string {
  return `tg-btn-${buttonShortId(blockId)}`;
}

/** Common (per-block-type project default) class. */
function buttonDefaultClass(type: ButtonFamilyType): string {
  return `tg-btn-default-${type}`;
}

/** Bound variant class for a given type and variant key (idx or 'default'). */
function buttonDefaultVariantClass(type: ButtonFamilyType, variantKey: string): string {
  return `tg-btn-default-${type}-v-${variantKey}`;
}

/** Spot (per-block) class. */
function buttonSpotClass(blockId: string): string {
  return `tg-btn-spot-${buttonShortId(blockId)}`;
}

/** Copy `block.style` fields into the generic style-override fields record. */
function buttonStdFields(block: ButtonFamilyBlock): Record<string, string | number | boolean> {
  const s = block.style;
  return {
    bgColor:      s.bgColor,
    textColor:    s.textColor,
    borderColor:  s.borderColor,
    borderRadius: s.borderRadius,
    paddingV:     s.paddingV,
    paddingH:     s.paddingH,
    fontSize:     s.fontSize,
    bold:         s.bold,
    fullWidth:    s.fullWidth,
  };
}

/**
 * Build CSS rules for one button-family scope (`tg-btn-{id}`, `tg-btn-default-{type}`,
 * `tg-btn-default-{type}-v-{idx}`, or `tg-btn-spot-{id}`).
 *
 * Skips fields that are undefined / empty so partial overrides (e.g. common only
 * setting `bgColor`) let lower layers show through.
 */
function buildButtonRulesForScope(
  scopeClass: string,
  fields: Record<string, string | number | boolean>,
  rawCss?: string,
): string {
  const parts: string[] = [];

  // ─── Declarations on the inner <a> ─────────────────────────────────────────
  const aDecls: string[] = [];

  if (fields.bgColor      !== undefined && fields.bgColor      !== '') aDecls.push(`background: ${fields.bgColor}`);
  if (fields.textColor    !== undefined && fields.textColor    !== '') aDecls.push(`color: ${fields.textColor}`);
  if (fields.borderColor  !== undefined && fields.borderColor  !== '') aDecls.push(`border: 1px solid ${fields.borderColor}`);
  if (fields.borderRadius !== undefined && fields.borderRadius !== '') aDecls.push(`border-radius: ${fields.borderRadius}px`);

  const pvSet = fields.paddingV !== undefined && fields.paddingV !== '';
  const phSet = fields.paddingH !== undefined && fields.paddingH !== '';
  if (pvSet && phSet) {
    aDecls.push(`padding: ${fields.paddingV}px ${fields.paddingH}px`);
  } else if (pvSet) {
    aDecls.push(`padding-top: ${fields.paddingV}px`);
    aDecls.push(`padding-bottom: ${fields.paddingV}px`);
  } else if (phSet) {
    aDecls.push(`padding-left: ${fields.paddingH}px`);
    aDecls.push(`padding-right: ${fields.paddingH}px`);
  }

  if (fields.fontSize !== undefined && fields.fontSize !== '') {
    const n = Number(fields.fontSize);
    if (Number.isFinite(n)) aDecls.push(`font-size: ${(n / 10).toFixed(1)}em`);
  }

  if (fields.bold === true)  aDecls.push(`font-weight: bold`);
  if (fields.bold === false) aDecls.push(`font-weight: normal`);

  if (aDecls.length > 0) {
    parts.push(`.${scopeClass} a { ${aDecls.join('; ')}; }`);
  }

  // ─── Full-width handling (affects wrapper <span> + <a>) ────────────────────
  if (fields.fullWidth === true) {
    parts.push(`.${scopeClass} { display: block; }`);
    parts.push(`.${scopeClass} a { display: block; width: 100%; box-sizing: border-box; text-align: center; }`);
  } else if (fields.fullWidth === false) {
    parts.push(`.${scopeClass} { display: inline-block; }`);
    parts.push(`.${scopeClass} a { display: inline-block; width: auto; text-align: left; }`);
  }

  // ─── Raw CSS (auto-scoped) ─────────────────────────────────────────────────
  if (rawCss && rawCss.trim()) {
    parts.push(autoScopeRawCss(`.${scopeClass}`, rawCss));
  }

  return parts.join('\n');
}

/** Collect all button/link/function blocks from a scene tree (recurses into IF branches). */
function collectButtonFamilyBlocks(blocks: Block[]): ButtonFamilyBlock[] {
  const result: ButtonFamilyBlock[] = [];
  for (const b of blocks) {
    if (b.type === 'button' || b.type === 'link' || b.type === 'function') result.push(b);
    if (b.type === 'condition') {
      for (const br of b.branches) result.push(...collectButtonFamilyBlocks(br.blocks));
    }
    if (b.type === 'dialogue' && b.innerBlocks) {
      result.push(...collectButtonFamilyBlocks(b.innerBlocks));
    }
    if (b.type === 'section') {
      result.push(...collectButtonFamilyBlocks(b.blocks));
    }
    if (b.type === 'tabs') {
      for (const tab of b.tabs) result.push(...collectButtonFamilyBlocks(tab.blocks));
    }
    if (b.type === 'table') {
      for (const row of b.rows) for (const cell of row.cells) result.push(...collectButtonFamilyBlocks(cell.blocks));
    }
  }
  return result;
}

/**
 * Generate the full CSS for button-family blocks: structural base + per-instance Std
 * rules + per-type Common rules (static or bound variants).
 *
 * Spot rules are emitted separately by `buildButtonSpotStyleBlock` (passage-inline).
 */
export function buildButtonsCascadeCss(scenes: Scene[], settings: ProjectSettings): string {
  const buttons = scenes.flatMap(s => collectButtonFamilyBlocks(s.blocks));
  const defaults = settings.defaultBlockStyles ?? {};

  const enabledTypes: ButtonFamilyType[] = (['button', 'link', 'function'] as const)
    .filter(t => defaults[t]?.enabled);

  if (buttons.length === 0 && enabledTypes.length === 0) return '';

  const base = [
    '.tg-btn { display: inline-block; }',
    '.tg-btn a { display: inline-block; text-decoration: none; cursor: pointer; transition: filter 0.15s; }',
    '.tg-btn a:hover { filter: brightness(1.2); }',
  ].join('\n');

  const parts: string[] = [base];

  // Per-block Std rules (one per button-family instance)
  for (const b of buttons) {
    const rule = buildButtonRulesForScope(buttonInstanceClass(b.id), buttonStdFields(b));
    if (rule) parts.push(rule);
  }

  // Common rules per type (static = 1 rule, bound = N+1 variant rules)
  for (const type of enabledTypes) {
    const cs = defaults[type]!;
    if ((cs.mode ?? 'static') === 'static') {
      const rule = buildButtonRulesForScope(buttonDefaultClass(type), cs.fields ?? {}, cs.rawCss);
      if (rule) parts.push(rule);
    } else {
      // Bound: emit default variant + one per mapping entry
      const defaultRule = buildButtonRulesForScope(
        buttonDefaultVariantClass(type, 'default'),
        cs.defaultFields ?? {},
        cs.defaultRawCss,
      );
      if (defaultRule) parts.push(defaultRule);
      (cs.mapping ?? []).forEach((entry, idx) => {
        const rule = buildButtonRulesForScope(
          buttonDefaultVariantClass(type, String(idx)),
          entry.fields ?? {},
          entry.rawCss,
        );
        if (rule) parts.push(rule);
      });
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

/**
 * Generate a `<style>` block scoped to the block's spot class. Returns '' when
 * the block has no enabled customStyle. Spot is always static.
 */
export function buildButtonSpotStyleBlock(block: ButtonFamilyBlock): string {
  const cs = block.customStyle;
  if (!cs?.enabled) return '';
  const fields = cs.fields ?? {};
  const rawCss = cs.rawCss;
  if (Object.keys(fields).length === 0 && (!rawCss || !rawCss.trim())) return '';
  const rules = buildButtonRulesForScope(buttonSpotClass(block.id), fields, rawCss);
  return rules ? `<style>${rules}</style>` : '';
}

/** Class list for a rendered button-family `<span>` wrapper. */
export function buttonElementClasses(block: ButtonFamilyBlock, settings: ProjectSettings): string[] {
  const out = ['tg-btn', buttonInstanceClass(block.id)];
  const cs = settings.defaultBlockStyles?.[block.type];
  if (cs?.enabled) {
    if ((cs.mode ?? 'static') === 'bound') {
      out.push(buttonDefaultVariantClass(block.type as ButtonFamilyType, 'default'));
    } else {
      out.push(buttonDefaultClass(block.type as ButtonFamilyType));
    }
  }
  if (block.customStyle?.enabled) {
    out.push(buttonSpotClass(block.id));
  }
  return out;
}

/** Returns `data-style-bind` value (e.g. `"default-button"`) when bound, else ''. */
export function buttonDataStyleBind(block: ButtonFamilyBlock, settings: ProjectSettings): string {
  const cs = settings.defaultBlockStyles?.[block.type];
  if (cs?.enabled && (cs.mode ?? 'static') === 'bound') {
    return `default-${block.type}`;
  }
  return '';
}

// ─── Block type base CSS (structural hooks) ───────────────────────────────────

/**
 * Base CSS for every block-type wrapper (`.tg-text`, `.tg-divider`, etc.).
 * These are shared between HTML export (story.css) and the in-editor preview
 * (`previewCss.ts`) so the editor mirrors the exported render exactly.
 */
export function buildBlockTypesCSS(): string {
  return [
    '.tg-text { }',
    // Media wrappers are full-width and centre their inner element by default;
    // user can override via the `align` field (left/center/right).
    // `display: inline-block` on the media element is critical — it overrides
    // tailwind's preflight (which sets `img/video { display: block }`) in the
    // editor so `text-align: center` on the wrapper actually centres the media.
    '.tg-image { text-align: center; }',
    '.tg-image img { display: inline-block; vertical-align: middle; max-width: 100%; }',
    '.tg-video { text-align: center; }',
    '.tg-video video { display: inline-block; vertical-align: middle; max-width: 100%; }',
    '.tg-divider { border: none; border-top: var(--tg-div-thickness, 1px) solid var(--tg-div-color, #555555); margin: var(--tg-div-margin, 8px) 0; }',
    '.tg-input-field { }',
    '.tg-checkbox { }',
    '.tg-radio { }',
    '.tg-include { max-width: var(--tg-inc-max-width, none); border: var(--tg-inc-border-width, 0px) solid var(--tg-inc-border-color, transparent); border-radius: var(--tg-inc-radius, 0); padding: var(--tg-inc-padding, 0); background-color: var(--tg-inc-bg, transparent); }',
    '.tg-table { display: flex; flex-direction: column; gap: var(--tg-tbl-gap, 4px); margin: 0; padding: 0; }',
  ].join('\n');
}

// ─── Simple block family (Text / Image / Include / Divider / Checkbox / Radio / InputField) ──
//
// Unlike the button family, these blocks don't carry a per-instance structured
// style — their inherent Std rendering lives in the existing block CSS / inline
// attributes. The cascade only adds two layers:
//   - Common  → class `.tg-{type}-default` (or `-v-{idx}` in bound mode)
//   - Spot    → class `.tg-{type}-spot-{shortId}` emitted as inline <style>
//
// The block's existing wrapper class (`tg-text`, `tg-include`, etc.) stays the
// structural base.

type SimpleBlockType =
  | 'text' | 'image' | 'image-gen' | 'video' | 'video-gen' | 'include' | 'divider'
  | 'checkbox' | 'radio' | 'input-field' | 'choice' | 'popup' | 'tabs'
  | 'display-object';

type SimpleBlockBlock =
  | TextBlock | ImageBlock | ImageGenBlock | VideoBlock | VideoGenBlock | IncludeBlock | DividerBlock
  | CheckboxBlock | RadioBlock | InputFieldBlock | ChoiceBlock | PopupBlock | TabsBlock
  | DisplayObjectBlock;

interface SimpleBlockConfig {
  /** The structural base class already emitted by the export. */
  baseClass: string;
  /**
   * Builds the full CSS rule set for one scope (e.g. `.tg-image-spot-XXX`).
   * Returns a concatenated string of one or more selectors+rules. May target
   * multiple selectors (wrapper + inner media for Image/Video).
   */
  buildRules: (
    scopeClass: string,
    fields: Record<string, string | number | boolean>,
    rawCss?: string,
  ) => string;
  /** Schema used by the StyleOverrideEditor (kept here for completeness; UI imports it directly.) */
  schema: ReadonlyArray<StyleFieldDescriptor>;
}

/** Translate generic content-block fields into a single declaration string. */
function contentBlockFieldsToDecls(fields: Record<string, string | number | boolean>): string {
  const parts: string[] = [];
  if (fields.bgColor   !== undefined && fields.bgColor   !== '') parts.push(`background: ${fields.bgColor}`);
  if (fields.textColor !== undefined && fields.textColor !== '') parts.push(`color: ${fields.textColor}`);

  const bw = fields.borderWidth;
  const bc = fields.borderColor;
  const hasBW = bw !== undefined && bw !== '';
  const hasBC = bc !== undefined && bc !== '';
  if (hasBW && hasBC) parts.push(`border: ${bw}px solid ${bc}`);
  else if (hasBW)     parts.push(`border-width: ${bw}px; border-style: solid`);
  else if (hasBC)     parts.push(`border: 1px solid ${bc}`);

  if (fields.borderRadius !== undefined && fields.borderRadius !== '') parts.push(`border-radius: ${fields.borderRadius}px`);

  const pv = fields.paddingV;
  const ph = fields.paddingH;
  const hasPV = pv !== undefined && pv !== '';
  const hasPH = ph !== undefined && ph !== '';
  if (hasPV && hasPH) parts.push(`padding: ${pv}px ${ph}px`);
  else if (hasPV)     parts.push(`padding-top: ${pv}px; padding-bottom: ${pv}px`);
  else if (hasPH)     parts.push(`padding-left: ${ph}px; padding-right: ${ph}px`);

  if (fields.maxWidth !== undefined && fields.maxWidth !== '' && Number(fields.maxWidth) > 0) {
    parts.push(`max-width: ${fields.maxWidth}px`);
  }
  if (fields.fontSize !== undefined && fields.fontSize !== '') {
    const n = Number(fields.fontSize);
    if (Number.isFinite(n)) parts.push(`font-size: ${(n / 10).toFixed(1)}em`);
  }
  if (fields.opacity !== undefined && fields.opacity !== '') {
    const n = Number(fields.opacity);
    if (Number.isFinite(n)) parts.push(`opacity: ${(n / 100).toFixed(2)}`);
  }
  return parts.join('; ');
}

/** Divider fields → border-top / margin overrides on the `<hr>`. */
function dividerFieldsToDecls(fields: Record<string, string | number | boolean>): string {
  const parts: string[] = [];
  if (fields.lineColor !== undefined && fields.lineColor !== '') parts.push(`border-top-color: ${fields.lineColor}`);
  if (fields.thickness !== undefined && fields.thickness !== '') parts.push(`border-top-width: ${fields.thickness}px`);
  if (fields.marginV   !== undefined && fields.marginV   !== '') parts.push(`margin: ${fields.marginV}px 0`);
  return parts.join('; ');
}

/**
 * Single-selector rule builder used by content blocks. Wraps the declarations
 * from `fieldsToDeclsFn` in `.${scope} { … }` and appends auto-scoped raw CSS.
 */
function buildSingleSelectorRules(
  fieldsToDeclsFn: (fields: Record<string, string | number | boolean>) => string,
): SimpleBlockConfig['buildRules'] {
  return (scopeClass, fields, rawCss) => {
    const parts: string[] = [];
    const decls = fieldsToDeclsFn(fields);
    if (decls) parts.push(`.${scopeClass} { ${decls}; }`);
    if (rawCss && rawCss.trim()) parts.push(autoScopeRawCss(`.${scopeClass}`, rawCss));
    return parts.join('\n');
  };
}

/**
 * Media block rule builder (Image / Video). Splits declarations between wrapper
 * (background, padding, max-width, alignment) and inner media element
 * (border, border-radius, opacity) — controlled by the `borderTarget` field
 * which defaults to `'content'`.
 */
function buildMediaBlockRules(mediaSelector: string): SimpleBlockConfig['buildRules'] {
  return (scopeClass, fields, rawCss) => {
    const wrap: string[] = [];
    const media: string[] = [];

    // ── Wrapper-level: background, padding, max-width, alignment ────────────
    if (fields.bgColor !== undefined && fields.bgColor !== '') wrap.push(`background: ${fields.bgColor}`);

    const align = typeof fields.align === 'string' ? fields.align : undefined;
    if (align === 'left' || align === 'center' || align === 'right') {
      wrap.push(`text-align: ${align}`);
    }

    const pvSet = fields.paddingV !== undefined && fields.paddingV !== '';
    const phSet = fields.paddingH !== undefined && fields.paddingH !== '';
    if (pvSet && phSet) wrap.push(`padding: ${fields.paddingV}px ${fields.paddingH}px`);
    else if (pvSet)    wrap.push(`padding-top: ${fields.paddingV}px; padding-bottom: ${fields.paddingV}px`);
    else if (phSet)    wrap.push(`padding-left: ${fields.paddingH}px; padding-right: ${fields.paddingH}px`);

    if (fields.maxWidth !== undefined && fields.maxWidth !== '' && Number(fields.maxWidth) > 0) {
      wrap.push(`max-width: ${fields.maxWidth}px`);
    }

    // ── Border + radius — by default on content (img / video); opt out via borderTarget=wrapper ──
    const borderTarget = fields.borderTarget === 'wrapper' ? 'wrapper' : 'content';
    const bw = fields.borderWidth;
    const bc = fields.borderColor;
    const hasBW = bw !== undefined && bw !== '';
    const hasBC = bc !== undefined && bc !== '';
    let borderDecl = '';
    if (hasBW && hasBC) borderDecl = `border: ${bw}px solid ${bc}`;
    else if (hasBW)     borderDecl = `border-width: ${bw}px; border-style: solid`;
    else if (hasBC)     borderDecl = `border: 1px solid ${bc}`;

    const radiusDecl = (fields.borderRadius !== undefined && fields.borderRadius !== '')
      ? `border-radius: ${fields.borderRadius}px`
      : '';

    if (borderTarget === 'content') {
      if (borderDecl) media.push(borderDecl);
      if (radiusDecl) media.push(radiusDecl);
    } else {
      if (borderDecl) wrap.push(borderDecl);
      if (radiusDecl) wrap.push(radiusDecl);
    }

    // ── Opacity — always on media element ───────────────────────────────────
    if (fields.opacity !== undefined && fields.opacity !== '') {
      const n = Number(fields.opacity);
      if (Number.isFinite(n)) media.push(`opacity: ${(n / 100).toFixed(2)}`);
    }

    const parts: string[] = [];
    if (wrap.length)  parts.push(`.${scopeClass} { ${wrap.join('; ')}; }`);
    if (media.length) parts.push(`.${scopeClass} ${mediaSelector} { ${media.join('; ')}; }`);
    if (rawCss && rawCss.trim()) parts.push(autoScopeRawCss(`.${scopeClass}`, rawCss));
    return parts.join('\n');
  };
}

/**
 * Choice block rule builder. Splits wrapper layout (direction / gap) from
 * per-option link styling (applied to `a` inside the wrapper).
 */
function buildChoiceBlockRules(): SimpleBlockConfig['buildRules'] {
  return (scopeClass, fields, rawCss) => {
    const wrap: string[] = [];
    const a: string[] = [];

    // ── Wrapper layout (flex direction / gap) ───────────────────────────────
    const dir = typeof fields.direction === 'string' ? fields.direction : undefined;
    if (dir === 'row' || dir === 'column') {
      wrap.push(`display: flex`);
      wrap.push(`flex-direction: ${dir}`);
    }
    if (fields.gap !== undefined && fields.gap !== '') {
      // Implicit display:flex when gap is set without explicit direction.
      if (!dir) wrap.push(`display: flex; flex-direction: column`);
      wrap.push(`gap: ${fields.gap}px`);
    }

    // ── Per-link styling on <a> ─────────────────────────────────────────────
    if (fields.bgColor      !== undefined && fields.bgColor      !== '') a.push(`background: ${fields.bgColor}`);
    if (fields.textColor    !== undefined && fields.textColor    !== '') a.push(`color: ${fields.textColor}`);

    const bw = fields.borderWidth;
    const bc = fields.borderColor;
    const hasBW = bw !== undefined && bw !== '';
    const hasBC = bc !== undefined && bc !== '';
    if (hasBW && hasBC) a.push(`border: ${bw}px solid ${bc}`);
    else if (hasBW)     a.push(`border: ${bw}px solid currentColor`);
    else if (hasBC)     a.push(`border: 1px solid ${bc}`);

    if (fields.borderRadius !== undefined && fields.borderRadius !== '') a.push(`border-radius: ${fields.borderRadius}px`);

    const pvSet = fields.paddingV !== undefined && fields.paddingV !== '';
    const phSet = fields.paddingH !== undefined && fields.paddingH !== '';
    if (pvSet && phSet) a.push(`padding: ${fields.paddingV}px ${fields.paddingH}px`);
    else if (pvSet)     a.push(`padding-top: ${fields.paddingV}px; padding-bottom: ${fields.paddingV}px`);
    else if (phSet)     a.push(`padding-left: ${fields.paddingH}px; padding-right: ${fields.paddingH}px`);

    if (fields.fontSize !== undefined && fields.fontSize !== '') {
      const n = Number(fields.fontSize);
      if (Number.isFinite(n)) a.push(`font-size: ${(n / 10).toFixed(1)}em`);
    }
    if (fields.bold === true)  a.push(`font-weight: bold`);
    if (fields.bold === false) a.push(`font-weight: normal`);

    // ── Full width: make each <a> stretch (flex-column) ─────────────────────
    let widthRules = '';
    if (fields.fullWidth === true) {
      a.push(`display: block`);
      a.push(`text-align: center`);
      a.push(`box-sizing: border-box`);
      widthRules = `.${scopeClass} a { width: 100%; }`;
    }

    const parts: string[] = [];
    if (wrap.length) parts.push(`.${scopeClass} { ${wrap.join('; ')}; }`);
    if (a.length)    parts.push(`.${scopeClass} a { ${a.join('; ')}; }`);
    if (widthRules)  parts.push(widthRules);
    if (rawCss && rawCss.trim()) parts.push(autoScopeRawCss(`.${scopeClass}`, rawCss));
    return parts.join('\n');
  };
}

/**
 * Popup block rule builder. Targets the SugarCube `#ui-dialog` element
 * (id+class for high specificity against core dialog styles). Note: the cascade
 * class is added to `#ui-dialog-body` by `Dialog.setup()`; the runtime script
 * (`buildPopupClassSyncScript`) mirrors it onto `#ui-dialog` on `:dialogopened`.
 *
 * Only title / header / frame are styled here — body bg / text come from the
 * popup-scene's own blocks.
 */
/**
 * Tabs block rule builder. Generates three sets of selectors per scope:
 *   - `.scope`                — bar layout (gap + flex)
 *   - `.scope a`              — per-tab anchor styling (applies to all tabs)
 *   - `.scope a.tg-tabs-active` — overrides for the currently-active tab
 * The active class is added at runtime by `buildTabsBlockScript`.
 */
function buildTabsBlockRules(): SimpleBlockConfig['buildRules'] {
  return (scopeClass, fields, rawCss) => {
    const wrap: string[] = [];
    const a: string[] = [];
    const aActive: string[] = [];

    // ── Bar layout (always flex; gap configurable) ───────────────────────────
    if (fields.gap !== undefined && fields.gap !== '') {
      wrap.push('display: flex');
      wrap.push(`gap: ${fields.gap}px`);
    }

    // ── Per-tab styling (inactive) ───────────────────────────────────────────
    if (fields.bgColor   !== undefined && fields.bgColor   !== '') a.push(`background: ${fields.bgColor}`);
    if (fields.textColor !== undefined && fields.textColor !== '') a.push(`color: ${fields.textColor}`);

    const bw = fields.borderWidth;
    const bc = fields.borderColor;
    const hasBW = bw !== undefined && bw !== '';
    const hasBC = bc !== undefined && bc !== '';
    if (hasBW && hasBC) a.push(`border: ${bw}px solid ${bc}`);
    else if (hasBW)     a.push(`border: ${bw}px solid currentColor`);
    else if (hasBC)     a.push(`border: 1px solid ${bc}`);

    if (fields.borderRadius !== undefined && fields.borderRadius !== '') a.push(`border-radius: ${fields.borderRadius}px`);

    const pvSet = fields.paddingV !== undefined && fields.paddingV !== '';
    const phSet = fields.paddingH !== undefined && fields.paddingH !== '';
    if (pvSet && phSet) a.push(`padding: ${fields.paddingV}px ${fields.paddingH}px`);
    else if (pvSet)     a.push(`padding-top: ${fields.paddingV}px; padding-bottom: ${fields.paddingV}px`);
    else if (phSet)     a.push(`padding-left: ${fields.paddingH}px; padding-right: ${fields.paddingH}px`);

    if (fields.fontSize !== undefined && fields.fontSize !== '') {
      const n = Number(fields.fontSize);
      if (Number.isFinite(n)) a.push(`font-size: ${(n / 10).toFixed(1)}em`);
    }
    if (fields.bold === true)  a.push(`font-weight: bold`);
    if (fields.bold === false) a.push(`font-weight: normal`);

    // ── Active-tab overrides ─────────────────────────────────────────────────
    if (fields.activeBgColor     !== undefined && fields.activeBgColor     !== '') aActive.push(`background: ${fields.activeBgColor}`);
    if (fields.activeTextColor   !== undefined && fields.activeTextColor   !== '') aActive.push(`color: ${fields.activeTextColor}`);
    if (fields.activeBorderColor !== undefined && fields.activeBorderColor !== '') {
      // If a border was set above, only override the color; else add a 1px border
      if (hasBW)      aActive.push(`border-color: ${fields.activeBorderColor}`);
      else            aActive.push(`border: 1px solid ${fields.activeBorderColor}`);
    }
    if (fields.activeBold === true)  aActive.push(`font-weight: bold`);
    if (fields.activeBold === false) aActive.push(`font-weight: normal`);

    const parts: string[] = [];
    if (wrap.length)    parts.push(`.${scopeClass} { ${wrap.join('; ')}; }`);
    if (a.length)       parts.push(`.${scopeClass} a { ${a.join('; ')}; }`);
    if (aActive.length) parts.push(`.${scopeClass} a.tg-tabs-active { ${aActive.join('; ')}; }`);
    if (rawCss && rawCss.trim()) parts.push(autoScopeRawCss(`.${scopeClass}`, rawCss));
    return parts.join('\n');
  };
}

function buildPopupBlockRules(): SimpleBlockConfig['buildRules'] {
  return (scopeClass, fields, rawCss) => {
    const frame: string[] = [];
    const titlebar: string[] = [];
    const title: string[] = [];

    // ── Frame (the dialog itself) ─────────────────────────────────────────
    const bw = fields.borderWidth;
    const bc = fields.borderColor;
    const hasBW = bw !== undefined && bw !== '';
    const hasBC = bc !== undefined && bc !== '';
    if (hasBW && hasBC) frame.push(`border: ${bw}px solid ${bc}`);
    else if (hasBW)     frame.push(`border-width: ${bw}px; border-style: solid`);
    else if (hasBC)     frame.push(`border: 1px solid ${bc}`);

    const hasRadius = fields.borderRadius !== undefined && fields.borderRadius !== '';
    if (hasRadius) frame.push(`border-radius: ${fields.borderRadius}px`);
    if (fields.maxWidth !== undefined && fields.maxWidth !== '' && Number(fields.maxWidth) > 0) {
      frame.push(`max-width: ${fields.maxWidth}px`);
    }

    // When the user puts a custom border or radius on the frame, clip the
    // inner titlebar + body to the rounded shape and remove SugarCube's default
    // padding so content sits flush against the frame edge.
    if (hasBW || hasBC || hasRadius) {
      frame.push(`overflow: hidden`);
      frame.push(`padding: 0`);
    }

    // ── Titlebar (header strip) ──────────────────────────────────────────
    if (fields.titlebarBg !== undefined && fields.titlebarBg !== '') titlebar.push(`background: ${fields.titlebarBg}`);

    // ── Title text ───────────────────────────────────────────────────────
    if (fields.titleColor !== undefined && fields.titleColor !== '') title.push(`color: ${fields.titleColor}`);

    const dialogSel = `#ui-dialog.${scopeClass}`;

    const parts: string[] = [];
    if (frame.length)    parts.push(`${dialogSel} { ${frame.join('; ')}; }`);
    if (titlebar.length) parts.push(`${dialogSel} #ui-dialog-titlebar { ${titlebar.join('; ')}; }`);
    if (title.length)    parts.push(`${dialogSel} #ui-dialog-title { ${title.join('; ')}; }`);
    if (rawCss && rawCss.trim()) parts.push(autoScopeRawCss(dialogSel, rawCss));
    return parts.join('\n');
  };
}

/**
 * Runtime script that syncs cascade classes from `#ui-dialog-body` (where
 * SugarCube places them via `Dialog.setup()`) onto `#ui-dialog` (the frame),
 * so CSS rules scoped to `#ui-dialog.tg-popup-*` actually match.
 *
 * Hooks `:dialogopened` (fires after Dialog.open finishes). Cleans previous
 * popup classes on each open so two popups don't leak styles into each other.
 *
 * Returns '' when the project has no popup blocks (no need for the hook).
 */
export function buildPopupClassSyncScript(scenes: Scene[]): string {
  // Detect whether any popup block exists at all (otherwise no need for the script).
  function hasPopupAnywhere(blocks: Block[]): boolean {
    for (const b of blocks) {
      if (b.type === 'popup') return true;
      if (b.type === 'condition') {
        for (const br of b.branches) if (hasPopupAnywhere(br.blocks)) return true;
      }
      if (b.type === 'dialogue' && b.innerBlocks) {
        if (hasPopupAnywhere(b.innerBlocks)) return true;
      }
      if (b.type === 'section') {
        if (hasPopupAnywhere(b.blocks)) return true;
      }
      if (b.type === 'tabs') {
        for (const tab of b.tabs) if (hasPopupAnywhere(tab.blocks)) return true;
      }
      if (b.type === 'table') {
        for (const row of b.rows) for (const cell of row.cells) if (hasPopupAnywhere(cell.blocks)) return true;
      }
    }
    return false;
  }
  let anyPopup = false;
  for (const s of scenes) { if (hasPopupAnywhere(s.blocks)) { anyPopup = true; break; } }
  if (!anyPopup) return '';

  return [
    '// Popup class sync — mirror tg-popup-* from #ui-dialog-body to #ui-dialog frame.',
    '$(document).on(":dialogopened", function() {',
    '  var bodyCls = ($("#ui-dialog-body").attr("class") || "").split(/\\s+/);',
    '  var popupCls = bodyCls.filter(function(c) { return c && /^tg-popup-/.test(c); });',
    '  var $frame = $("#ui-dialog");',
    '  // Strip any previous tg-popup-* classes from the frame, then add the current ones.',
    '  var frameCls = (($frame.attr("class") || "").split(/\\s+/)).filter(function(c) { return c && !/^tg-popup-/.test(c); });',
    '  $frame.attr("class", frameCls.concat(popupCls).join(" "));',
    '});',
  ].join('\n');
}

/**
 * DisplayObject rule builder. Container-level fields go on `.scopeClass` itself;
 * `labelColor` / `valueColor` / `barColor` / `barEmptyColor` are mapped to the
 * structural sub-element classes (`.tg-do-label / .tg-do-value / .tg-do-bar-fill / .tg-do-bar`).
 * `gap` becomes a CSS gap, useful in inline / cards / grid / list layouts.
 */
function buildDisplayObjectRules(): SimpleBlockConfig['buildRules'] {
  return (scopeClass, fields, rawCss) => {
    const wrap: string[] = [];
    const label: string[] = [];
    const value: string[] = [];
    const barFill: string[] = [];
    const barTrack: string[] = [];

    if (fields.bgColor   !== undefined && fields.bgColor   !== '') wrap.push(`background: ${fields.bgColor}`);
    if (fields.textColor !== undefined && fields.textColor !== '') wrap.push(`color: ${fields.textColor}`);

    const bw = fields.borderWidth;
    const bc = fields.borderColor;
    const hasBW = bw !== undefined && bw !== '';
    const hasBC = bc !== undefined && bc !== '';
    if (hasBW && hasBC) wrap.push(`border: ${bw}px solid ${bc}`);
    else if (hasBW)     wrap.push(`border-width: ${bw}px; border-style: solid`);
    else if (hasBC)     wrap.push(`border: 1px solid ${bc}`);

    if (fields.borderRadius !== undefined && fields.borderRadius !== '') wrap.push(`border-radius: ${fields.borderRadius}px`);

    const pv = fields.paddingV;
    const ph = fields.paddingH;
    const hasPV = pv !== undefined && pv !== '';
    const hasPH = ph !== undefined && ph !== '';
    if (hasPV && hasPH) wrap.push(`padding: ${pv}px ${ph}px`);
    else if (hasPV)     wrap.push(`padding-top: ${pv}px; padding-bottom: ${pv}px`);
    else if (hasPH)     wrap.push(`padding-left: ${ph}px; padding-right: ${ph}px`);

    if (fields.gap !== undefined && fields.gap !== '') wrap.push(`gap: ${fields.gap}px`);

    if (fields.fontSize !== undefined && fields.fontSize !== '') {
      const n = Number(fields.fontSize);
      if (Number.isFinite(n)) wrap.push(`font-size: ${(n / 10).toFixed(1)}em`);
    }

    if (fields.labelColor     !== undefined && fields.labelColor     !== '') label.push(`color: ${fields.labelColor}`);
    if (fields.valueColor     !== undefined && fields.valueColor     !== '') value.push(`color: ${fields.valueColor}`);
    if (fields.barColor       !== undefined && fields.barColor       !== '') barFill.push(`background: ${fields.barColor}`);
    if (fields.barEmptyColor  !== undefined && fields.barEmptyColor  !== '') barTrack.push(`background: ${fields.barEmptyColor}`);

    const parts: string[] = [];
    if (wrap.length)     parts.push(`.${scopeClass} { ${wrap.join('; ')}; }`);
    if (label.length)    parts.push(`.${scopeClass} .tg-do-label { ${label.join('; ')}; }`);
    if (value.length)    parts.push(`.${scopeClass} .tg-do-value { ${value.join('; ')}; }`);
    if (barFill.length)  parts.push(`.${scopeClass} .tg-do-bar-fill { ${barFill.join('; ')}; }`);
    if (barTrack.length) parts.push(`.${scopeClass} .tg-do-bar { ${barTrack.join('; ')}; }`);
    if (rawCss && rawCss.trim()) parts.push(autoScopeRawCss(`.${scopeClass}`, rawCss));
    return parts.join('\n');
  };
}

const SIMPLE_BLOCK_CONFIGS: Record<SimpleBlockType, SimpleBlockConfig> = {
  text:          { baseClass: 'tg-text',         buildRules: buildSingleSelectorRules(contentBlockFieldsToDecls), schema: CONTENT_BLOCK_FIELD_SCHEMA },
  image:         { baseClass: 'tg-image',        buildRules: buildMediaBlockRules('img'),                          schema: MEDIA_BLOCK_FIELD_SCHEMA },
  // image-gen exports as `<div class="tg-image"><img/></div>` (same wrapper as image), so it shares the
  // tg-image base CSS; cascade default/spot classes get their own `tg-image-gen-*` namespace.
  'image-gen':   { baseClass: 'tg-image',        buildRules: buildMediaBlockRules('img'),                          schema: MEDIA_BLOCK_FIELD_SCHEMA },
  video:         { baseClass: 'tg-video',        buildRules: buildMediaBlockRules('video'),                        schema: MEDIA_BLOCK_FIELD_SCHEMA },
  // video-gen exports as `<div class="tg-video"><video/></div>` (same wrapper as video), so it shares tg-video base CSS.
  'video-gen':   { baseClass: 'tg-video',        buildRules: buildMediaBlockRules('video'),                        schema: MEDIA_BLOCK_FIELD_SCHEMA },
  include:       { baseClass: 'tg-include',      buildRules: buildSingleSelectorRules(contentBlockFieldsToDecls), schema: CONTENT_BLOCK_FIELD_SCHEMA },
  divider:       { baseClass: 'tg-divider',      buildRules: buildSingleSelectorRules(dividerFieldsToDecls),      schema: DIVIDER_FIELD_SCHEMA },
  checkbox:      { baseClass: 'tg-checkbox',     buildRules: buildSingleSelectorRules(contentBlockFieldsToDecls), schema: CONTENT_BLOCK_FIELD_SCHEMA },
  radio:         { baseClass: 'tg-radio',        buildRules: buildSingleSelectorRules(contentBlockFieldsToDecls), schema: CONTENT_BLOCK_FIELD_SCHEMA },
  'input-field': { baseClass: 'tg-input-field',  buildRules: buildSingleSelectorRules(contentBlockFieldsToDecls), schema: CONTENT_BLOCK_FIELD_SCHEMA },
  // Choice — wrapping <div class="tg-choice"> around the list of <<link>>s, plus per-link <a> styling.
  choice:        { baseClass: 'tg-choice',       buildRules: buildChoiceBlockRules(),                              schema: CHOICE_FIELD_SCHEMA },
  // Popup — cascade classes go onto SugarCube's #ui-dialog via Dialog.setup; rules are scoped to that element.
  popup:         { baseClass: 'tg-popup',        buildRules: buildPopupBlockRules(),                               schema: POPUP_FIELD_SCHEMA },
  // Tabs — wrapping <div class="tg-tabs-block"> around per-tab spans containing <<link>>s.
  tabs:          { baseClass: 'tg-tabs-block',   buildRules: buildTabsBlockRules(),                                schema: TABS_FIELD_SCHEMA },
  // DisplayObject — `<div class="tg-do tg-do-{layout}">` with `.tg-do-row/-label/-value/-bar*` sub-elements.
  'display-object': { baseClass: 'tg-do',        buildRules: buildDisplayObjectRules(),                            schema: DISPLAY_OBJECT_FIELD_SCHEMA },
};

function simpleShortId(id: string): string {
  return id.replace(/-/g, '').substring(0, 12);
}

function simpleBlockDefaultClass(type: SimpleBlockType): string {
  return `${SIMPLE_BLOCK_CONFIGS[type].baseClass}-default`;
}

function simpleBlockDefaultVariantClass(type: SimpleBlockType, variantKey: string): string {
  return `${SIMPLE_BLOCK_CONFIGS[type].baseClass}-default-v-${variantKey}`;
}

function simpleBlockSpotClass(type: SimpleBlockType, blockId: string): string {
  return `${SIMPLE_BLOCK_CONFIGS[type].baseClass}-spot-${simpleShortId(blockId)}`;
}


/**
 * Emit per-type Common rules (and bound variants) for all simple block types.
 * Spot rules are emitted separately per block by `buildSimpleBlockSpotStyleBlock`.
 */
export function buildSimpleBlocksCascadeCss(_scenes: Scene[], settings: ProjectSettings): string {
  const defaults = settings.defaultBlockStyles ?? {};
  const parts: string[] = [];

  for (const type of Object.keys(SIMPLE_BLOCK_CONFIGS) as SimpleBlockType[]) {
    const cs = defaults[type];
    if (!cs?.enabled) continue;
    const cfg = SIMPLE_BLOCK_CONFIGS[type];

    if ((cs.mode ?? 'static') === 'static') {
      const rule = cfg.buildRules(simpleBlockDefaultClass(type), cs.fields ?? {}, cs.rawCss);
      if (rule) parts.push(rule);
    } else {
      // Bound: default + per-variant
      const defaultRule = cfg.buildRules(
        simpleBlockDefaultVariantClass(type, 'default'),
        cs.defaultFields ?? {},
        cs.defaultRawCss,
      );
      if (defaultRule) parts.push(defaultRule);
      (cs.mapping ?? []).forEach((entry, idx) => {
        const rule = cfg.buildRules(
          simpleBlockDefaultVariantClass(type, String(idx)),
          entry.fields ?? {},
          entry.rawCss,
        );
        if (rule) parts.push(rule);
      });
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

/** Emit `<style>` block for a single block's spot override. '' when none. */
export function buildSimpleBlockSpotStyleBlock(block: SimpleBlockBlock): string {
  const cs = block.customStyle;
  if (!cs?.enabled) return '';
  const fields = cs.fields ?? {};
  const rawCss = cs.rawCss;
  if (Object.keys(fields).length === 0 && (!rawCss || !rawCss.trim())) return '';

  const type = block.type as SimpleBlockType;
  const cfg = SIMPLE_BLOCK_CONFIGS[type];
  const rules = cfg.buildRules(simpleBlockSpotClass(type, block.id), fields, rawCss);
  return rules ? `<style>${rules}</style>` : '';
}

// ─── Aggregate spot rules for editor preview ─────────────────────────────────
//
// Spot rules live in <style> blocks inside each passage on export. For the
// in-editor preview we collect them into one CSS string that gets injected
// into document.head, so previews see the same scoped overrides.

function stripStyleTags(s: string): string {
  if (!s) return '';
  return s.replace(/^<style>/, '').replace(/<\/style>$/, '');
}

/**
 * Walks every block in every scene (recursing through condition branches and
 * dialogue inner blocks) and collects per-block spot override CSS rules.
 * Returns concatenated rules (no <style> wrapper).
 */
export function buildAllSpotStyleRules(scenes: Scene[]): string {
  const out: string[] = [];

  function emitFor(block: Block): void {
    let raw = '';
    if (block.type === 'dialogue') {
      raw = buildDialogueSpotStyleBlock(block);
    } else if (block.type === 'button' || block.type === 'link' || block.type === 'function') {
      raw = buildButtonSpotStyleBlock(block);
    } else if (
      block.type === 'text'      || block.type === 'image'     ||
      block.type === 'image-gen' || block.type === 'video'     || block.type === 'video-gen' ||
      block.type === 'include'   || block.type === 'divider'   ||
      block.type === 'checkbox'  || block.type === 'radio'     ||
      block.type === 'input-field' ||
      block.type === 'choice'    || block.type === 'popup'
    ) {
      raw = buildSimpleBlockSpotStyleBlock(block as SimpleBlockBlock);
    }
    const rules = stripStyleTags(raw);
    if (rules) out.push(rules);
  }

  function walk(blocks: Block[]): void {
    for (const b of blocks) {
      emitFor(b);
      if (b.type === 'condition') {
        for (const br of b.branches) walk(br.blocks);
      }
      if (b.type === 'dialogue' && b.innerBlocks) {
        walk(b.innerBlocks);
      }
      if (b.type === 'tabs') {
        for (const tab of b.tabs) walk(tab.blocks);
      }
      if (b.type === 'section') {
        walk(b.blocks);
      }
      if (b.type === 'table') {
        for (const row of b.rows) for (const cell of row.cells) walk(cell.blocks);
      }
    }
  }

  for (const s of scenes) walk(s.blocks);
  return out.join('\n\n');
}

/** Cascade classes to append to the block's wrapper (base class is emitted elsewhere). */
export function simpleBlockCascadeClasses(block: SimpleBlockBlock, settings: ProjectSettings): string[] {
  const type = block.type as SimpleBlockType;
  const out: string[] = [];
  const cs = settings.defaultBlockStyles?.[type];
  if (cs?.enabled) {
    if ((cs.mode ?? 'static') === 'bound') {
      out.push(simpleBlockDefaultVariantClass(type, 'default'));
    } else {
      out.push(simpleBlockDefaultClass(type));
    }
  }
  if (block.customStyle?.enabled) {
    out.push(simpleBlockSpotClass(type, block.id));
  }
  return out;
}

/** `data-style-bind` value for this block (or '' when not bound). */
export function simpleBlockDataStyleBind(block: SimpleBlockBlock, settings: ProjectSettings): string {
  const type = block.type as SimpleBlockType;
  const cs = settings.defaultBlockStyles?.[type];
  if (cs?.enabled && (cs.mode ?? 'static') === 'bound') return `default-${type}`;
  return '';
}

// ─── Runtime style-bind script ───────────────────────────────────────────────

interface RuntimeBinding {
  /** data-style-bind value (matches the element's attribute). */
  key: string;
  /** SugarCube variable path WITHOUT leading $. */
  varPath: string;
  /**
   * Class-name prefix used to strip stale variant classes from the element
   * before adding the new one. Examples:
   *   - dialogue: `dlg-{charKey}-v-`
   *   - button family: `tg-btn-default-{type}-v-`
   */
  classPrefix: string;
  /** Variant entries — first match wins. */
  variants: Array<
    | { kind: 'exact'; value: number; cls: string }
    | { kind: 'range'; min: number; max: number; cls: string }
  >;
  /** Default class (used when no variant matches or variable undefined/non-numeric). */
  defaultCls: string;
}

/**
 * Build runtime bindings for every layer that uses bound common-custom:
 *   - Dialogue: one entry per character with bound `customDialogueStyle`
 *   - Button family: one entry per type whose `defaultBlockStyles[type]` is bound
 */
function collectRuntimeBindings(project: Project): RuntimeBinding[] {
  const bindings: RuntimeBinding[] = [];

  // ─── Dialogue (per character) ──────────────────────────────────────────────
  for (const char of project.characters) {
    const cs = char.customDialogueStyle;
    if (!cs?.enabled || (cs.mode ?? 'static') !== 'bound') continue;
    if (!cs.variableId) continue;
    const varPath = getVariablePath(cs.variableId, project.variableNodes);
    if (!varPath) continue;

    const variants: RuntimeBinding['variants'] = [];
    (cs.mapping ?? []).forEach((entry, idx) => {
      const cls = dialogueVariantClass(char.id, String(idx));
      if (entry.matchType === 'exact') {
        const v = Number(entry.value);
        if (Number.isFinite(v)) variants.push({ kind: 'exact', value: v, cls });
      } else {
        const min = Number(entry.rangeMin);
        const max = Number(entry.rangeMax);
        if (Number.isFinite(min) && Number.isFinite(max)) {
          variants.push({ kind: 'range', min, max, cls });
        }
      }
    });

    const charKey = charClassId(char.id);
    bindings.push({
      key: charKey,
      varPath,
      classPrefix: `dlg-${charKey}-v-`,
      variants,
      defaultCls: dialogueVariantClass(char.id, 'default'),
    });
  }

  // ─── Button family (per type) ─────────────────────────────────────────────
  const defaults = project.settings.defaultBlockStyles ?? {};
  for (const type of ['button', 'link', 'function'] as const) {
    const cs = defaults[type];
    if (!cs?.enabled || (cs.mode ?? 'static') !== 'bound') continue;
    if (!cs.variableId) continue;
    const varPath = getVariablePath(cs.variableId, project.variableNodes);
    if (!varPath) continue;

    const variants: RuntimeBinding['variants'] = [];
    (cs.mapping ?? []).forEach((entry, idx) => {
      const cls = buttonDefaultVariantClass(type, String(idx));
      if (entry.matchType === 'exact') {
        const v = Number(entry.value);
        if (Number.isFinite(v)) variants.push({ kind: 'exact', value: v, cls });
      } else {
        const min = Number(entry.rangeMin);
        const max = Number(entry.rangeMax);
        if (Number.isFinite(min) && Number.isFinite(max)) {
          variants.push({ kind: 'range', min, max, cls });
        }
      }
    });

    bindings.push({
      key: `default-${type}`,
      varPath,
      classPrefix: `tg-btn-default-${type}-v-`,
      variants,
      defaultCls: buttonDefaultVariantClass(type, 'default'),
    });
  }

  // ─── Simple block family (per type) ───────────────────────────────────────
  for (const type of Object.keys(SIMPLE_BLOCK_CONFIGS) as SimpleBlockType[]) {
    const cs = defaults[type];
    if (!cs?.enabled || (cs.mode ?? 'static') !== 'bound') continue;
    if (!cs.variableId) continue;
    const varPath = getVariablePath(cs.variableId, project.variableNodes);
    if (!varPath) continue;

    const variants: RuntimeBinding['variants'] = [];
    (cs.mapping ?? []).forEach((entry, idx) => {
      const cls = simpleBlockDefaultVariantClass(type, String(idx));
      if (entry.matchType === 'exact') {
        const v = Number(entry.value);
        if (Number.isFinite(v)) variants.push({ kind: 'exact', value: v, cls });
      } else {
        const min = Number(entry.rangeMin);
        const max = Number(entry.rangeMax);
        if (Number.isFinite(min) && Number.isFinite(max)) {
          variants.push({ kind: 'range', min, max, cls });
        }
      }
    });

    bindings.push({
      key: `default-${type}`,
      varPath,
      classPrefix: `${SIMPLE_BLOCK_CONFIGS[type].baseClass}-default-v-`,
      variants,
      defaultCls: simpleBlockDefaultVariantClass(type, 'default'),
    });
  }

  return bindings;
}

/**
 * Emit the runtime script that swaps variant classes on `[data-style-bind]`
 * elements based on a numeric variable's current value.
 *
 * Returns '' when no bindings exist (no characters use bound mode).
 *
 * The script:
 *   - Defines `window._tgStyleBindings` registry keyed by binding.key
 *   - Defines `window._tgRefreshStyleBind()` that walks all `[data-style-bind]` nodes,
 *     reads the bound variable, picks the matching variant, swaps the class
 *   - Hooks `:passagedisplay`
 *
 * Click handlers in exported buttons should also call `_tgRefreshStyleBind()` for
 * mid-passage updates (added separately in exportToTwee).
 */
export function buildStyleBindScript(project: Project): string {
  const bindings = collectRuntimeBindings(project);
  if (bindings.length === 0) return '';

  const registryEntries = bindings.map(b => {
    const variants = b.variants.map(v => {
      if (v.kind === 'exact') {
        return `{kind:"exact",value:${v.value},cls:${JSON.stringify(v.cls)}}`;
      }
      return `{kind:"range",min:${v.min},max:${v.max},cls:${JSON.stringify(v.cls)}}`;
    }).join(',');
    return `${JSON.stringify(b.key)}:{varPath:${JSON.stringify(b.varPath)},classPrefix:${JSON.stringify(b.classPrefix)},variants:[${variants}],defaultCls:${JSON.stringify(b.defaultCls)}}`;
  }).join(',');

  return [
    'window._tgStyleBindings = {' + registryEntries + '};',
    'window._tgReadVarByPath = function(path) {',
    '  var parts = path.split("."), cur = State.variables;',
    '  for (var i = 0; i < parts.length; i++) {',
    '    if (cur == null) return undefined;',
    '    cur = cur[parts[i]];',
    '  }',
    '  return cur;',
    '};',
    'window._tgRefreshStyleBind = function() {',
    '  var bindings = window._tgStyleBindings; if (!bindings) return;',
    '  document.querySelectorAll("[data-style-bind]").forEach(function(el) {',
    '    var key = el.getAttribute("data-style-bind");',
    '    var b = bindings[key]; if (!b) return;',
    '    var v = window._tgReadVarByPath(b.varPath);',
    '    var n = (typeof v === "number" && isFinite(v)) ? v : null;',
    '    var picked = b.defaultCls;',
    '    if (n !== null) {',
    '      for (var i = 0; i < b.variants.length; i++) {',
    '        var entry = b.variants[i];',
    '        if (entry.kind === "exact" && n === entry.value) { picked = entry.cls; break; }',
    '        if (entry.kind === "range" && n >= entry.min && n <= entry.max) { picked = entry.cls; break; }',
    '      }',
    '    }',
    '    // Strip any prior variant class for this binding, then add the chosen one.',
    '    var prefix = b.classPrefix;',
    '    var classes = el.className.split(/\\s+/).filter(function(c) { return c.indexOf(prefix) !== 0; });',
    '    classes.push(picked);',
    '    el.className = classes.join(" ");',
    '  });',
    '};',
    '$(document).on(":passagedisplay", function() { window._tgRefreshStyleBind(); });',
  ].join('\n');
}

/**
 * Build scoped CSS for a live dialogue preview inside the editor (CharacterModal).
 * Mirrors the export output so the modal preview matches the finished story exactly,
 * including any raw CSS the user adds.
 *
 * @param scopeClass — unique class applied to the preview's `.dialogue` element
 * @param char       — character with the live (unsaved) form state
 * @param variantIdx — bound-mode variant index: 0..N-1 for mapping entries, -1 for default,
 *                     undefined when mode is static
 */
export function buildDialogueLivePreviewCss(
  scopeClass: string,
  char: Character,
  variantIdx?: number,
): string {
  const std = dialogueStdFields(char);
  const cs = char.customDialogueStyle;

  if (!cs?.enabled) {
    return buildDialogueRulesForScope(scopeClass, std);
  }

  if ((cs.mode ?? 'static') === 'static') {
    return buildDialogueRulesForScope(scopeClass, mergeFields(std, cs.fields), cs.rawCss);
  }

  // Bound mode
  if (variantIdx === undefined || variantIdx === -1) {
    return buildDialogueRulesForScope(scopeClass, mergeFields(std, cs.defaultFields), cs.defaultRawCss);
  }
  const entry = (cs.mapping ?? [])[variantIdx];
  if (!entry) {
    return buildDialogueRulesForScope(scopeClass, std);
  }
  return buildDialogueRulesForScope(scopeClass, mergeFields(std, entry.fields), entry.rawCss);
}

/** Returns true if the project has at least one bound style binding. */
export function hasStyleBindings(project: Project): boolean {
  for (const char of project.characters) {
    const cs = char.customDialogueStyle;
    if (cs?.enabled && (cs.mode ?? 'static') === 'bound' && cs.variableId) return true;
  }
  const defaults = project.settings.defaultBlockStyles ?? {};
  for (const type of ['button', 'link', 'function'] as const) {
    const cs = defaults[type];
    if (cs?.enabled && (cs.mode ?? 'static') === 'bound' && cs.variableId) return true;
  }
  for (const type of Object.keys(SIMPLE_BLOCK_CONFIGS) as SimpleBlockType[]) {
    const cs = defaults[type];
    if (cs?.enabled && (cs.mode ?? 'static') === 'bound' && cs.variableId) return true;
  }
  return false;
}
