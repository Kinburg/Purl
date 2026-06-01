import type { BlockType } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  Block categories + colours — single source of truth.
//  Used by AddBlockMenu (chips) and BlockItem (per-block card colour).
// ═══════════════════════════════════════════════════════════════════════════

export type CategoryKey = 'narrative' | 'media' | 'layout' | 'game' | 'data' | 'interaction' | 'logic' | 'system';

/** Category → block types. The order within each array also drives the per-block shade. */
export const BLOCK_CATEGORIES: { key: CategoryKey; types: BlockType[] }[] = [
  { key: 'narrative',   types: ['text', 'dialogue', 'callout'] },
  { key: 'media',       types: ['image', 'image-gen', 'video', 'audio', 'audio-gen', 'audio-volume'] },
  // layout = blocks that space / arrange / compose content (rather than being content). No logic, no own player input.
  //   divider/spacer space; tabs/section/table group inline blocks; include embeds another passage's content.
  { key: 'layout',      types: ['divider', 'spacer', 'tabs', 'section', 'table', 'include'] },
  // game = entities that need the Characters / Items systems.
  { key: 'game',        types: ['paperdoll', 'inventory', 'container'] },
  // data = blocks that read OR write story variables (genre-agnostic; useful for debug too).
  //   read/display: progress, date-time, display-object — author-side writes: variable-set, set-object, time-manipulation.
  //   (player-input writers like input-field/select/slider stay under `interaction`.)
  { key: 'data',        types: ['progress', 'date-time', 'display-object', 'variable-set', 'set-object', 'time-manipulation'] },
  // interaction = blocks the player acts on (click / type / toggle). `function` is a clickable button (like button/link).
  { key: 'interaction', types: ['choice', 'button', 'link', 'menu-link', 'input-field', 'checkbox', 'radio', 'select', 'slider', 'popup', 'function'] },
  // logic = control-flow primitives.
  { key: 'logic',       types: ['condition', 'for'] },
  { key: 'system',      types: ['raw', 'note', 'save'] },
];

/** Category chip palette (Add-block menu): vivid accent + faint bg + focus ring. */
export const CAT_COLORS: Record<string, { color: string; bg: string; ring: string }> = {
  narrative:   { color: '#818cf8', bg: 'rgba(99,102,241,0.14)',  ring: 'rgba(99,102,241,0.5)'  },
  media:       { color: '#2dd4bf', bg: 'rgba(45,212,191,0.14)',  ring: 'rgba(45,212,191,0.5)'  },
  layout:      { color: '#f472b6', bg: 'rgba(244,114,182,0.14)', ring: 'rgba(244,114,182,0.5)' },
  game:        { color: '#fb923c', bg: 'rgba(251,146,60,0.14)',  ring: 'rgba(251,146,60,0.5)'  },
  data:        { color: '#38bdf8', bg: 'rgba(56,189,248,0.14)',  ring: 'rgba(56,189,248,0.5)'  },
  interaction: { color: '#34d399', bg: 'rgba(16,185,129,0.14)',  ring: 'rgba(16,185,129,0.5)'  },
  logic:       { color: '#a78bfa', bg: 'rgba(167,139,250,0.14)', ring: 'rgba(167,139,250,0.5)' },
  system:      { color: '#94a3b8', bg: 'rgba(100,116,139,0.14)', ring: 'rgba(100,116,139,0.5)' },
  plugins:     { color: '#c084fc', bg: 'rgba(168,85,247,0.14)',  ring: 'rgba(168,85,247,0.5)'  },
};

// ── Per-block card palette ──────────────────────────────────────────────────
// Each category owns a hue (matching its chip colour). Blocks inside a category
// share that hue but get a slightly different lightness — a shade of the same
// family — so a block's colour signals its category at a glance while still
// varying per type. Drives the block card's left-accent border + faint fill.

const CAT_HUE: Record<CategoryKey, { h: number; s: number; l: number }> = {
  narrative:   { h: 234, s: 84, l: 72 },
  media:       { h: 172, s: 62, l: 56 },
  layout:      { h: 330, s: 80, l: 72 },
  game:        { h: 27,  s: 92, l: 62 },
  data:        { h: 199, s: 85, l: 62 },
  interaction: { h: 156, s: 64, l: 56 },
  logic:       { h: 255, s: 88, l: 76 },
  system:      { h: 215, s: 18, l: 64 },
};

const PLUGIN_HUE = { h: 271, s: 91, l: 72 };

const TYPE_INFO = (() => {
  const m = new Map<BlockType, { cat: CategoryKey; idx: number; n: number }>();
  for (const c of BLOCK_CATEGORIES) c.types.forEach((t, i) => m.set(t, { cat: c.key, idx: i, n: c.types.length }));
  return m;
})();

export function categoryOf(type: BlockType): CategoryKey | null {
  return TYPE_INFO.get(type)?.cat ?? null;
}

export interface BlockPalette { accent: string; fill: string; }

/** Shade `base` by the block's position in its family: spread lightness, centred on the base. */
function shade(base: { h: number; s: number; l: number }, idx: number, n: number): BlockPalette {
  const spread = 16;
  const step = n > 1 ? spread / (n - 1) : 0;
  const l = Math.max(40, Math.min(82, Math.round(base.l - spread / 2 + idx * step)));
  return {
    accent: `hsl(${base.h} ${base.s}% ${l}%)`,
    fill:   `hsl(${base.h} ${base.s}% ${l}% / 0.10)`,
  };
}

/** Left-accent border + faint card fill for a block, derived from its category. */
export function blockPalette(type: BlockType): BlockPalette {
  if (type === 'plugin') return shade(PLUGIN_HUE, 0, 1);
  const info = TYPE_INFO.get(type);
  if (!info) return { accent: 'hsl(215 16% 55%)', fill: 'hsl(215 16% 55% / 0.08)' };
  return shade(CAT_HUE[info.cat], info.idx, info.n);
}
