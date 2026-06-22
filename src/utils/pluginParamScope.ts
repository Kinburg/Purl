import type {
  PluginParam, PluginParamKind, VariableTreeNode, VariableType, VariableGroup,
} from '../types';

// ─── Param id / marker helpers ───────────────────────────────────────────────
//
// Inside the plugin body editor, plugin parameters are surfaced as *virtual*
// variables so existing block editors (which bind to a variableId) can target
// them without changes. Their ids use the `param:` prefix so we can distinguish
// them from real variable UUIDs at export time.
//
// When the plugin body is emitted, each virtual param is given a temporary
// path marker (`PARAM_PATH_MARKER(key)`). After the passage body is built as
// SugarCube text, a post-processing pass rewrites those markers into either
// `_<key>` (TwineScript temp-var form) or `State.temporary["<key>"]` (JS form).

const PARAM_ID_PREFIX = 'param:';

/** Unique prefix used when emitting a variable path for a plugin param.
 *  Must contain only [A-Za-z_0-9] so both `$...` and `State.variables["..."]`
 *  emissions remain syntactically valid before we post-process them. */
const PARAM_PATH_MARKER_PREFIX = '__tgParam__';

export function isParamId(id: string | undefined | null): boolean {
  return !!id && id.startsWith(PARAM_ID_PREFIX);
}

function paramIdFromKey(key: string): string {
  return PARAM_ID_PREFIX + key;
}

function paramPathMarker(key: string): string {
  return PARAM_PATH_MARKER_PREFIX + key;
}

function varTypeFromParamKind(kind: PluginParamKind): VariableType {
  switch (kind) {
    case 'number':   return 'number';
    case 'bool':     return 'boolean';
    case 'array':    return 'array';
    case 'datetime': return 'datetime';
    default:         return 'string';
  }
}

// ─── Object-param group cloning ──────────────────────────────────────────────

/** Recursively find a group node by id anywhere in the tree. */
function findGroupById(id: string, nodes: VariableTreeNode[]): VariableGroup | null {
  for (const n of nodes) {
    if (n.kind === 'group') {
      if (n.id === id) return n;
      const found = findGroupById(id, n.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Recursively clone a real group's children as virtual param nodes.
 * Each cloned node gets an id of `param:<paramKey><dotPath>` where dotPath is
 * the dot-separated path from the root object param, e.g. `param:t.address.city`.
 * Node names stay the same as in the real group so `getVariablePath` builds
 * the correct nested paths.
 *
 * @param paramKey  plugin param key, e.g. `'t'`
 * @param children  real group's immediate children
 * @param pathSoFar accumulated dot-prefix, e.g. `''` at top level, `'.address'` when nested
 */
function cloneChildrenForParam(
  paramKey: string,
  children: VariableTreeNode[],
  pathSoFar: string,
): VariableTreeNode[] {
  const out: VariableTreeNode[] = [];
  for (const child of children) {
    const childPath = `${pathSoFar}.${child.name}`;
    if (child.kind === 'variable') {
      out.push({
        kind: 'variable',
        id: paramIdFromKey(paramKey + childPath),
        name: child.name,
        varType: child.varType,
        defaultValue: child.defaultValue,
        description: child.description,
      });
    } else {
      out.push({
        kind: 'group',
        id: paramIdFromKey(paramKey + childPath),
        name: child.name,
        children: cloneChildrenForParam(paramKey, child.children, childPath),
      });
    }
  }
  return out;
}

/**
 * Build a virtual variable tree from plugin params. Kinds that carry a
 * standalone value (text/number/bool/array/datetime/object) are included.
 * `variable` and `scene` are excluded — they reference other entities.
 *
 * For `object` params with a `typeGroupId`, a virtual GROUP node is created
 * whose children mirror the real project group — giving the plugin body editor
 * navigable `_param.field` access instead of a flat opaque string.
 *
 * @param params        plugin params to convert
 * @param projectNodes  project variable tree; required to resolve `typeGroupId` for object params
 * @param useMarkerNames  when true, the top-level param node's `name` is the path-marker
 *                        string (`__tgParam__key`) used during export; when false (editor default)
 *                        the name is the plain param key for display
 */
export function paramsToVirtualNodes(
  params: PluginParam[],
  projectNodes?: VariableTreeNode[],
  useMarkerNames = false,
): VariableTreeNode[] {
  const out: VariableTreeNode[] = [];
  for (const p of params) {
    if (!p.key) continue;
    const include = p.kind === 'text' || p.kind === 'number' || p.kind === 'bool'
      || p.kind === 'array' || p.kind === 'datetime' || p.kind === 'object' || p.kind === 'scene';
    if (!include) continue;

    const nodeName = useMarkerNames ? paramPathMarker(p.key) : p.key;

    // Object param with an associated project group → expose children as navigable sub-vars
    if (p.kind === 'object' && p.typeGroupId && projectNodes) {
      const realGroup = findGroupById(p.typeGroupId, projectNodes);
      if (realGroup) {
        out.push({
          kind: 'group',
          id: paramIdFromKey(p.key),
          name: nodeName,
          children: cloneChildrenForParam(p.key, realGroup.children, ''),
        });
        continue;
      }
    }

    // Flat variable node (all other kinds, or object without a linked group)
    out.push({
      kind: 'variable',
      id: paramIdFromKey(p.key),
      name: nodeName,
      varType: varTypeFromParamKind(p.kind),
      defaultValue: p.default ?? '',
      description: p.label || '',
    });
  }
  return out;
}

/**
 * Rewrite the SugarCube markup of a plugin-body passage so virtual param
 * path markers become temp-var references:
 *   $__tgParam__key              →  _key
 *   State.variables["__tgParam__key"]  →  State.temporary["key"]
 *   State.variables.__tgParam__key     →  State.temporary.key
 */
export function rewriteParamRefs(source: string): string {
  return source
    .replace(/State\.variables\[\s*["']__tgParam__([A-Za-z_][A-Za-z0-9_]*)["']\s*]/g, 'State.temporary["$1"]')
    .replace(/State\.variables\.__tgParam__([A-Za-z_][A-Za-z0-9_]*)/g, 'State.temporary.$1')
    .replace(/\$__tgParam__([A-Za-z_][A-Za-z0-9_]*)/g, '_$1');
}
