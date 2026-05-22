/**
 * Build typed Purl blocks from a tokenized passage body.
 *
 * Strategy: walk the token stream, try each recognizer in turn, fall back
 * to aggregating tokens into a TextBlock (for inline / unknown content)
 * or a RawBlock (for unknown paired macros we can't safely inline).
 *
 * A passage-level pre-pass also pulls trailing `[[link]]` runs out as a
 * ChoiceBlock at the very end.
 */

import type {
  Block, TextBlock, ChoiceBlock, ChoiceOption, RawBlock,
  VariableSetBlock, LinkBlock, ImageBlock, VideoBlock,
  ConditionBlock, ConditionBranch, ConditionOperator,
  InputFieldBlock,
  SetObjectBlock, SetObjectEntry,
  ForBlock,
  ButtonStyle,
  Variable, VariableGroup, VariableTreeNode, VariableType, VarOperator,
} from '../../types';
import { tokenize, type Token, stringifyToken } from '../tweeTokenizer';

function uid(): string { return crypto.randomUUID(); }

// ─── Public surface ──────────────────────────────────────────────────────────

export interface BuildContext {
  /** Mutable: recognizers may append auto-created variables. */
  variableNodes: VariableTreeNode[];
  /** Maps dotted path (`gold`, `chars.hero.hp`) → variable id, for cross-references. */
  varPathToId: Map<string, string>;
  /** Block-builder warnings — surfaced in the import summary. */
  warnings: string[];
  /** Tally of recognized block kinds, keyed by block.type. */
  recognized: Map<string, number>;
}

export function createBuildContext(initialNodes: VariableTreeNode[]): BuildContext {
  const map = new Map<string, string>();
  buildVarPathMap(initialNodes, [], map);
  return {
    variableNodes: initialNodes,
    varPathToId: map,
    warnings: [],
    recognized: new Map(),
  };
}

/** Tokenize a passage body and convert it into typed Purl blocks. */
export function passageBodyToBlocks(body: string, ctx: BuildContext): Block[] {
  if (!body.trim()) return [];
  const tokens = tokenize(body);
  return buildBlocks(tokens, ctx);
}

// ─── Variable registry helpers ───────────────────────────────────────────────

function buildVarPathMap(nodes: VariableTreeNode[], prefix: string[], out: Map<string, string>): void {
  for (const n of nodes) {
    const path = [...prefix, n.name];
    if (n.kind === 'variable') {
      out.set(path.join('.'), n.id);
    } else {
      buildVarPathMap(n.children, path, out);
    }
  }
}

/**
 * Find an existing variable by dotted path, or create one (with groups as needed)
 * and return its id. Newly created variables default to type `'string'`, `defaultValue=''`.
 */
export function ensureVariable(
  path: string[],
  ctx: BuildContext,
  inferredType: VariableType = 'string',
  inferredDefault: string = '',
): string {
  const key = path.join('.');
  const existing = ctx.varPathToId.get(key);
  if (existing) return existing;

  // Insert into variableNodes — create groups along the way.
  const leafName = path[path.length - 1];
  const groupPath = path.slice(0, -1);
  const newVar: Variable = {
    kind: 'variable',
    id: uid(),
    name: leafName,
    varType: inferredType,
    defaultValue: inferredDefault,
    description: '',
  };
  ctx.variableNodes = insertVar(ctx.variableNodes, groupPath, newVar);
  ctx.varPathToId.set(key, newVar.id);
  ctx.warnings.push(`Auto-created variable $${key} (inferred ${inferredType})`);
  return newVar.id;
}

function insertVar(nodes: VariableTreeNode[], groupPath: string[], variable: Variable): VariableTreeNode[] {
  if (groupPath.length === 0) {
    const idx = nodes.findIndex(n => n.name === variable.name);
    if (idx >= 0) return nodes; // already exists; caller should have found it via the map
    return [...nodes, variable];
  }
  const [head, ...rest] = groupPath;
  const idx = nodes.findIndex(n => n.kind === 'group' && n.name === head);
  if (idx >= 0) {
    const g = nodes[idx] as VariableGroup;
    return nodes.map((n, i) => i === idx
      ? { ...g, children: insertVar(g.children, rest, variable) }
      : n,
    );
  }
  const newGroup: VariableGroup = { kind: 'group', id: uid(), name: head, children: insertVar([], rest, variable) };
  return [...nodes, newGroup];
}

