import type {
  Block, PluginBlockDef, PluginParam, PluginParamKind,
} from '../types';

// ─── Filename / id helpers ──────────────────────────────────────────────────

/** Sanitize plugin name → safe kebab-case slug for filename. */
export function slugifyPluginName(name: string): string {
  const s = (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'plugin';
}

/** Ensure a slug is unique against a list of existing ids (appends -2, -3, …). */
export function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// ─── Param key validation ────────────────────────────────────────────────────

const PARAM_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function isValidParamKey(key: string): boolean {
  return PARAM_KEY_RE.test(key);
}

/** Returns null when valid, otherwise an error message key (i18n). */
export function validatePluginDef(def: PluginBlockDef): string | null {
  if (!def.name?.trim()) return 'validationNameRequired';
  const seen = new Set<string>();
  for (const p of def.params) {
    if (!isValidParamKey(p.key)) return 'validationKeyInvalid';
    if (seen.has(p.key)) return 'validationKeyDuplicate';
    seen.add(p.key);
  }
  return null;
}

// ─── Default value per kind ──────────────────────────────────────────────────

export function defaultForKind(kind: PluginParamKind): string {
  switch (kind) {
    case 'number': return '0';
    case 'bool':   return 'false';
    default:       return '';
  }
}

// ─── Emit SugarCube literal from a param value ───────────────────────────────

/**
 * Build the right-hand side of `<<set _key to ...>>` for a plugin parameter.
 * Rules per kind:
 *   - number → numeric literal (fallback 0)
 *   - bool   → true / false
 *   - color, text → JSON.stringify (quoted string)
 *   - scene  → resolve through idToName if looks like a UUID, then JSON.stringify
 */
export function pluginValueLiteral(
  param: PluginParam,
  rawValue: string | undefined,
  idToName?: Map<string, string>,
): string {
  const value = rawValue ?? param.default ?? '';
  switch (param.kind) {
    case 'number': {
      const trimmed = value.trim();
      if (trimmed.startsWith('$') || trimmed.startsWith('_')) return trimmed;
      const n = Number(trimmed);
      return Number.isFinite(n) ? String(n) : '0';
    }
    case 'bool':
      return value === 'true' ? 'true' : 'false';
    case 'text': {
      const trimmed = value.trim();
      if (trimmed.startsWith('$') || trimmed.startsWith('_')) return trimmed;
      return JSON.stringify(value);
    }
    case 'array':
    case 'datetime':
    case 'object': {
      const trimmed = value.trim();
      if (!trimmed) return '""';
      if (trimmed.startsWith('$') || trimmed.startsWith('_')) return trimmed;
      return JSON.stringify(trimmed);
    }
    case 'scene': {
      const resolved = idToName?.get(value) ?? value;
      return JSON.stringify(resolved);
    }
  }
}

// ─── Recursively collect plugin-ids used in a block tree ─────────────────────

export function collectPluginIds(blocks: Block[], out: Set<string> = new Set()): Set<string> {
  for (const b of blocks) {
    if (b.type === 'plugin') {
      out.add(b.pluginId);
    } else if (b.type === 'condition') {
      for (const branch of b.branches) collectPluginIds(branch.blocks, out);
    } else if (b.type === 'dialogue' && b.innerBlocks?.length) {
      collectPluginIds(b.innerBlocks, out);
    } else if (b.type === 'tabs') {
      for (const tab of b.tabs) collectPluginIds(tab.blocks, out);
    } else if (b.type === 'section') {
      collectPluginIds(b.blocks, out);
    } else if (b.type === 'table') {
      for (const row of b.rows) for (const cell of row.cells) collectPluginIds(cell.blocks, out);
    }
  }
  return out;
}

/** Expand used plugin ids recursively through plugin bodies. */
export function expandPluginDeps(
  roots: Iterable<string>,
  getDef: (id: string) => PluginBlockDef | undefined,
  maxDepth = 32,
): string[] {
  const out = new Set<string>();
  const stack: { id: string; depth: number }[] = [];
  for (const id of roots) stack.push({ id, depth: 0 });

  while (stack.length) {
    const { id, depth } = stack.pop()!;
    if (out.has(id)) continue;
    if (depth > maxDepth) continue;
    const def = getDef(id);
    if (!def) continue;
    out.add(id);
    const inner = collectPluginIds(def.blocks);
    for (const childId of inner) {
      if (!out.has(childId)) stack.push({ id: childId, depth: depth + 1 });
    }
  }
  return [...out];
}

// ─── Param factory ───────────────────────────────────────────────────────────

export function makePluginParam(kind: PluginParamKind = 'text'): PluginParam {
  return {
    key: '',
    label: '',
    kind,
    default: defaultForKind(kind),
  };
}

/** Create a new plugin definition with sensible defaults. */
export function makePluginDef(id: string, name: string): PluginBlockDef {
  return {
    id,
    name,
    color: '#6366f1',
    icon: '🧩',
    description: '',
    version: '1.0.0',
    params: [],
    blocks: [],
  };
}
