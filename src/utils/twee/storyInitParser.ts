import type { Variable, VariableGroup, VariableTreeNode, VariableType } from '../../types';

function uid(): string { return crypto.randomUUID(); }

export interface StoryInitResult {
  nodes: VariableTreeNode[];
  warnings: string[];
  unparsedCount: number;
}

interface SetEntry {
  path: string[];     // e.g. ['gold'] or ['chars','hero','hp']
  rhs: string;
}

function makeVar(name: string, varType: VariableType, defaultValue: string, isExpression?: boolean): Variable {
  const v: Variable = { kind: 'variable', id: uid(), name, varType, defaultValue, description: '' };
  if (isExpression) v.isExpression = true;
  return v;
}

function makeGroup(name: string, children: VariableTreeNode[] = []): VariableGroup {
  return { kind: 'group', id: uid(), name, children };
}

// Pull every <<set EXPR>> body out of the passage text.
function extractSetMacros(text: string): string[] {
  const out: string[] = [];
  const re = /<<set\s+([\s\S]*?)>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

// Parse one <<set>> body: "$path to RHS" or "$path = RHS".
// Returns null if it doesn't match a single-LHS form.
function parseSetExpression(expr: string): SetEntry | null {
  const re = /^\$([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s+(?:to|=)\s+([\s\S]+)$/;
  const m = re.exec(expr.trim());
  if (!m) return null;
  return { path: m[1].split('.'), rhs: m[2].trim() };
}

// Sandboxed evaluation of a JS literal expression. Returns undefined on failure.
function safeEval(expr: string): unknown {
  try {
     
    const fn = new Function('"use strict"; return (' + expr + ');');
    return fn();
  } catch {
    return undefined;
  }
}

function inferType(value: unknown): VariableType | null {
  if (typeof value === 'number')  return 'number';
  if (typeof value === 'string')  return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value))       return 'array';
  return null;
}

function defaultLiteral(value: unknown, type: VariableType): string {
  if (type === 'array') return JSON.stringify(value);
  return String(value);
}

/**
 * Heuristic: does this RHS look like a SC expression worth preserving as a
 * raw string + isExpression flag? Covers function calls (`random(...)`,
 * `either(...)`, `Math.*`), arithmetic (`40+random(...)`), and string concat
 * (`"hi " + $name`). Anything that gets a real "computation" feel.
 */
function looksLikeExpression(rhs: string): boolean {
  if (!rhs.trim()) return false;
  const hasMathOp   = /[+\-*/%]/.test(rhs);
  const hasFuncCall = /[A-Za-z_$][\w$.]*\s*\(/.test(rhs);
  const hasVarRef   = /\$[A-Za-z_$]/.test(rhs);
  return hasMathOp || hasFuncCall || hasVarRef;
}

/** Infer the variable type from an expression RHS that didn't safeEval. */
function inferExprType(rhs: string): VariableType {
  // If it contains string literals → result is probably a string.
  if (/['"`]/.test(rhs)) return 'string';
  // Otherwise assume numeric (random, math, $other refs, etc.).
  return 'number';
}

// Insert a leaf variable at a nested path inside `nodes`, creating groups along the way.
function insertAt(nodes: VariableTreeNode[], groupPath: string[], variable: Variable): VariableTreeNode[] {
  if (groupPath.length === 0) {
    const idx = nodes.findIndex(n => n.name === variable.name);
    if (idx >= 0) return nodes.map((n, i) => i === idx ? variable : n);
    return [...nodes, variable];
  }
  const [head, ...rest] = groupPath;
  const idx = nodes.findIndex(n => n.kind === 'group' && n.name === head);
  if (idx >= 0) {
    const group = nodes[idx] as VariableGroup;
    return nodes.map((n, i) => i === idx
      ? { ...group, children: insertAt(group.children, rest, variable) }
      : n,
    );
  }
  return [...nodes, makeGroup(head, insertAt([], rest, variable))];
}

// Expand a JS object literal into a VariableGroup tree.
function objectToGroup(name: string, value: Record<string, unknown>): VariableGroup {
  const children: VariableTreeNode[] = [];
  for (const [k, v] of Object.entries(value)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      children.push(objectToGroup(k, v as Record<string, unknown>));
    } else {
      const t = inferType(v) ?? 'string';
      const def = v == null ? '' : defaultLiteral(v, t);
      children.push(makeVar(k, t, def));
    }
  }
  return makeGroup(name, children);
}

export function parseStoryInit(text: string): StoryInitResult {
  const macros = extractSetMacros(text);
  let nodes: VariableTreeNode[] = [];
  const warnings: string[] = [];
  let unparsedCount = 0;

  for (const macro of macros) {
    const parsed = parseSetExpression(macro);
    if (!parsed) {
      warnings.push(`<<set ${macro}>> — couldn't parse, skipped`);
      unparsedCount++;
      continue;
    }
    const { path, rhs } = parsed;
    const value = safeEval(rhs);

    // Root-level object literal → expand into a VariableGroup tree.
    if (path.length === 1 && value !== undefined && value !== null
        && typeof value === 'object' && !Array.isArray(value)) {
      const group = objectToGroup(path[0], value as Record<string, unknown>);
      const idx = nodes.findIndex(n => n.name === path[0]);
      nodes = idx >= 0
        ? nodes.map((n, i) => i === idx ? group : n)
        : [...nodes, group];
      continue;
    }

    // Otherwise: treat as a leaf variable.
    const leafName  = path[path.length - 1];
    const groupPath = path.slice(0, -1);

    let varType: VariableType;
    let def: string;
    let isExpr = false;
    if (value === undefined) {
      // RHS couldn't eval — usually SC helpers (`random`, `either`, `Math.*`)
      // or `$other` refs. If it LOOKS like an expression, preserve it verbatim
      // with isExpression=true so the exporter emits it unquoted.
      if (looksLikeExpression(rhs)) {
        varType = inferExprType(rhs);
        def     = rhs;
        isExpr  = true;
        warnings.push(`<<set $${path.join('.')} to ${rhs}>> — kept as expression`);
      } else {
        varType = 'string';
        def     = rhs;
        warnings.push(`<<set $${path.join('.')} to ${rhs}>> — couldn't evaluate, stored as string`);
        unparsedCount++;
      }
    } else if (value === null) {
      varType = 'string';
      def     = '';
    } else {
      const t = inferType(value);
      if (t === null) {
        varType = 'string';
        def     = rhs;
      } else {
        varType = t;
        def     = defaultLiteral(value, t);
      }
    }
    nodes = insertAt(nodes, groupPath, makeVar(leafName, varType, def, isExpr));
  }

  return { nodes, warnings, unparsedCount };
}