// ─── Literal eval helpers ────────────────────────────────────────────────────

function safeEval(expr: string): unknown {
  try {
     
    return new Function('"use strict"; return (' + expr + ');')();
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

function literalDefault(value: unknown, type: VariableType): string {
  if (type === 'array')  return JSON.stringify(value);
  return String(value);
}

/** Convert a JS object into an array of SetObjectEntry, recursing into nested objects. */
function objectToSetEntries(obj: Record<string, unknown>): SetObjectEntry[] {
  return Object.entries(obj).map(([k, v]): SetObjectEntry => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return {
        id: uid(),
        key: k,
        valueType: 'object',
        entries: objectToSetEntries(v as Record<string, unknown>),
      };
    }
    if (Array.isArray(v)) {
      return { id: uid(), key: k, valueType: 'array', value: JSON.stringify(v) };
    }
    if (typeof v === 'number')  return { id: uid(), key: k, valueType: 'number',  value: String(v) };
    if (typeof v === 'boolean') return { id: uid(), key: k, valueType: 'boolean', value: v ? 'true' : 'false' };
    return { id: uid(), key: k, valueType: 'string', value: v == null ? '' : String(v) };
  });
}

// ─── Block-level macro classification ────────────────────────────────────────

/**
 * Void macros that conceptually own a visual / structural slot in the passage
 * (as opposed to inline output / control-flow macros like `<<print>>`,
 * `<<run>>`, `<<goto>>` that belong inside a TextBlock). When a recognizer
 * fails on one of these, we still want a dedicated block rather than burying
 * it in surrounding text.
 */
const BLOCK_LEVEL_VOID_MACROS = new Set([
  'set', 'unset',
  'include', 'display',
  'textbox', 'numberbox', 'radiobutton', 'checkbox', 'listbox', 'cycle',
  'audio', 'cacheaudio', 'createaudiogroup', 'createplaylist',
  'masteraudio', 'playlist', 'removeaudiogroup', 'removeplaylist', 'waitforaudio',
]);

function isBlockLevelMacro(tok: Token): boolean {
  if (tok.kind !== 'macro') return false;
  if (tok.body !== undefined)     return true;   // any paired macro (incl. <<for>>, <<switch>>, …)
  if (tok.branches !== undefined) return true;   // <<if>> we couldn't classify
  return BLOCK_LEVEL_VOID_MACROS.has(tok.name);
}

// ─── Token walker / dispatcher ───────────────────────────────────────────────

function buildBlocks(tokens: Token[], ctx: BuildContext): Block[] {
  const blocks: Block[] = [];
  let textBuf = '';

  const tallyRecognized = (type: string) => {
    ctx.recognized.set(type, (ctx.recognized.get(type) ?? 0) + 1);
  };

  const flushText = () => {
    const trimmed = textBuf.trim();
    if (trimmed) {
      const tb: TextBlock = { id: uid(), type: 'text', content: trimmed };
      blocks.push(tb);
      tallyRecognized('text');
    }
    textBuf = '';
  };

  // Pre-pass: pull trailing `[[link]]` run (with only whitespace between) into a ChoiceBlock.
  const trailingStart = findTrailingChoiceStart(tokens);
  const mainEnd = trailingStart ?? tokens.length;

  let i = 0;
  while (i < mainEnd) {
    const tok = tokens[i];
    const result = recognizeBlockAt(tokens, i, ctx);
    if (result) {
      flushText();
      blocks.push(result.block);
      tallyRecognized(result.block.type);
      i = result.next;
      continue;
    }
    // Block-level macro we couldn't classify → standalone RawBlock so it
    // doesn't get buried inside surrounding text. Covers:
    //   - any paired macro (has tok.body)
    //   - any <<if>> we couldn't parse (has tok.branches)
    //   - known block-level void macros (<<set $obj = {...}>>, <<include>>, etc.)
    if (isBlockLevelMacro(tok)) {
      flushText();
      const raw: RawBlock = { id: uid(), type: 'raw', code: stringifyToken(tok) };
      blocks.push(raw);
      tallyRecognized('raw');
      i++;
      continue;
    }
    // Default: inline into the text buffer (<<print>>, <<run>>, <<goto>>, …)
    textBuf += stringifyToken(tok);
    i++;
  }
  flushText();

  if (trailingStart !== null) {
    const choice = buildTrailingChoice(tokens.slice(trailingStart));
    if (choice) {
      blocks.push(choice);
      tallyRecognized('choice');
    }
  }

  return blocks;
}

/** Returns the index of the first token in the trailing run of `link` tokens, or null. */
function findTrailingChoiceStart(tokens: Token[]): number | null {
  let i = tokens.length - 1;
  // Skip trailing whitespace-only text
  while (i >= 0 && isWhitespaceText(tokens[i])) i--;
  if (i < 0 || tokens[i].kind !== 'link') return null;
  let lastLinkIdx = i;
  // Walk back past consecutive link / whitespace-text pairs
  while (i >= 0) {
    const t = tokens[i];
    if (t.kind === 'link') { lastLinkIdx = i; i--; continue; }
    if (isWhitespaceText(t)) { i--; continue; }
    break;
  }
  return lastLinkIdx;
}

function buildTrailingChoice(tokens: Token[]): ChoiceBlock | null {
  const options: ChoiceOption[] = [];
  for (const t of tokens) {
    if (t.kind !== 'link') continue;
    options.push({
      id: uid(),
      label: t.label,
      targetSceneId: t.target,   // scene NAME — migrateSceneLinks turns it into the id
      condition: '',
    });
  }
  if (options.length === 0) return null;
  return { id: uid(), type: 'choice', options };
}

function isWhitespaceText(t: Token): boolean {
  return t.kind === 'text' && t.content.trim() === '';
}

// ─── Recognizers ─────────────────────────────────────────────────────────────

function recognizeBlockAt(tokens: Token[], i: number, ctx: BuildContext): { block: Block; next: number } | null {
  const tok = tokens[i];

  if (tok.kind === 'html' && tok.selfClosing) {
    if (tok.tag === 'img' && tok.attrs.src) {
      return { block: makeImageBlock(tok), next: i + 1 };
    }
    if (tok.tag === 'video' && tok.attrs.src) {
      return { block: makeVideoBlock(tok), next: i + 1 };
    }
  }

  if (tok.kind === 'macro') {
    if (tok.name === 'set') {
      const blk = makeSetBlock(tok, ctx);
      if (blk) return { block: blk, next: i + 1 };
    }
    if (tok.name === 'link' && tok.body !== undefined) {
      const blk = makeLinkBlock(tok, ctx);
      if (blk) return { block: blk, next: i + 1 };
    }
    if (tok.name === 'if' && tok.branches) {
      const blk = makeConditionBlock(tok, ctx);
      if (blk) return { block: blk, next: i + 1 };
    }
    if (tok.name === 'textbox' || tok.name === 'numberbox') {
      const blk = makeInputFieldBlock(tok, ctx);
      if (blk) return { block: blk, next: i + 1 };
    }
    if (tok.name === 'for' && tok.body !== undefined) {
      const blk = makeForBlock(tok, ctx);
      if (blk) return { block: blk, next: i + 1 };
    }
  }

  return null;
}

// ─── ForBlock from <<for>>...<</for>> ────────────────────────────────────────

/**
 * Detects the SC `<<for>>` form from its args and emits a structured ForBlock.
 *  - `<<for [_k, ]_v range EXPR>>` → range mode
 *  - `<<for INIT; COND; STEP>>`    → c-style
 *  - `<<for EXPR>>` (single, no semicolons, no `range`) → while
 */
function makeForBlock(tok: Token & { kind: 'macro' }, ctx: BuildContext): ForBlock | null {
  const args = tok.args.trim();
  if (!args) return null;
  const innerBlocks = buildBlocks(tok.body ?? [], ctx);

  // Range form: split outside of brackets/strings to be safe with $arr[idx] or "a range b" strings.
  const rangeMatch = /^([^]*?)\s+range\s+([^]*)$/.exec(args);
  if (rangeMatch) {
    const vars = rangeMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    const source = rangeMatch[2].trim();
    const block: ForBlock = {
      id: uid(),
      type: 'for',
      mode: 'range',
      source,
      blocks: innerBlocks,
    };
    if (vars.length === 1) {
      block.valueVar = vars[0];
    } else if (vars.length === 2) {
      block.keyVar = vars[0];
      block.valueVar = vars[1];
    } else {
      // Malformed — keep raw fallback by returning null (dispatcher emits RawBlock).
      return null;
    }
    return block;
  }

  // C-style: top-level semicolons. Split respecting strings.
  const cstyleParts = splitTopLevelSemis(args);
  if (cstyleParts.length === 3) {
    return {
      id: uid(),
      type: 'for',
      mode: 'cstyle',
      initExpr:        cstyleParts[0].trim(),
      cstyleCondition: cstyleParts[1].trim(),
      stepExpr:        cstyleParts[2].trim(),
      blocks: innerBlocks,
    };
  }

  // Otherwise: while-loop. Whole args = condition expression.
  return {
    id: uid(),
    type: 'for',
    mode: 'while',
    whileCondition: args,
    blocks: innerBlocks,
  };
}

function splitTopLevelSemis(s: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote: string | null = null;
  let depth = 0;   // tracks (), [], {}
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (c === ';' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

// ─── ImageBlock / VideoBlock from <img>/<video> ─────────────────────────────

function makeImageBlock(tok: Token & { kind: 'html' }): ImageBlock {
  const src   = tok.attrs.src ?? '';
  const alt   = tok.attrs.alt ?? '';
  const wRaw  = tok.attrs.width ?? '';
  const width = /^\d+$/.test(wRaw) ? parseInt(wRaw, 10) : 0;
  return { id: uid(), type: 'image', mode: 'static', src, alt, width };
}

function makeVideoBlock(tok: Token & { kind: 'html' }): VideoBlock {
  const src      = tok.attrs.src ?? '';
  const wRaw     = tok.attrs.width ?? '';
  const width    = /^\d+$/.test(wRaw) ? parseInt(wRaw, 10) : 0;
  const autoplay = 'autoplay' in tok.attrs;
  const loop     = 'loop' in tok.attrs;
  const controls = 'controls' in tok.attrs;
  return { id: uid(), type: 'video', src, autoplay, loop, controls, width };
}

// ─── VariableSetBlock from <<set>> ───────────────────────────────────────────

/**
 * Recognizes:
 *   <<set $path to LITERAL>>            → '='
 *   <<set $path = LITERAL>>             → '='
 *   <<set $path += LITERAL>>            → '+='
 *   <<set $path -= LITERAL>>            → '-='
 *   <<set $path *= LITERAL>>            → '*='
 *   <<set $path /= LITERAL>>            → '/='
 *   <<set $path to $path + LITERAL>>    → '+=' (and minus / times / divide variants)
 *
 * Whitespace around the operator is optional (so `$x+=1` works too).
 * Anything else returns null (caller falls back to RawBlock).
 */
function makeSetBlock(tok: Token & { kind: 'macro' }, ctx: BuildContext): VariableSetBlock | SetObjectBlock | null {
  const m = /^\$([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(\+=|-=|\*=|\/=|to|=)\s*([\s\S]+)$/.exec(tok.args);
  if (!m) return null;

  const path    = m[1].split('.');
  const opStr   = m[2];
  const rhs     = m[3].trim();
  const pathKey = m[1];

  // Direct compound form: $x += N
  if (opStr === '+=' || opStr === '-=' || opStr === '*=' || opStr === '/=') {
    const operandVal = safeEval(rhs);
    if (typeof operandVal !== 'number') return null;
    const varId = ensureVariable(path, ctx, 'number', '0');
    return {
      id: uid(),
      type: 'variable-set',
      variableId: varId,
      operator: opStr as VarOperator,
      value: String(operandVal),
      valueMode: 'manual',
    };
  }

  // Indirect compound: $x to $x + N
  const compound = new RegExp(`^\\$${escapeRe(pathKey)}\\s*([+\\-*/])\\s*([\\s\\S]+)$`).exec(rhs);
  if (compound) {
    const op = compound[1];
    const operandVal = safeEval(compound[2].trim());
    if (typeof operandVal !== 'number') return null;
    const varOp: VarOperator = op === '+' ? '+=' : op === '-' ? '-=' : op === '*' ? '*=' : '/=';
    const varId = ensureVariable(path, ctx, 'number', '0');
    return {
      id: uid(),
      type: 'variable-set',
      variableId: varId,
      operator: varOp,
      value: String(operandVal),
      valueMode: 'manual',
    };
  }

  // Plain literal assignment: $x to LITERAL  /  $x = LITERAL
  const value = safeEval(rhs);
  if (value !== undefined) {
    // Plain object → SetObjectBlock (structured editor)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const entries = objectToSetEntries(value as Record<string, unknown>);
      const varId = ensureVariable(path, ctx, 'string', JSON.stringify(value));
      return {
        id: uid(),
        type: 'set-object',
        variableId: varId,
        entries,
      };
    }

    const t = inferType(value);
    if (t === null) return null;
    const storedValue = t === 'string' ? (value as string) : literalDefault(value, t);
    const varId = ensureVariable(path, ctx, t, storedValue);
    return {
      id: uid(),
      type: 'variable-set',
      variableId: varId,
      operator: '=',
      value: storedValue,
      valueMode: 'manual',
    };
  }

  // Literal eval failed (RHS contains $var refs, parens, math, etc.).
  // If the RHS looks like a safe numeric expression (only $vars, numbers and
  // arithmetic operators — no string concat, no function calls), emit
  // valueMode='expression' so the export rebuilds the same SC expression.
  if (isSafeNumericExpression(rhs)) {
    const varId = ensureVariable(path, ctx, 'number', '0');
    return {
      id: uid(),
      type: 'variable-set',
      variableId: varId,
      operator: '=',
      value: '',
      valueMode: 'expression',
      expression: rhs,
    };
  }

  return null;
}

/**
 * Returns true when `rhs` is composed entirely of `$identifier` references,
 * numeric literals, math operators (`+ - * / %`), parentheses and whitespace.
 * Rejects string literals, bare-identifier function calls (`Math.floor(...)`),
 * etc. — anything that wouldn't fit Purl's numeric `expression` valueMode.
 */
function isSafeNumericExpression(rhs: string): boolean {
  if (!rhs.trim()) return false;
  if (/['"`]/.test(rhs)) return false;
  // Tokens allowed:
  //   - $identifier(.path)*           — SC variables
  //   - bare/dotted identifier        — SC helpers (`random`, `either`, `Math.floor`)
  //   - number literal
  //   - math op (+ - * / %)
  //   - paren, comma                  — for function calls
  //   - whitespace
  const tokenRe = /(\$[A-Za-z_$][\w$.]*|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|[0-9]+(?:\.[0-9]+)?|[+\-*/%(),]|\s+)/g;
  const tokens = rhs.match(tokenRe);
  if (!tokens) return false;
  return tokens.join('') === rhs;
}

// ─── LinkBlock from <<link>> ─────────────────────────────────────────────────

const DEFAULT_BTN_STYLE: ButtonStyle = {
  bgColor: '#3b82f6',
  textColor: '#ffffff',
  borderColor: '#3b82f6',
  borderRadius: 6,
  paddingV: 6,
  paddingH: 12,
  fontSize: 10,
  bold: false,
  fullWidth: false,
};

/**
 * Recognizes:
 *   <<link "Label" "Target">><</link>>
 *   <<link "Label">><<goto "Target">><</link>>
 *   <<link "Back">><<run Engine.backward()>><</link>>
 *   <<link "Label" `Target`>><</link>>   (we tolerate backticks)
 *
 * Returns null when args / body don't match a known shape.
 */
function makeLinkBlock(tok: Token & { kind: 'macro' }, _ctx: BuildContext): LinkBlock | null {
  const args = parseStringArgs(tok.args);
  if (args.length < 1) return null;
  const label = args[0];
  let targetSceneId: string | undefined;
  let target: 'scene' | 'back' = 'scene';

  if (args.length >= 2) {
    // Inline target form
    targetSceneId = args[1];
  } else {
    // Look inside the body for <<goto "...">> or Engine.backward
    const body = tok.body ?? [];
    for (const inner of body) {
      if (inner.kind === 'macro' && inner.name === 'goto') {
        const innerArgs = parseStringArgs(inner.args);
        if (innerArgs[0]) targetSceneId = innerArgs[0];
        break;
      }
      if (inner.kind === 'macro' && inner.name === 'run' && /Engine\.backward/.test(inner.args)) {
        target = 'back';
        break;
      }
    }
  }

  if (target === 'scene' && !targetSceneId) return null;

  return {
    id: uid(),
    type: 'link',
    label,
    target,
    ...(target === 'scene' ? { targetSceneId } : {}),
    actions: [],
    style: { ...DEFAULT_BTN_STYLE },
  };
}

/** Pull out double-quoted string arguments from a macro arg string. */
function parseStringArgs(args: string): string[] {
  const out: string[] = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(args)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return out;
}

// ─── ConditionBlock from <<if>>/<<elseif>>/<<else>>/<</if>> ──────────────────

const COND_OPS: ConditionOperator[] = ['==', '!=', '>=', '<=', '>', '<'];

function makeConditionBlock(tok: Token & { kind: 'macro' }, ctx: BuildContext): ConditionBlock | null {
  if (!tok.branches) return null;

  // Special case: single-branch `<<if A and B [and C…]>>X<</if>>` where every
  // conjunct parses cleanly → rewrite as nested IFs. Only safe when there's
  // no elseif/else (those branches are semantically tied to the WHOLE compound
  // condition, not to each conjunct).
  if (tok.branches.length === 1 && tok.branches[0].type === 'if') {
    const conjuncts = splitTopLevelAnd(normalizeKeywordOps(tok.branches[0].condition));
    if (conjuncts && conjuncts.length >= 2) {
      const parsedConjuncts: ParsedCondition[] = [];
      let allOk = true;
      for (const c of conjuncts) {
        const p = parseCondition(c, ctx);
        if (!p) { allOk = false; break; }
        parsedConjuncts.push(p);
      }
      if (allOk) {
        return buildNestedConditionChain(parsedConjuncts, tok.branches[0].body, ctx);
      }
    }
  }

  const branches: ConditionBranch[] = [];
  for (const b of tok.branches) {
    const parsed = b.type === 'else' ? null : parseCondition(b.condition, ctx);
    const nestedBlocks = buildBlocks(b.body, ctx);
    if (b.type !== 'else' && !parsed) {
      // Unparseable condition (compound or, expression LHS, function call, …)
      // — keep the normalized expression as a raw escape-hatch so the IF chain
      // still ends up as a typed ConditionBlock and the body becomes typed too.
      branches.push({
        id: uid(),
        branchType: b.type,
        variableId: '',
        operator: '==',
        value: '',
        rawExpression: normalizeKeywordOps(b.condition).trim(),
        blocks: nestedBlocks,
      });
      continue;
    }
    branches.push({
      id: uid(),
      branchType: b.type,
      variableId: parsed?.variableId ?? '',
      operator: parsed?.operator ?? '==',
      value: parsed?.value ?? '',
      ...(parsed?.rangeMode
        ? { rangeMode: true, rangeMin: parsed.rangeMin, rangeMax: parsed.rangeMax }
        : {}),
      blocks: nestedBlocks,
    });
  }
  return { id: uid(), type: 'condition', branches };
}

/**
 * Split an expression by top-level `and` or `&&`, respecting quoted strings
 * (so `"Bread and butter"` doesn't split). Returns null when there's no
 * top-level conjunction.
 */
function splitTopLevelAnd(expr: string): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let quote: string | null = null;
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
    if (c === '&' && expr[i + 1] === '&') {
      parts.push(expr.slice(start, i));
      i += 2;
      start = i;
      continue;
    }
    if (/\s/.test(c)) {
      const ahead = expr.slice(i).match(/^\s+and\s+/);
      if (ahead) {
        parts.push(expr.slice(start, i));
        i += ahead[0].length;
        start = i;
        continue;
      }
    }
    i++;
  }
  parts.push(expr.slice(start));
  const trimmed = parts.map(p => p.trim()).filter(Boolean);
  return trimmed.length >= 2 ? trimmed : null;
}

function buildNestedConditionChain(parsed: ParsedCondition[], body: Token[], ctx: BuildContext): ConditionBlock {
  let inner: Block[] = buildBlocks(body, ctx);
  for (let i = parsed.length - 1; i >= 0; i--) {
    const p = parsed[i];
    const block: ConditionBlock = {
      id: uid(),
      type: 'condition',
      branches: [{
        id: uid(),
        branchType: 'if',
        variableId: p.variableId,
        operator: p.operator,
        value: p.value,
        ...(p.rangeMode ? { rangeMode: true, rangeMin: p.rangeMin, rangeMax: p.rangeMax } : {}),
        blocks: inner,
      }],
    };
    inner = [block];
  }
  return inner[0] as ConditionBlock;
}

interface ParsedCondition {
  variableId: string;
  operator: ConditionOperator;
  value: string;
  rangeMode?: boolean;
  rangeMin?: string;
  rangeMax?: string;
}

/**
 * Normalize SugarCube keyword operators to their JS equivalents so the simple
 * comparison regex can match. Note the order: longer aliases first (`isnot`
 * before `is`, `gte` before `gt`, etc.). `not` is also normalized to `!` so
 * `<<if not $flag>>` reaches the truthy-check fallback.
 */
function normalizeKeywordOps(s: string): string {
  return s
    .replace(/\bisnot\b/g, '!=')
    .replace(/\bis\b/g,    '==')
    .replace(/\bneq\b/g,   '!=')
    .replace(/\beq\b/g,    '==')
    .replace(/\bgte\b/g,   '>=')
    .replace(/\blte\b/g,   '<=')
    .replace(/\bgt\b/g,    '>')
    .replace(/\blt\b/g,    '<')
    .replace(/\bnot\s+/g,  '!');
}

function parseCondition(expr: string, ctx: BuildContext): ParsedCondition | null {
  const s = normalizeKeywordOps(expr).trim();
  if (!s) return null;

  // Range: $var >= a && $var <= b
  const rangeRe = /^\$([A-Za-z_$][\w$.]*)\s*>=\s*([^&]+?)\s*&&\s*\$([A-Za-z_$][\w$.]*)\s*<=\s*(.+?)$/;
  const rm = rangeRe.exec(s);
  if (rm && rm[1] === rm[3]) {
    const path = rm[1].split('.');
    const varId = ensureVariable(path, ctx, 'number');
    return {
      variableId: varId,
      operator: '>=',
      value: '',
      rangeMode: true,
      rangeMin: rm[2].trim(),
      rangeMax: rm[4].trim(),
    };
  }

  // Simple: $var OP literal-or-ref
  for (const op of COND_OPS) {
    const opEscaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^\\$([A-Za-z_$][\\w$.]*)\\s*${opEscaped}\\s*(.+)$`);
    const m = re.exec(s);
    if (m) {
      const path = m[1].split('.');
      const rhs = m[2].trim();
      const rhsVal = safeEval(rhs);
      if (rhsVal !== undefined) {
        const t = inferType(rhsVal);
        if (t === null) return null;
        const varId = ensureVariable(path, ctx, t);
        const valStr = t === 'string' ? String(rhsVal) : literalDefault(rhsVal, t);
        return { variableId: varId, operator: op, value: valStr };
      }
      // RHS didn't safeEval — accept it as a raw reference if it LOOKS like
      // one (`_tempVar` or `$other.path`). Export skips quoting for such
      // values so the SC expression rebuilds verbatim.
      if (/^[_$][A-Za-z_$][\w$.]*$/.test(rhs)) {
        const varId = ensureVariable(path, ctx, 'string');
        return { variableId: varId, operator: op, value: rhs };
      }
      return null;
    }
  }

  // Truthy / falsy boolean check: $path  or  !$path
  // Maps to operator '!='/'==' against literal 'false' — the standard SC convention.
  const truthyRe = /^(!?)\s*\$([A-Za-z_$][\w$.]*)$/;
  const tm = truthyRe.exec(s);
  if (tm) {
    const path = tm[2].split('.');
    const varId = ensureVariable(path, ctx, 'boolean', 'false');
    return {
      variableId: varId,
      operator: tm[1] === '!' ? '==' : '!=',
      value: 'false',
    };
  }

  return null;
}

// ─── InputFieldBlock from <<textbox>> / <<numberbox>> ────────────────────────

function makeInputFieldBlock(tok: Token & { kind: 'macro' }, ctx: BuildContext): InputFieldBlock | null {
  // Args shape: "$var" "default" [optional passage / number default]
  const m = /^"?\$([A-Za-z_$][\w$.]*)"?\s+(.*)$/.exec(tok.args);
  if (!m) return null;
  const path = m[1].split('.');
  const rest = m[2].trim();

  // Pull the next quoted or numeric argument as the placeholder
  let placeholder = '';
  const strArg = /^(?:"([^"]*)"|'([^']*)'|`([^`]*)`|(-?\d+(?:\.\d+)?))/.exec(rest);
  if (strArg) {
    placeholder = strArg[1] ?? strArg[2] ?? strArg[3] ?? strArg[4] ?? '';
  }

  const isNumber = tok.name === 'numberbox';
  const inferredType: VariableType = isNumber ? 'number' : 'string';
  const variableId = ensureVariable(path, ctx, inferredType, placeholder);

  return {
    id: uid(),
    type: 'input-field',
    label: '',
    variableId,
    placeholder,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

