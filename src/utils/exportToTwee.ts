import type {
  Project, ProjectSettings, Block, Character, Variable, ConditionBranch, ChoiceOption,
  SidebarCell, TableBlock,
  Scene, BlockDelay, BlockTypewriter, IncludeBlock,
  ArrayAccessor, ButtonAction, CheckboxBlock, RadioBlock, DateTimeDisplayMode,
  AudioVolumeBlock, ProgressBlock, DateTimeBlock,
  Watcher, WatcherCondition, AudioBlock, AudioGenBlock, ContainerBlock, TimeManipulationBlock,
  VariableTreeNode, VariableGroup, ItemDefinition,
  PluginBlockDef, PluginBlock,
  SceneBackground,
} from '../types';
import { START_TAG } from '../types';
import { flattenVariables, getVariablePath, hasLeafVariables } from './treeUtils';
import { collectPluginIds, expandPluginDeps, pluginValueLiteral } from './pluginUtils';
import { paramsToVirtualNodes, rewriteParamRefs } from './pluginParamScope';
import {
  buildAllDialogueCss,
  buildStyleBindScript,
  hasStyleBindings,
  buildDialogueSpotStyleBlock,
  dialogueElementClasses,
  dialogueDataStyleBind,
  buildButtonsCascadeCss,
  buildButtonSpotStyleBlock,
  buttonElementClasses,
  buttonDataStyleBind,
  buildSimpleBlocksCascadeCss,
  buildSimpleBlockSpotStyleBlock,
  simpleBlockCascadeClasses,
  simpleBlockDataStyleBind,
  buildPopupClassSyncScript,
} from './styleCascade';

// ─── Plugin registry (set by exportToTwee / buildPassages at start of export) ─
// Keeps blockToSC* recursive calls simple — they look up defs through this module-scope map.
let PLUGIN_DEFS: Map<string, PluginBlockDef> = new Map();
export function setPluginRegistry(plugins: PluginBlockDef[] | undefined) {
  PLUGIN_DEFS = new Map((plugins ?? []).map((p) => [p.id, p]));
}
function getPluginDef(id: string): PluginBlockDef | undefined {
  return PLUGIN_DEFS.get(id);
}

// ─── Variable path helpers ────────────────────────────────────────────────────

/** Get the dot-path for a variable given the full tree. Root-level → just name, nested → group1.group2.name */
function varPath(v: Variable, nodes: VariableTreeNode[]): string {
  return getVariablePath(v.id, nodes) || v.name;
}

/** Build a JS reference for a variable path: State.variables["chars"].developer.hp */
function buildJSRef(path: string): string {
  const parts = path.split('.');
  return `State.variables[${JSON.stringify(parts[0])}]${parts.slice(1).map(p => `.${p}`).join('')}`;
}

/** Convert a variable default value to a SugarCube literal string */
export function defaultValueLiteral(v: Variable): string {
  // Expression mode: emit verbatim regardless of varType. The importer sets
  // this for `<<set $x to random(3,10)>>`, `either(...)`, string concat, etc.
  if (v.isExpression && v.defaultValue) return v.defaultValue;
  if (v.varType === 'string' || v.varType === 'datetime') {
    // JSON.stringify wraps in double quotes AND escapes embedded ", \, newlines, etc.
    // Plain `"${...}"` would produce `"He said "hi""` for inputs that contain quotes
    // and SugarCube would throw `<<set>>: bad evaluation: Unexpected identifier 'hi'`.
    return JSON.stringify(v.defaultValue ?? '');
  }
  if (v.varType === 'boolean') return v.defaultValue === 'true' ? 'true' : 'false';
  if (v.varType === 'array') return v.defaultValue || '[]';
  return v.defaultValue || '0';
}

/**
 * Recursively build a JS object literal string from SetObjectBlock entries.
 * Keys that aren't valid JS identifiers are quoted via JSON.stringify.
 */
export function buildSetObjectLiteral(entries: import('../types').SetObjectEntry[]): string {
  if (entries.length === 0) return '{}';
  const parts = entries.map(e => {
    const keyStr = /^[A-Za-z_$][\w$]*$/.test(e.key) ? e.key : JSON.stringify(e.key);
    let valueStr: string;
    switch (e.valueType) {
      case 'string':  valueStr = JSON.stringify(e.value ?? ''); break;
      case 'number':  valueStr = (e.value && e.value.trim() !== '') ? e.value : '0'; break;
      case 'boolean': valueStr = e.value === 'true' ? 'true' : 'false'; break;
      case 'array':   valueStr = (e.value && e.value.trim() !== '') ? e.value : '[]'; break;
      case 'object':  valueStr = buildSetObjectLiteral(e.entries ?? []); break;
    }
    return `${keyStr}: ${valueStr}`;
  });
  return `{ ${parts.join(', ')} }`;
}

/** Recursively build a JS object literal from a VariableGroup for StoryInit export */
export function buildObjectLiteral(group: VariableGroup, allNodes: VariableTreeNode[]): string {
  const entries = group.children
    .map(n => {
      // Keys with spaces / special chars (e.g. "Tailored Suit") must be JSON-quoted —
      // bare identifiers like `Tailored Suit:` parse as two separate identifiers and
      // SugarCube throws `<<set>>: bad evaluation: Unexpected identifier 'Suit'`.
      const key = /^[A-Za-z_$][\w$]*$/.test(n.name) ? n.name : JSON.stringify(n.name);
      if (n.kind === 'variable') return `${key}: ${defaultValueLiteral(n)}`;
      if (n.kind === 'group' && hasLeafVariables(n)) return `${key}: ${buildObjectLiteral(n, allNodes)}`;
      return null;
    })
    .filter(Boolean);
  return `{ ${entries.join(', ')} }`;
}

// ─── Block → SugarCube markup ─────────────────────────────────────────────

/** Escape a string for safe use inside an HTML double-quoted attribute value. */
function htmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Build the SugarCube variable reference string including array accessor. */
function varRefWithAccessor(path: string, accessor: ArrayAccessor | undefined, vars: Variable[], nodes: VariableTreeNode[]): string {
  if (!accessor || accessor.kind === 'whole') return `$${path}`;
  if (accessor.kind === 'length') return `$${path}.length`;
  if (accessor.kind === 'index') {
    const src = accessor.source;
    if (src.kind === 'literal') return `$${path}[${src.index}]`;
    const idxVar = vars.find(v => v.id === src.variableId);
    return `$${path}[${idxVar ? `$${varPath(idxVar, nodes)}` : '0'}]`;
  }
  return `$${path}`;
}

/**
 * Resolve a stored scene reference to a SugarCube passage argument.
 * If the raw value starts with `param:`, returns an unquoted temp-var reference
 * (e.g. `_myScene`). Otherwise resolves the UUID through idToName and returns a
 * quoted passage name (e.g. `"Chapter 2"`).
 */
function sceneTarget(raw: string, idToName?: Map<string, string>): string {
  if (raw.startsWith('param:')) return `_${raw.slice('param:'.length)}`;
  return `"${idToName?.get(raw) ?? raw}"`;
}

/**
 * Build a SugarCube condition expression from the structured fields of a ChoiceOption.
 * Returns '' when no structured condition is set (caller falls back to opt.condition).
 */
function choiceConditionExpr(opt: ChoiceOption, vars: Variable[], nodes: VariableTreeNode[]): string {
  if (!opt.conditionVariableId || !opt.conditionOperator) return '';

  // Plugin param virtual variable (prefix 'param:')
  if (opt.conditionVariableId.startsWith('param:')) {
    const paramKey = opt.conditionVariableId.slice('param:'.length);
    const varName  = `_${paramKey}`;
    let val = opt.conditionValue ?? '';
    if (val && !val.startsWith('$') && !val.startsWith('_') && isNaN(Number(val)) && val !== 'true' && val !== 'false') {
      val = `"${val}"`;
    }
    return `${varName} ${opt.conditionOperator} ${val}`;
  }

  const v = vars.find(x => x.id === opt.conditionVariableId);
  if (!v) return '';
  const vPath   = varPath(v, nodes);
  const varName = `$${vPath}`;
  const op  = opt.conditionOperator;
  const val = opt.conditionValue ?? '';

  // Range mode (numeric variables only)
  if (opt.conditionRangeMode && v.varType === 'number') {
    const lo = opt.conditionRangeMin ?? '0';
    const hi = opt.conditionRangeMax ?? '0';
    return `${varName} >= ${lo} && ${varName} <= ${hi}`;
  }

  if (v.varType === 'array') {
    switch (op) {
      case 'contains':  return `${varName}.includes("${val}")`;
      case '!contains': return `!${varName}.includes("${val}")`;
      case 'empty':     return `${varName}.length === 0`;
      case '!empty':    return `${varName}.length > 0`;
      default: return `${varName} ${op} ${val}`;
    }
  }

  let quotedVal = val;
  if (v.varType === 'string' || v.varType === 'datetime') quotedVal = `"${val}"`;
  return `${varName} ${op} ${quotedVal}`;
}

/** Convert a single ButtonAction to SugarCube macro, handling array operators. */
function actionToSC(a: ButtonAction, vars: Variable[], nodes: VariableTreeNode[], lineIndent: string, idToName?: Map<string, string>): string {
  if (a.type === 'open-popup') {
    const target = sceneTarget(a.targetSceneId ?? '', idToName);
    const title = a.title ?? '';
    return `${lineIndent}<<run Dialog.setup("${title}"); Dialog.wiki(Story.get(${target}).processText()); Dialog.open();>>`;
  }
  const v = vars.find(x => x.id === a.variableId);
  if (!v) return '';
  const path = varPath(v, nodes);

  if (v.varType === 'array') {
    const accessorKind = a.accessor?.kind ?? 'whole';
    if (accessorKind === 'index') {
      const ref = varRefWithAccessor(path, a.accessor, vars, nodes);
      return `${lineIndent}<<set ${ref} to "${a.value}">>`;
    }
    switch (a.operator) {
      case 'push':   return `${lineIndent}<<run $${path}.push("${a.value}")>>`;
      case 'remove': return `${lineIndent}<<run $${path}.deleteWith(function(x){return x==="${a.value}";})>>`;
      case 'clear':  return `${lineIndent}<<set $${path} to []>>`;
      default:       return `${lineIndent}<<set $${path} to ${a.value}>>`;
    }
  }

  let val = a.value;
  if (v.varType === 'string' || v.varType === 'datetime') val = `"${val}"`;
  if (a.operator === '=') return `${lineIndent}<<set $${path} to ${val}>>`;
  return `${lineIndent}<<set $${path} ${a.operator} ${val}>>`;
}

/** Wrap block output with <<timed>> delay and/or <<type>> typewriter effect. */
function wrapBlockEffects(
  content: string,
  delay: BlockDelay | undefined,
  typewriter: BlockTypewriter | undefined,
  indent: string,
  blockId?: string,
): string {
  if (!content) return content;
  let result = content;

  // Typewriter (inner wrapper — applied first, closest to content)
  if (typewriter?.speed && typewriter.speed > 0) {
    result = `<<type ${typewriter.speed}ms>>${result}<</type>>`;
  }

  // Delay + optional entrance animation (outer wrapper)
  if (delay?.delay && delay.delay > 0) {
    if (delay.animation && blockId) {
      const dur          = delay.animDuration ?? 0.4;
      const ox           = delay.animOffsetX ?? 0;
      const oy           = delay.animOffsetY ?? 0;
      const useFade      = delay.animFade !== false; // default true
      const hasTransform = ox !== 0 || oy !== 0;

      // Skip wrapping if nothing would actually animate
      if (useFade || hasTransform) {
        // CSS transitions + setTimeout(16ms): insert element in initial state, then one frame
        // later JS sets the final state so the transition fires.  CSS @keyframe animations on
        // DOM-inserted elements are unreliable inside SugarCube's <<timed>> macro.
        const uid = `tg${blockId.replace(/-/g, '').substring(0, 10)}`;
        const txParts = [ox !== 0 ? `translateX(${ox}px)` : '', oy !== 0 ? `translateY(${oy}px)` : ''].filter(Boolean);
        const initTransform = txParts.join(' ');
        const transitionParts = [
          useFade      ? `opacity ${dur}s ease-out`   : '',
          hasTransform ? `transform ${dur}s ease-out` : '',
        ].filter(Boolean);
        const initStyle = [
          useFade      ? 'opacity:0'                      : '',
          hasTransform ? `transform:${initTransform}`     : '',
          `transition:${transitionParts.join(',')}`,
        ].filter(Boolean).join(';') + ';';
        const finalParts = [
          useFade      ? `e.style.opacity='1'`      : '',
          hasTransform ? `e.style.transform='none'` : '',
        ].filter(Boolean).join(';');
        const script = `<<script>>setTimeout(function(){var e=document.getElementById('${uid}');if(e){${finalParts};}},16);<</script>>`;
        result = `<div id="${uid}" style="${initStyle}">${result}</div>${script}`;
      }
    }
    result = `${indent}<<timed ${delay.delay}s>>${result}<</timed>>`;
  }

  return result;
}

/**
 * Special SugarCube passages need stripped-down block output:
 *   - `'title'` (::StoryTitle): text blocks emit raw content, no `<div>` wrapper
 *     (SugarCube renders the passage's processed text into `#story-title`).
 *   - `'menu'`  (::StoryMenu):  link blocks emit just the `<<link>>` macro
 *     on a single line, no `<span>` wrapper (SugarCube expects each `<<link>>`
 *     on its own line to build a `<li>` menu).
 * Other passage contexts (sidebar, header, footer, regular scenes) use the
 * default wrapping behavior.
 */
export type PassageContext = 'title' | 'menu' | undefined;

export function blockToSC(
  block: Block, chars: Character[], vars: Variable[], nodes: VariableTreeNode[],
  indent = '', idToName?: Map<string, string>, project?: Project,
  passageCtx?: PassageContext,
): string {
  const raw = blockToSCInner(block, chars, vars, nodes, indent, idToName, project, passageCtx);
  if (!raw || block.type === 'condition' || block.type === 'note' || block.type === 'time-manipulation') return raw;
  const b = block as { delay?: BlockDelay; typewriter?: BlockTypewriter };
  return wrapBlockEffects(raw, b.delay, b.typewriter, indent, block.id);
}

function blockToSCInner(block: Block, chars: Character[], vars: Variable[], nodes: VariableTreeNode[], indent = '', idToName?: Map<string, string>, project?: Project, passageCtx?: PassageContext): string {
  switch (block.type) {
    case 'text': {
      // Title / menu passages: SugarCube renders ::StoryTitle straight into
      // `#story-title` (via wiki()) and parses ::StoryMenu line-by-line into
      // `<<link>>` items. The `<div class="tg-text">` wrapper would either
      // become literal markup in the title or break menu line-parsing — strip
      // it for these contexts and emit the user's raw content.
      if (passageCtx === 'title' || passageCtx === 'menu') {
        return `${indent}${block.content}`;
      }
      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const bindKey = settings ? simpleBlockDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      if (block.live) {
        const attr = htmlAttr(block.content);
        const classes = ['tg-text', 'tg-live', ...extra].join(' ');
        return `${spotPrefix}${indent}<span class="${classes}" data-wiki="${attr}"${bindAttr}>${block.content}</span>`;
      }
      const classes = ['tg-text', ...extra].join(' ');
      return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}>${block.content}</div>`;
    }

    case 'dialogue': {
      const char = chars.find(c => c.id === block.characterId);

      // Use runtime $name variable if available, otherwise fall back to static name
      const nameVarId = char?.varIds?.nameVarId;
      const nameVar = nameVarId ? vars.find(v => v.id === nameVarId) : null;
      const baseName = nameVar ? `<<print $${varPath(nameVar, nodes)}>>` : (char?.name ?? 'Unknown');
      const charNameDisplay = block.nameSuffix
        ? `${baseName} (${block.nameSuffix})`
        : baseName;

      // Avatar HTML — static mode or variable-bound mode
      const avatarVarId = char?.varIds?.avatarVarId;
      const avatarVar = avatarVarId ? vars.find(v => v.id === avatarVarId) : null;
      const cfg = char?.avatarConfig;

      let avatarHtml = '';
      if (cfg?.mode === 'bound' && cfg.variableId) {
        const boundVar = vars.find(v => v.id === cfg.variableId);
        const vname = boundVar ? `$${varPath(boundVar, nodes)}` : '$???';
        const imgTag = (src: string) => `<img class="char-avatar" src="${src}">`;
        const cases = cfg.mapping.map((m, i) => {
          const kw = i === 0 ? '<<if' : '<<elseif';
          const mt = m.matchType ?? 'exact';
          let cond: string;
          if (mt === 'range') {
            const lo = m.rangeMin ?? '0';
            const hi = m.rangeMax ?? '0';
            cond = `${vname} >= ${lo} && ${vname} <= ${hi}`;
          } else {
            const val = boundVar?.varType === 'string' ? `"${m.value}"` : m.value;
            cond = `${vname} eq ${val}`;
          }
          return `${kw} ${cond}>>${imgTag(m.src)}`;
        });
        if (cfg.defaultSrc) cases.push(`<<else>>${imgTag(cfg.defaultSrc)}`);
        if (cases.length > 0) cases.push('<</if>>');
        avatarHtml = cases.join('');
      } else if (cfg?.mode === 'static' && cfg.src) {
        avatarHtml = `<img class="char-avatar" src="${cfg.src}">`;
      } else if (avatarVar) {
        avatarHtml = `<<if $${varPath(avatarVar, nodes)}>><img class="char-avatar" @src="$${varPath(avatarVar, nodes)}"><</if>>`;
      }

      // Inner blocks rendered inside the dialogue bubble after the main text
      const innerBlocksHtml = (block.innerBlocks ?? [])
        .map(b => blockToSC(b, chars, vars, nodes, '', idToName, project))
        .filter(Boolean)
        .join('');

      const body = `<div class="char-body"><span class="char-name">${charNameDisplay}</span><span class="char-text">${block.text}</span>${innerBlocksHtml}</div>`;

      // Avatar always comes first in DOM for both alignments. The `.dlg-right`
      // class flips visual order via flex-direction: row-reverse.
      const inner = avatarHtml + body;

      // Style cascade classes + spot <style> block + data-style-bind
      const classes = char ? dialogueElementClasses(char, block) : ['dialogue', 'dlg-unknown'];
      classes.push(block.align === 'right' ? 'dlg-right' : 'dlg-left');
      const dataBind = char ? dialogueDataStyleBind(char) : '';
      const dataBindAttr = dataBind ? ` data-style-bind="${dataBind}"` : '';
      const spotStyleBlock = char ? buildDialogueSpotStyleBlock(block) : '';

      const divContent = `${spotStyleBlock}<div class="${classes.join(' ')}"${dataBindAttr}>${inner}</div>`;
      if (block.live) {
        const attr = htmlAttr(divContent);
        return `${indent}<span class="tg-live" data-wiki="${attr}">${divContent}</span>`;
      }
      return `${indent}${divContent}`;
    }

    case 'choice': {
      if (block.options.length === 0) return '';
      const lines = block.options.map(opt => {
        // Structured condition takes priority; fall back to legacy free-text field
        const cond = choiceConditionExpr(opt, vars, nodes) || opt.condition.trim();
        const raw = opt.targetSceneId || '';
        const target = raw ? sceneTarget(raw, idToName) : '"Start"';
        const link = `<<link "${opt.label}" ${target}>><</link>>`;
        if (cond) return `${indent}  <<if ${cond}>>${link}<</if>>`;
        return `${indent}  ${link}`;
      });
      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const bindKey = settings ? simpleBlockDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const classes = ['tg-choice', ...extra].join(' ');
      return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}>\n${lines.join('\n')}\n${indent}</div>`;
    }

    case 'condition': {
      if (block.branches.length === 0) return '';
      return block.branches
        .map((branch, i) => branchToSC(branch, chars, vars, nodes, indent, i === 0, idToName, project))
        .join('\n') + `\n${indent}<</if>>`;
    }

    case 'for': {
      let header: string;
      if (block.mode === 'range') {
        const value = block.valueVar || '_value';
        const loopVars = block.keyVar ? `${block.keyVar}, ${value}` : value;
        const src  = block.source || '[]';
        header = `<<for ${loopVars} range ${src}>>`;
      } else if (block.mode === 'while') {
        header = `<<for ${block.whileCondition ?? 'false'}>>`;
      } else { // cstyle
        const init = block.initExpr ?? '';
        const cond = block.cstyleCondition ?? 'false';
        const step = block.stepExpr ?? '';
        header = `<<for ${init}; ${cond}; ${step}>>`;
      }
      const body = block.blocks
        .map(b => blockToSC(b, chars, vars, nodes, indent + '  ', idToName, project))
        .filter(Boolean)
        .join('\n');
      return body
        ? `${indent}${header}\n${body}\n${indent}<</for>>`
        : `${indent}${header}${indent}<</for>>`;
    }

    case 'set-object': {
      const v = vars.find(x => x.id === block.variableId);
      if (!v) return `${indent}/* variable not found */`;
      const path = varPath(v, nodes);
      const literal = buildSetObjectLiteral(block.entries);
      return `${indent}<<set $${path} = ${literal}>>`;
    }

    case 'variable-set': {
      const v = vars.find(x => x.id === block.variableId);
      if (!v) return `${indent}/* variable not found */`;
      const path = varPath(v, nodes);

      // ── Array type — special operators ──────────────────────────────────────
      if (v.varType === 'array') {
        const accessorKind = block.accessor?.kind ?? 'whole';
        if (accessorKind === 'index') {
          const ref = varRefWithAccessor(path, block.accessor, vars, nodes);
          return `${indent}<<set ${ref} to "${block.value}">>`;
        }
        switch (block.operator) {
          case 'push':   return `${indent}<<run $${path}.push("${block.value}")>>`;
          case 'remove': return `${indent}<<run $${path}.deleteWith(function(x){return x==="${block.value}";})>>`;
          case 'clear':  return `${indent}<<set $${path} to []>>`;
          case '=':      return `${indent}<<set $${path} to ${block.value}>>`;
          default:       return `${indent}<<set $${path} to ${block.value}>>`;
        }
      }

      // Effective mode — backward compat with old randomize boolean
      const mode = block.valueMode ?? (block.randomize ? 'random' : 'manual');

      // ── Expression mode (numbers) ────────────────────────────────────────────
      if (mode === 'expression' && block.expression) {
        if (block.operator === '=') return `${indent}<<set $${path} to ${block.expression}>>`;
        return `${indent}<<set $${path} ${block.operator} ${block.expression}>>`;
      }

      // ── Dynamic mode (strings) — if/elseif/else chain ────────────────────────
      if (mode === 'dynamic' && block.dynamicMapping && block.dynamicMapping.length > 0) {
        const cv     = vars.find(x => x.id === block.dynamicVariableId);
        const cvName = cv ? `$${varPath(cv, nodes)}` : '$???';

        const cases = block.dynamicMapping.map((m, i) => {
          const kw = i === 0 ? '<<if' : '<<elseif';
          const mt = m.matchType ?? 'exact';
          let cond: string;
          if (mt === 'range') {
            cond = `${cvName} >= ${m.rangeMin ?? '0'} && ${cvName} <= ${m.rangeMax ?? '0'}`;
          } else {
            const val = cv?.varType === 'string' ? `"${m.value}"` : m.value;
            cond = `${cvName} eq ${val}`;
          }
          return `${indent}${kw} ${cond}>><<set $${path} to "${m.result}">>`;
        });

        if (block.dynamicDefault !== undefined) {
          cases.push(`${indent}<<else>><<set $${path} to "${block.dynamicDefault}">>`);
        }
        cases.push(`${indent}<</if>>`);
        return cases.join('\n');
      }

      // ── Random value ────────────────────────────────────────────────────────
      if (mode === 'random' && block.randomConfig) {
        const cfg = block.randomConfig;
        switch (cfg.kind) {
          case 'number': {
            const expr = `random(${cfg.min}, ${cfg.max})`;
            // Respect the chosen operator — e.g. $hp -= random(10, 15)
            if (block.operator === '=') return `${indent}<<set $${path} to ${expr}>>`;
            return `${indent}<<set $${path} ${block.operator} ${expr}>>`;
          }
          case 'boolean':
            return `${indent}<<set $${path} to either(true, false)>>`;
          case 'string': {
            const len = Math.max(1, cfg.length);
            const expr = `Array(${len}).fill(0).map(()=>"abcdefghijklmnopqrstuvwxyz0123456789".charAt(random(0,35))).join("")`;
            return `${indent}<<set $${path} to ${expr}>>`;
          }
        }
      }

      // ── Manual value ────────────────────────────────────────────────────────
      let val = block.value;
      if (v.varType === 'string' || v.varType === 'datetime') val = `"${val}"`;
      if (block.operator === '=') return `${indent}<<set $${path} to ${val}>>`;
      return `${indent}<<set $${path} ${block.operator} ${val}>>`;
    }

    case 'image': {
      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const bindKey = settings ? simpleBlockDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const classes = ['tg-image', ...extra].join(' ');

      const w   = block.width > 0 ? ` width="${block.width}"` : '';
      const alt = block.alt ? ` alt="${block.alt}"` : '';
      const imgTag = (src: string) => `<img src="${src}"${alt}${w} />`;
      const mode = block.mode ?? 'static';

      // ── Bound mode: <<if>>…<<elseif>>…<<else>>…<</if>> chain ────────────
      if (mode === 'bound' && block.mapping && block.mapping.length > 0) {
        const bv = vars.find(x => x.id === block.variableId);
        const vname = bv ? `$${varPath(bv, nodes)}` : '$???';

        const cases = block.mapping.map((m, i) => {
          const kw = i === 0 ? '<<if' : '<<elseif';
          const mt = m.matchType ?? 'exact';
          let cond: string;
          if (mt === 'range') {
            cond = `${vname} >= ${m.rangeMin ?? '0'} && ${vname} <= ${m.rangeMax ?? '0'}`;
          } else {
            const val = bv?.varType === 'string' ? `"${m.value}"` : m.value;
            cond = `${vname} eq ${val}`;
          }
          return `${indent}${kw} ${cond}>>${imgTag(m.src)}`;
        });

        if (block.defaultSrc) cases.push(`${indent}<<else>>${imgTag(block.defaultSrc)}`);
        cases.push(`${indent}<</if>>`);
        return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}>\n${cases.join('\n')}\n${indent}</div>`;
      }

      // ── Static mode ──────────────────────────────────────────────────────
      return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}>${imgTag(block.src)}</div>`;
    }

    case 'image-gen': {
      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const bindKey = settings ? simpleBlockDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const classes = ['tg-image', ...extra].join(' ');

      const w   = block.width > 0 ? ` width="${block.width}"` : '';
      const alt = block.alt ? ` alt="${block.alt}"` : '';
      const imgTag = (src: string) => `<img src="${src}"${alt}${w} />`;
      const mode = block.mode ?? 'static';

      if (mode === 'bound' && block.mapping && block.mapping.length > 0) {
        const bv = vars.find(x => x.id === block.variableId);
        const vname = bv ? `$${varPath(bv, nodes)}` : '$???';

        const cases = block.mapping.map((m, i) => {
          const kw = i === 0 ? '<<if' : '<<elseif';
          const mt = m.matchType ?? 'exact';
          let cond: string;
          if (mt === 'range') {
            cond = `${vname} >= ${m.rangeMin ?? '0'} && ${vname} <= ${m.rangeMax ?? '0'}`;
          } else {
            const val = bv?.varType === 'string' ? `"${m.value}"` : m.value;
            cond = `${vname} eq ${val}`;
          }
          return `${indent}${kw} ${cond}>>${imgTag(m.src)}`;
        });

        if (block.defaultSrc) cases.push(`${indent}<<else>>${imgTag(block.defaultSrc)}`);
        cases.push(`${indent}<</if>>`);
        return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}>\n${cases.join('\n')}\n${indent}</div>`;
      }

      return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}>${imgTag(block.src)}</div>`;
    }

    case 'video': {
      const attrs = [
        block.controls ? 'controls' : '',
        block.autoplay ? 'autoplay' : '',
        block.loop ? 'loop' : '',
        block.width > 0 ? `width="${block.width}"` : '',
      ].filter(Boolean).join(' ');
      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const bindKey = settings ? simpleBlockDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const classes = ['tg-video', ...extra].join(' ');
      return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}><video src="${block.src}"${attrs ? ' ' + attrs : ''}></video></div>`;
    }

    case 'input-field': {
      const v = vars.find(x => x.id === block.variableId);
      if (!v) return `${indent}/* variable not found */`;
      const path = varPath(v, nodes);
      const vname = `$${path}`;
      // numberbox for numeric variables, textbox for everything else
      const macro = v.varType === 'number' ? 'numberbox' : 'textbox';
      // Use the current variable value as the textbox default so the field
      // keeps whatever the player typed if the passage is re-rendered (Engine.show).
      // $varname evaluates to its StoryInit default on first load, and to the
      // player's input on subsequent re-renders.
      const defVal = `$${path}`;
      const inner: string[] = [];
      if (block.label) inner.push(block.label);
      inner.push(`<<${macro} "${vname}" ${defVal}>>`);

      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const bindKey = settings ? simpleBlockDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const classes = ['tg-input-field', ...extra].join(' ');
      return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}>${inner.join('\n')}</div>`;
    }

    case 'raw':
      if (!block.code) return '';
      return block.code.split('\n').map(line => `${indent}${line}`).join('\n');

    case 'include': {
      const raw = (block as IncludeBlock).passageName.trim();
      if (!raw) return '';
      const includeArg = sceneTarget(raw, idToName);
      const include = `<<include ${includeArg}>>`;

      const cssVars: string[] = [];
      if (block.maxWidth && block.maxWidth > 0)
        cssVars.push(`--tg-inc-max-width:${block.maxWidth}px`);
      if (block.bordered) {
        const bw = block.borderWidth ?? 1;
        const bc = block.borderColor ?? '#555555';
        const br = block.borderRadius ?? 0;
        cssVars.push(`--tg-inc-border-width:${bw}px`, `--tg-inc-border-color:${bc}`);
        if (br > 0) cssVars.push(`--tg-inc-radius:${br}px`);
      }
      if (block.padding && block.padding > 0)
        cssVars.push(`--tg-inc-padding:${block.padding}px`);
      if (block.bgColor)
        cssVars.push(`--tg-inc-bg:${block.bgColor}`);

      const styleAttr = cssVars.length > 0 ? ` style="${cssVars.join(';')}"` : '';
      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const bindKey = settings ? simpleBlockDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const classes = ['tg-include', ...extra].join(' ');
      return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}${styleAttr}>${include}</div>`;
    }

    case 'divider': {
      const color     = block.color     ?? '#555555';
      const thickness = block.thickness ?? 1;
      const marginV   = block.marginV   ?? 8;
      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const bindKey = settings ? simpleBlockDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const classes = ['tg-divider', ...extra].join(' ');
      return `${spotPrefix}${indent}<hr class="${classes}"${bindAttr} style="--tg-div-color:${color};--tg-div-thickness:${thickness}px;--tg-div-margin:${marginV}px">`;
    }

    case 'spacer': {
      const size = (typeof block.size === 'number' && block.size >= 0) ? block.size : 8;
      return `${indent}<div class="tg-spacer" style="height:${size}px"></div>`;
    }

    case 'progress': {
      // Reuse the progress-bar renderer (CSS-class path). A standalone block needs an
      // explicit height since `.tg-progress` is height:100% — wrap in a sized div.
      const h = (typeof block.height === 'number' && block.height > 0) ? block.height : 16;
      const inner = buildProgressBarSC(block, vars, nodes);
      return `${indent}<div class="tg-progress-block" style="height:${h}px">${inner}</div>`;
    }

    case 'audio-volume':
      return `${indent}${buildAudioVolumeBlockSC(block)}`;

    case 'date-time': {
      const v = vars.find(x => x.id === block.variableId);
      const vname = v ? `$${varPath(v, nodes)}` : '$???';
      return `${indent}${buildDateTimeCellSC(block, vname)}`;
    }

    case 'callout': {
      const icon = (block.icon ?? '').trim();
      const iconSpan = icon ? `<span class="tg-callout-icon">${icon}</span>` : '';
      const title = (block.title ?? '').trim();
      const titleDiv = title ? `<div class="tg-callout-title">${title}</div>` : '';
      return `${indent}<div class="tg-callout tg-callout-${block.variant}">${iconSpan}<div class="tg-callout-body">${titleDiv}${block.content}</div></div>`;
    }

    case 'select': {
      if (block.options.length === 0) return '';
      const v = vars.find(x => x.id === block.variableId);
      const vname = v ? `$${varPath(v, nodes)}` : '$???';
      const opts = block.options.map(o => `<<option "${o.label}" "${o.value}">>`).join('');
      const listbox = `<<listbox "${vname}" autoselect>>${opts}<</listbox>>`;
      const label = block.label ? `${block.label} ` : '';
      return `${indent}<span class="tg-select">${label}${listbox}</span>`;
    }

    case 'slider': {
      // Plain range input (SugarCube has no range macro). A deferred <<script>> seeds
      // it from the bound variable and writes back on input, refreshing live spans +
      // watchers — same DOM-defer pattern as the audio-volume block.
      const v = vars.find(x => x.id === block.variableId);
      const vpath = v ? varPath(v, nodes) : '';
      const ref = vpath ? buildJSRef(vpath) : 'State.variables.__tgSliderMissing';
      const id = `tgsl${block.id.replace(/-/g, '').substring(0, 12)}`;
      const vid = `${id}v`;
      const step = (typeof block.step === 'number' && block.step > 0) ? block.step : 1;
      const def = (v && /^-?\d+(\.\d+)?$/.test(v.defaultValue)) ? v.defaultValue : String(block.min);
      const slider = `<input id="${id}" type="range" min="${block.min}" max="${block.max}" step="${step}" value="${def}" style="vertical-align:middle">`;
      const valSpan = block.showValue ? `<span id="${vid}" class="tg-slider-val">${def}</span>` : '';
      const label = block.label ? `${block.label} ` : '';
      const script = [
        '<<script>>',
        'setTimeout(function(){',
        `  var s=document.getElementById("${id}"); if(!s) return;`,
        `  var cur=${ref};`,
        '  if(cur!=null) s.value=cur;',
        block.showValue ? `  var d=document.getElementById("${vid}"); if(d) d.textContent=s.value;` : '',
        '  s.addEventListener("input", function(){',
        '    var nv=Number(s.value);',
        `    ${ref}=nv;`,
        block.showValue ? `    var dd=document.getElementById("${vid}"); if(dd) dd.textContent=nv;` : '',
        '    if(window.jQuery){window.jQuery(".tg-live[data-wiki]").each(function(){window.jQuery(this).empty().wiki(window.jQuery(this).attr("data-wiki"));});}',
        '    if(window._tgCheckWatchers) window._tgCheckWatchers();',
        '  });',
        '},0);',
        '<</script>>',
      ].filter(Boolean).join('');
      return `${indent}<span class="tg-slider">${label}${slider}${valSpan}</span>${script}`;
    }

    case 'display-object': {
      if (block.fields.length === 0) return '';
      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const bindKey = settings ? simpleBlockDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';

      const cols = (typeof block.columns === 'number' && block.columns > 0) ? block.columns : 2;
      const gridStyleAttr = block.layout === 'grid' ? ` style="--tg-do-cols:${cols}"` : '';
      const classes = ['tg-do', `tg-do-${block.layout}`, ...extra].join(' ');

      const rowsHtml = block.fields.map(f => {
        const v = vars.find(x => x.id === f.variableId);
        const vpath = v ? varPath(v, nodes) : '';
        const sv = vpath ? `$${vpath}` : '$???';
        const labelText = ((f.label ?? '').trim() || (v?.name ?? '?')).replace(/</g, '&lt;');
        const render = f.render ?? 'text';

        let valueMarkup: string;
        if (render === 'bar') {
          let maxExpr: string;
          if (f.maxVariableId) {
            const mv = vars.find(x => x.id === f.maxVariableId);
            const mpath = mv ? varPath(mv, nodes) : '';
            maxExpr = mpath ? `$${mpath}` : '1';
          } else {
            maxExpr = (typeof f.maxValue === 'number' && f.maxValue > 0) ? String(f.maxValue) : '1';
          }
          valueMarkup =
            `<<set _tgP to Math.min(100,Math.max(0,${sv}/${maxExpr}*100))>>` +
            `<<print '<span class="tg-do-bar"><span class="tg-do-bar-fill" style="width:'+_tgP+'%"></span></span>'>>` +
            `<span class="tg-do-bar-text"><<print ${sv}>>/<<print ${maxExpr}>></span>`;
        } else if (render === 'bool') {
          valueMarkup = `<<if ${sv}>>✓<<else>>✗<</if>>`;
        } else if (render === 'badge') {
          valueMarkup = `<span class="tg-do-badge"><<print ${sv}>></span>`;
        } else {
          valueMarkup = `<<print ${sv}>>`;
        }

        const valueAttrs = block.live
          ? ` class="tg-do-value tg-live" data-wiki="${htmlAttr(valueMarkup)}"`
          : ` class="tg-do-value"`;
        return `<span class="tg-do-row"><span class="tg-do-label">${labelText}</span><span${valueAttrs}>${valueMarkup}</span></span>`;
      }).join('');

      return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}${gridStyleAttr}>${rowsHtml}</div>`;
    }

    case 'section': {
      const inner = block.blocks
        .map(b => blockToSC(b, chars, vars, nodes, indent + '  ', idToName, project))
        .filter(Boolean)
        .join('\n');
      const title = (block.title ?? '').trim();
      if (block.collapsible) {
        // Native <details> disclosure — no JS needed. `open` unless defaultCollapsed.
        const openAttr = block.defaultCollapsed ? '' : ' open';
        const summary = `${indent}  <summary class="tg-section-title">${title}</summary>`;
        return `${indent}<details class="tg-section"${openAttr}>\n${summary}\n${inner}\n${indent}</details>`;
      }
      const head = title ? `${indent}  <div class="tg-section-title">${title}</div>\n` : '';
      return `${indent}<div class="tg-section">\n${head}${inner}\n${indent}</div>`;
    }

    case 'note':
      // Developer note — never exported
      return '';

    case 'table':
      return tableBlockToSC(block, chars, vars, nodes, indent, idToName, project);

    case 'paperdoll': {
      const char = chars.find(ch => ch.id === block.charId);
      if (!char?.paperdoll || !char.varName) return '';
      const html = buildPaperdollCellSC(char.varName, char.paperdoll, block.showLabels, vars, nodes, project?.items);
      return `${indent}${html}`;
    }

    case 'inventory': {
      const char = chars.find(ch => ch.id === block.charId);
      if (!char?.varName) return '';
      const title = (block.title ?? '').replace(/"/g, '\\"');
      return `${indent}<<tgInventory "${char.varName}"${title ? ` "${title}"` : ''}>>`;
    }

    case 'button': {
      const settings = project?.settings;
      const classAttr = settings
        ? buttonElementClasses(block, settings).join(' ')
        : `tg-btn tg-btn-${block.id.replace(/-/g, '').substring(0, 12)}`;
      const bindKey = settings ? buttonDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildButtonSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const actionLines = block.actions
        .map(a => actionToSC(a, vars, nodes, `${indent}  `, idToName))
        .filter(Boolean);
      if (block.refreshScene) {
        actionLines.push(`${indent}  <<run Engine.show()>>`);
      } else {
        actionLines.push(`${indent}  <<run $('.tg-live[data-wiki]').each(function(){$(this).empty().wiki($(this).attr('data-wiki'));})>>`);
      }
      actionLines.push(`${indent}  <<run window._tgCheckWatchers && window._tgCheckWatchers()>>`);
      actionLines.push(`${indent}  <<run window._tgRefreshStyleBind && window._tgRefreshStyleBind()>>`);
      actionLines.push(`${indent}  <<run UIBar.update()>>`);
      return (
        spotPrefix +
        `${indent}<span class="${classAttr}"${bindAttr}>` +
        `<<link "${block.label}">>\n` +
        actionLines.join('\n') + '\n' +
        `${indent}<</link>></span>`
      );
    }

    case 'link': {
      const settings = project?.settings;
      const classAttr = settings
        ? buttonElementClasses(block, settings).join(' ')
        : `tg-btn tg-btn-${block.id.replace(/-/g, '').substring(0, 12)}`;
      const bindKey = settings ? buttonDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildButtonSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const actionLines = block.actions
        .map(a => actionToSC(a, vars, nodes, `${indent}  `, idToName))
        .filter(Boolean);
      const targetActions: string[] = [];
      if (block.target === 'back') {
        targetActions.push(`<<run Engine.backward()>>`);
      } else {
        const rawTarget = block.targetSceneId ?? '';
        const gotoArg = rawTarget.startsWith('param:')
          ? `_${rawTarget.slice('param:'.length)}`          // temp-var ref, unquoted
          : `"${idToName?.get(rawTarget) ?? rawTarget}"`;   // scene name, quoted
        targetActions.push(`<<goto ${gotoArg}>>`);
      }
      targetActions.push(`<<run UIBar.update()>>`);
      // StoryMenu: emit just the <<link>> macro on one line, no wrapper span.
      // SugarCube parses ::StoryMenu line-by-line; each <<link>> becomes a <li>
      // and gets standard menu styling.
      if (passageCtx === 'menu') {
        const inlineActions = block.actions
          .map(a => actionToSC(a, vars, nodes, '', idToName).trim())
          .filter(Boolean)
          .join('');
        return `${indent}<<link "${block.label}">>${inlineActions}${targetActions.join('')}<</link>>`;
      }
      actionLines.push(...targetActions.map(a => `${indent}  ${a}`));
      return (
        spotPrefix +
        `${indent}<span class="${classAttr}"${bindAttr}><<link "${block.label}">>\n` +
        actionLines.join('\n') + '\n' +
        `${indent}<</link>></span>`
      );
    }

    case 'menu-link': {
      // Bare <<link>> — no wrapper span, no styling. Single line so SugarCube's
      // ::StoryMenu link-sifting recognizes the generated <a>. Built-in targets map
      // to SugarCube UI dialogs; 'none' runs only the actions.
      const inlineActions = block.actions
        .map(a => actionToSC(a, vars, nodes, '', idToName).trim())
        .filter(Boolean)
        .join('');
      let nav = '';
      switch (block.target) {
        case 'back':     nav = '<<run Engine.backward()>>'; break;
        case 'saves':    nav = '<<run UI.saves()>>'; break;
        case 'restart':  nav = '<<run UI.restart()>>'; break;
        case 'settings': nav = '<<run UI.settings()>>'; break;
        case 'scene': {
          const rawTarget = block.targetSceneId ?? '';
          const gotoArg = rawTarget.startsWith('param:')
            ? `_${rawTarget.slice('param:'.length)}`
            : `"${idToName?.get(rawTarget) ?? rawTarget}"`;
          nav = `<<goto ${gotoArg}>>`;
          break;
        }
        // 'none': nav stays empty — actions only
      }
      return `${indent}<<link "${block.label}">>${inlineActions}${nav}<</link>>`;
    }

    case 'function': {
      const settings = project?.settings;
      const classAttr = settings
        ? buttonElementClasses(block, settings).join(' ')
        : `tg-btn tg-btn-${block.id.replace(/-/g, '').substring(0, 12)}`;
      const bindKey = settings ? buttonDataStyleBind(block, settings) : '';
      const bindAttr = bindKey ? ` data-style-bind="${bindKey}"` : '';
      const spotStyle = buildButtonSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      const actionLines = block.actions
        .map(a => actionToSC(a, vars, nodes, `${indent}  `, idToName))
        .filter(Boolean);
      const funcTarget = block.targetSceneId ? sceneTarget(block.targetSceneId, idToName) : '"???"';
      actionLines.push(`${indent}  <<include ${funcTarget}>>`);
      actionLines.push(`${indent}  <<run $('.tg-live[data-wiki]').each(function(){$(this).empty().wiki($(this).attr('data-wiki'));})>>`);
      actionLines.push(`${indent}  <<run window._tgCheckWatchers && window._tgCheckWatchers()>>`);
      actionLines.push(`${indent}  <<run window._tgRefreshStyleBind && window._tgRefreshStyleBind()>>`);
      actionLines.push(`${indent}  <<run UIBar.update()>>`);
      return (
        spotPrefix +
        `${indent}<span class="${classAttr}"${bindAttr}><<link "${block.label}">>\n` +
        actionLines.join('\n') + '\n' +
        `${indent}<</link>></span>`
      );
    }

    case 'checkbox': {
      const cb = block as CheckboxBlock;
      if (cb.options.length === 0) return '';
      const lines: string[] = [];
      if (cb.label) lines.push(`${indent}${cb.label}`);

      if (cb.mode === 'flags') {
        // Each option toggles its own boolean variable
        for (const opt of cb.options) {
          const v = vars.find(x => x.id === opt.variableId);
          const vname = v ? `$${varPath(v, nodes)}` : '$???';
          lines.push(`${indent}<<checkbox "${vname}" false true autocheck>> ${opt.label}`);
        }
      } else {
        // Array mode: plain HTML checkboxes + script sets initial state and attaches handlers
        const arrVar = vars.find(x => x.id === cb.variableId);
        const arrPath = arrVar ? varPath(arrVar, nodes) : '???';
        const uid = `tgcb_${cb.id.replace(/-/g, '').substring(0, 10)}`;
        const inputLines = cb.options.map((opt, i) => {
          const optId = `${uid}_${i}`;
          return `<input id="${optId}" type="checkbox"> <label for="${optId}">${opt.label}</label>`;
        });
        lines.push(`${indent}<span id="${uid}">${inputLines.join('<br>')}</span>`);
        const handlers = cb.options.map((opt, i) => {
          const optId = `${uid}_${i}`;
          const val = (opt.value ?? '').replace(/"/g, '\\"');
          return (
            `var e${i}=document.getElementById('${optId}');` +
            `if(e${i}){` +
            `e${i}.checked=State.variables.${arrPath}.includes("${val}");` +
            `e${i}.addEventListener('change',function(){` +
            `if(this.checked){State.variables.${arrPath}.push("${val}");}` +
            `else{State.variables.${arrPath}.deleteWith(function(x){return x==="${val}";});}});}`
          );
        }).join('');
        lines.push(`${indent}<<script>>setTimeout(function(){${handlers}},0);<</script>>`);
      }
      const cbSettings = project?.settings;
      const cbExtra = cbSettings ? simpleBlockCascadeClasses(cb, cbSettings) : [];
      const cbBindKey = cbSettings ? simpleBlockDataStyleBind(cb, cbSettings) : '';
      const cbBindAttr = cbBindKey ? ` data-style-bind="${cbBindKey}"` : '';
      const cbSpotStyle = buildSimpleBlockSpotStyleBlock(cb);
      const cbSpotPrefix = cbSpotStyle ? `${indent}${cbSpotStyle}\n` : '';
      const cbClasses = ['tg-checkbox', ...cbExtra].join(' ');
      return `${cbSpotPrefix}${indent}<div class="${cbClasses}"${cbBindAttr}>${lines.join('\n')}</div>`;
    }

    case 'radio': {
      const rb = block as RadioBlock;
      if (rb.options.length === 0) return '';
      const v = vars.find(x => x.id === rb.variableId);
      const vname = v ? `$${varPath(v, nodes)}` : '$???';
      const lines: string[] = [];
      if (rb.label) lines.push(`${indent}${rb.label}`);
      for (const opt of rb.options) {
        lines.push(`${indent}<<radiobutton "${vname}" "${opt.value}" autocheck>> ${opt.label}`);
      }
      const rbSettings = project?.settings;
      const rbExtra = rbSettings ? simpleBlockCascadeClasses(rb, rbSettings) : [];
      const rbBindKey = rbSettings ? simpleBlockDataStyleBind(rb, rbSettings) : '';
      const rbBindAttr = rbBindKey ? ` data-style-bind="${rbBindKey}"` : '';
      const rbSpotStyle = buildSimpleBlockSpotStyleBlock(rb);
      const rbSpotPrefix = rbSpotStyle ? `${indent}${rbSpotStyle}\n` : '';
      const rbClasses = ['tg-radio', ...rbExtra].join(' ');
      return `${rbSpotPrefix}${indent}<div class="${rbClasses}"${rbBindAttr}>${lines.join('\n')}</div>`;
    }

    case 'popup': {
      const name = (idToName?.get(block.targetSceneId) ?? block.targetSceneId) || '???';
      const title = block.title ?? '';
      const settings = project?.settings;
      const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      // Drop the structural `tg-popup` base — it's only the cascade namespace.
      const dlgClasses = extra.join(' ').trim();
      const classArg = dlgClasses ? `, "${dlgClasses}"` : '';
      const spotStyle = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
      return `${spotPrefix}${indent}<<run Dialog.setup("${title}"${classArg}); Dialog.wiki(Story.get("${name}").processText()); Dialog.open();>>`;
    }

    case 'audio': {
      return emitAudioPlayback(block as AudioBlock, indent);
    }

    case 'audio-gen': {
      const ab = block as AudioGenBlock;
      // Draft (history/) takes are editor-only — never exported.
      // Approved (assets/) files use the same SugarCube playback pipeline as AudioBlock.
      if (!ab.src.startsWith('assets/')) return '';
      return emitAudioPlayback(ab, indent);
    }

    case 'container': {
      const cb = block as ContainerBlock;
      if (!cb.containerId) return `${indent}/* Container block: no container selected */`;
      const container = (project?.containers ?? []).find(c => c.id === cb.containerId);
      if (!container) return `${indent}/* Container block: container not found */`;
      const hero = chars.find(c => c.isHero);
      if (!hero) return `${indent}/* Container block: no main hero defined — set one in Characters tab */`;
      const heroVarName = hero.varName || hero.name.toLowerCase().replace(/\s+/g, '_');
      const titleArg = cb.title ? ` "${cb.title.replace(/"/g, '\\"')}"` : '';
      return `${indent}<<tgContainer "${container.varName}" "${heroVarName}"${titleArg}>>`;
    }

    case 'time-manipulation': {
      const tb = block as TimeManipulationBlock;
      const v = vars.find(x => x.id === tb.variableId);
      if (!v) return `${indent}/* Time manipulation: variable not found */`;
      const path = varPath(v, nodes);
      const delta = {
        years: tb.years || 0,
        months: tb.months || 0,
        days: tb.days || 0,
        hours: tb.hours || 0,
        minutes: tb.minutes || 0,
      };
      return `${indent}<<run tgAddTime("${path}", ${JSON.stringify(delta)})>>`;
    }

    case 'tabs': {
      if (block.tabs.length === 0) return '';
      // Control variable: user-bound number var, or auto-generated `$__tabs_<id>`.
      // Also compute the path WITHOUT the `$` prefix — runtime JS uses it via
      // `State.variables[<path>]` to read the value (handles nested dots).
      const ctrlInfo = (() => {
        const blockShortId = block.id.replace(/-/g, '');
        if (block.controlVariableId) {
          const v = vars.find(x => x.id === block.controlVariableId);
          if (v) {
            const p = varPath(v, nodes);
            return { ref: `$${p}`, path: p };
          }
        }
        const auto = `__tabs_${blockShortId}`;
        return { ref: `$${auto}`, path: auto };
      })();
      const ctrlVar = ctrlInfo.ref;
      const defaultIdx = block.defaultTabIndex ?? 0;
      // Cascade scope class — for the per-instance `<style>` block + class on the wrapper.
      const settings = project?.settings;
      const cascadeExtra = settings ? simpleBlockCascadeClasses(block, settings) : [];
      const spotStyle   = buildSimpleBlockSpotStyleBlock(block);
      const spotPrefix  = spotStyle ? `${indent}${spotStyle}\n` : '';
      const barClass    = ['tg-tabs-block', ...cascadeExtra].join(' ');
      // Tab buttons — each rendered as `<span data-idx="N"><<link ...>></span>` so the
      // runtime active-class JS can find them. Click sets ctrl var + Engine.show()
      // (re-renders main passage and triggers UIBar.update() automatically).
      const buttons = block.tabs.map((tab, i) =>
        `<span data-idx="${i}"><<link "${tab.label.replace(/"/g, '\\"')}">><<set ${ctrlVar} to ${i}>><<run Engine.show()>><</link>></span>`
      ).join('');
      const tabBar = `${indent}<div class="${barClass}" data-ctrl="${ctrlInfo.path}">${buttons}</div>`;
      // Lazy init: if ctrl var is undefined when first rendered, set it to defaultIdx.
      const init = `${indent}<<if ndef ${ctrlVar}>><<set ${ctrlVar} to ${defaultIdx}>><</if>>`;
      // Body: <<if>>/<<elseif>> chain rendering active tab's blocks.
      const bodies = block.tabs.map((tab, i) => {
        const kw = i === 0 ? '<<if' : '<<elseif';
        const inner = tab.blocks
          .map(b => blockToSC(b, chars, vars, nodes, indent + '  ', idToName, project))
          .filter(Boolean)
          .join('\n');
        return `${indent}${kw} ${ctrlVar} eq ${i}>>\n${inner}`;
      }).join('\n');
      return `${spotPrefix}${init}\n${tabBar}\n${bodies}\n${indent}<</if>>`;
    }

    case 'plugin': {
      const pb = block as PluginBlock;
      const def = getPluginDef(pb.pluginId);
      if (!def) return `${indent}<!-- plugin ${pb.pluginId} not found -->`;
      const setters = def.params
        .map((p) => `<<set _${p.key} to ${pluginValueLiteral(p, pb.values[p.key], idToName)}>>`)
        .join('');
      return `${indent}${setters}<<include "__plug_${def.id}">>`;
    }
  }
}

function branchToSC(
  branch: ConditionBranch,
  chars: Character[],
  vars: Variable[],
  nodes: VariableTreeNode[],
  indent: string,
  isFirst: boolean,
  idToName?: Map<string, string>,
  project?: Project,
): string {
  const innerLines = branch.blocks
    .map(b => blockToSC(b, chars, vars, nodes, indent + '  ', idToName, project))
    .join('\n');

  if (branch.branchType === 'else') {
    return `${indent}<<else>>\n${innerLines}`;
  }

  // Raw expression escape-hatch — used when import couldn't structurally
  // parse the condition (compound or-chains, LHS expressions, function calls).
  // Emits the SC expression verbatim.
  if (branch.rawExpression !== undefined && branch.rawExpression !== '') {
    const expr = branch.rawExpression;
    if (branch.branchType === 'if' || isFirst) {
      return `${indent}<<if ${expr}>>\n${innerLines}`;
    }
    return `${indent}<<elseif ${expr}>>\n${innerLines}`;
  }

  // Plugin param virtual variables: branch.variableId starts with 'param:'.
  // Emit directly as a temp-var reference (_key) without going through the
  // project variable tree — scene kind params are excluded from paramVars.
  if (branch.variableId?.startsWith('param:')) {
    const paramKey = branch.variableId.slice('param:'.length);
    const varName  = `_${paramKey}`;
    let val = branch.value;
    // We don't know the param's runtime type here, so quote the value only
    // when it isn't already a SC expression ($...) or temp-var (_...).
    if (!val.startsWith('$') && !val.startsWith('_') && isNaN(Number(val)) && val !== 'true' && val !== 'false') {
      val = `"${val}"`;
    }
    const expr = `${varName} ${branch.operator} ${val}`;
    if (branch.branchType === 'if' || isFirst) {
      return `${indent}<<if ${expr}>>\n${innerLines}`;
    }
    return `${indent}<<elseif ${expr}>>\n${innerLines}`;
  }

  const v = vars.find(x => x.id === branch.variableId);
  const vPath = v ? varPath(v, nodes) : 'unknown';
  const varName = `$${vPath}`;
  const acc = branch.accessor;
  const accessorKind = acc?.kind ?? 'whole';

  let expr: string;
  if (branch.rangeMode) {
    const ref = (v?.varType === 'array' && accessorKind === 'length') ? `${varName}.length` : varName;
    const lo = branch.rangeMin ?? '0';
    const hi = branch.rangeMax ?? '0';
    expr = `${ref} >= ${lo} && ${ref} <= ${hi}`;
  } else if (v?.varType === 'array' && accessorKind === 'whole') {
    switch (branch.operator) {
      case 'contains':  expr = `${varName}.includes("${branch.value}")`; break;
      case '!contains': expr = `!${varName}.includes("${branch.value}")`; break;
      case 'empty':     expr = `${varName}.length === 0`; break;
      case '!empty':    expr = `${varName}.length > 0`; break;
      default: {
        const val = branch.value;
        expr = `${varName} ${branch.operator} ${val}`;
      }
    }
  } else if (v?.varType === 'array' && accessorKind === 'index') {
    const ref = varRefWithAccessor(vPath, acc, vars, nodes);
    expr = `${ref} ${branch.operator} "${branch.value}"`;
  } else if (v?.varType === 'array' && accessorKind === 'length') {
    expr = `${varName}.length ${branch.operator} ${branch.value}`;
  } else {
    let val = branch.value;
    // Quote only when the value is genuinely a string literal — not when it
    // looks like a SC reference (`$other` / `_tempVar`) or a JS literal
    // (number / true / false). Mirrors the plugin-param heuristic above so
    // `<<if $x != _name>>` rebuilds verbatim instead of `_name` becoming a
    // literal string `"_name"`.
    const looksLikeRef = /^[_$][A-Za-z_$][\w$.]*$/.test(val);
    const looksLikeLiteral = /^-?\d+(\.\d+)?$/.test(val) || val === 'true' || val === 'false';
    if ((v?.varType === 'string' || v?.varType === 'datetime') && !looksLikeRef && !looksLikeLiteral) {
      val = `"${val}"`;
    }
    expr = `${varName} ${branch.operator} ${val}`;
  }

  if (branch.branchType === 'if' || isFirst) {
    return `${indent}<<if ${expr}>>\n${innerLines}`;
  }
  return `${indent}<<elseif ${expr}>>\n${innerLines}`;
}

// ─── Progress bar → SugarCube markup ─────────────────────────────────────────
//
// Uses pure TwineScript: <<set _tgP to ...>> stores the percentage, then
// <<print '...' + _tgP + '...'>> outputs the HTML string inline.
// TwineScript supports Math.min/max/round, $story vars, _temp vars, and +.
// It does NOT support `function`, `var`, `return`, or IIFEs.
// <<script>>output.wiki()<</script>> also fails — `output` is a plain DOM node.

function buildProgressBarSC(c: ProgressBlock, vars: Variable[], nodes: VariableTreeNode[]): string {
  const v = vars.find(x => x.id === c.variableId);
  const vname = v ? varPath(v, nodes) : '???';
  const sv = `$${vname}`;  // TwineScript story variable
  const emptyColor = c.emptyColor ?? '#333';

  // Percentage stored in TwineScript temp var _tgP
  const setPct = `<<set _tgP to Math.min(100,Math.max(0,${sv}/${c.maxValue}*100))>>`;

  // Fill color — either a literal or interpolated into _tgC
  let setColor = '';
  let colorRef: string;
  const cr = c.colorRange;
  if (cr?.from && cr?.to && /^#[0-9a-fA-F]{6}$/.test(cr.from) && /^#[0-9a-fA-F]{6}$/.test(cr.to)) {
    const fr = parseInt(cr.from.slice(1, 3), 16), fg = parseInt(cr.from.slice(3, 5), 16), fb = parseInt(cr.from.slice(5, 7), 16);
    const tr = parseInt(cr.to.slice(1, 3), 16),   tg = parseInt(cr.to.slice(3, 5), 16),   tb = parseInt(cr.to.slice(5, 7), 16);
    setColor = `<<set _tgC to 'rgb('+Math.round(${fr}+(${tr-fr})*_tgP/100)+','+Math.round(${fg}+(${tg-fg})*_tgP/100)+','+Math.round(${fb}+(${tb-fb})*_tgP/100)+')'>>`;
    colorRef = '_tgC';
  } else {
    colorRef = `'${c.color}'`;
  }

  // Text label (raw variable value / maxValue)
  const textRef = c.showText ? `${sv}+'/${c.maxValue}'` : "''";
  const vert = c.vertical ?? false;

  {
    // CSS classes handle layout; colors via CSS custom properties
    const textColorVar = c.textColor ? `;--tg-bar-text:${c.textColor}` : '';
    const vertClass = vert ? ' tg-progress-vert' : '';
    const printExpr = vert
      ? `'<span class="tg-progress${vertClass}" style="--tg-bar-empty:${emptyColor};--tg-bar-fill:'+${colorRef}+'${textColorVar}">'` +
        `+'<span class="tg-bar" style="height:'+_tgP+'%;width:100%">'+${textRef}+'</span></span>'`
      : `'<span class="tg-progress${vertClass}" style="--tg-bar-empty:${emptyColor};--tg-bar-fill:'+${colorRef}+'${textColorVar}">'` +
        `+'<span class="tg-bar" style="width:'+_tgP+'%">'+${textRef}+'</span></span>'`;
    return `${setPct}${setColor}<<print ${printExpr}>>`;
  }
}

// ─── Audio-volume block: master-volume slider + optional mute toggle ─────────
//
// Plain HTML <input type="range"> with inline handlers (NO <<print>> inside
// attributes — SugarCube misparses `>>`). A deferred <<script>> seeds the slider
// from the saved $__tgMasterVol once the DOM node exists. DOM ids derive from the
// block id so multiple sliders on one passage don't collide.

function buildAudioVolumeBlockSC(b: AudioVolumeBlock): string {
  const id = `tgvol${b.id.replace(/-/g, '').substring(0, 12)}`;
  const muteId = `${id}m`;
  const slider =
    `<input id="${id}" type="range" min="0" max="100" value="100" style="flex:1;min-width:0" ` +
    `oninput="var x=this.value/100;SugarCube.SimpleAudio.volume(x);SugarCube.State.variables.__tgMasterVol=x;` +
    `document.querySelectorAll('video').forEach(function(el){el.volume=x;})" />`;
  const mute = b.showMuteButton
    ? `<button id="${muteId}" onclick="var S=SugarCube.SimpleAudio;S.mute(!S.mute());` +
      `this.textContent=S.mute()?String.fromCodePoint(0x1F507):String.fromCodePoint(0x1F50A)" ` +
      `style="border:none;background:none;cursor:pointer;font-size:1.2em">&#x1F50A;</button>`
    : '';
  const initScript = [
    '<<script>>',
    'setTimeout(function(){',
    '  var v=State.variables.__tgMasterVol;',
    `  var s=document.getElementById("${id}");`,
    '  if(s&&v!=null)s.value=Math.round(v*100);',
    b.showMuteButton
      ? `  var m=document.getElementById("${muteId}");if(m)m.textContent=SugarCube.SimpleAudio.mute()?String.fromCodePoint(0x1F507):String.fromCodePoint(0x1F50A);`
      : '',
    '},0);',
    '<</script>>',
  ].filter(Boolean).join('');
  return `<span class="tg-audio-volume" style="display:flex;align-items:center;gap:6px;width:100%">${mute}${slider}</span>${initScript}`;
}

// ─── Date-Time logic ─────────────────────────────────────────────────────────

function buildDateTimeCellSC(c: DateTimeBlock, vname: string): string {
  const mode: DateTimeDisplayMode = c.displayMode ?? 'text';
  const pre = c.prefix ?? '';
  const suf = c.suffix ?? '';

  let inner: string;
  if (mode === 'clock')             inner = `<<print tgRenderClock(${vname})>>`;
  else if (mode === 'digital')      inner = `<<print tgRenderDigital(${vname})>>`;
  else if (mode === 'calendar')     inner = `<<print tgRenderCalendar(${vname})>>`;
  else if (mode === 'clock-calendar')   inner = `<<print tgRenderClockCalendar(${vname})>>`;
  else if (mode === 'digital-calendar') inner = `<<print tgRenderDigitalCalendar(${vname})>>`;
  else inner = `<<print tgFormatDate(${vname}, "${c.format || 'DD.MM.YYYY HH:mm'}")>>`;

  return `<span style="display:flex;justify-content:center;align-items:center;width:100%;flex-wrap:wrap">${pre}${inner}${suf}</span>`;
}

export function buildDateTimeScript(): string {
  return [
    '// ── Date-Time Utils ──',
    'window.tgAddTime = function(varPath, delta) {',
    '  var parts = varPath.split(".");',
    '  var obj = State.variables;',
    '  for (var i = 0; i < parts.length - 1; i++) { obj = obj[parts[i]]; }',
    '  var key = parts[parts.length - 1];',
    '  var val = obj[key];',
    '',
    '  var date = new Date(String(val).replace(" ", "T"));',
    '  if (isNaN(date.getTime())) return;',
    '',
    '  if (delta.minutes) date.setMinutes(date.getMinutes() + delta.minutes);',
    '  if (delta.hours)   date.setHours(date.getHours() + delta.hours);',
    '  if (delta.days)    date.setDate(date.getDate() + delta.days);',
    '  if (delta.months)  date.setMonth(date.getMonth() + delta.months);',
    '  if (delta.years)   date.setFullYear(date.getFullYear() + delta.years);',
    '',
    '  var pad = function(n) { return n < 10 ? "0" + n : n; };',
    '  obj[key] = date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());',
    '};',
    '',
    'window.tgFormatDate = function(val, format) {',
    '  var date = new Date(String(val).replace(" ", "T"));',
    '  if (isNaN(date.getTime())) return val;',
    '  var DAYS_L  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];',
    '  var DAYS_S  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];',
    '  var MONS_L  = ["January","February","March","April","May","June","July","August","September","October","November","December"];',
    '  var MONS_S  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];',
    '  var o = {',
    '    "dddd": DAYS_L[date.getDay()],',
    '    "ddd":  DAYS_S[date.getDay()],',
    '    "MMMM": MONS_L[date.getMonth()],',
    '    "MMM":  MONS_S[date.getMonth()],',
    '    "DD":   ("0" + date.getDate()).slice(-2),',
    '    "MM":   ("0" + (date.getMonth() + 1)).slice(-2),',
    '    "YYYY": String(date.getFullYear()),',
    '    "HH":   ("0" + date.getHours()).slice(-2),',
    '    "mm":   ("0" + date.getMinutes()).slice(-2)',
    '  };',
    '  return format.replace(/dddd|ddd|MMMM|MMM|DD|MM|YYYY|HH|mm/g, function(m) { return o[m]; });',
    '};',
    '',
    'window.tgRenderClock = function(val) {',
    '  var date = new Date(String(val).replace(" ", "T"));',
    '  if (isNaN(date.getTime())) return String(val);',
    '  var h = date.getHours() % 12 + date.getMinutes() / 60;',
    '  var m = date.getMinutes();',
    '  var PI = Math.PI;',
    '  var toR = function(deg) { return deg * PI / 180; };',
    '  var hA = toR(h / 12 * 360 - 90);',
    '  var mA = toR(m / 60 * 360 - 90);',
    '  var fx = function(r, a) { return (50 + r * Math.cos(a)).toFixed(1); };',
    '  var fy = function(r, a) { return (50 + r * Math.sin(a)).toFixed(1); };',
    '  var marks = "";',
    '  for (var i = 0; i < 12; i++) {',
    '    var a = toR(i / 12 * 360 - 90);',
    '    marks += \'<line x1="\' + fx(43,a) + \'" y1="\' + fy(43,a) + \'" x2="\' + fx(48,a) + \'" y2="\' + fy(48,a) + \'" stroke="currentColor" stroke-width="2"/>\';',
    '  }',
    '  return \'<svg viewBox="0 0 100 100" width="60" height="60" style="display:inline-block;vertical-align:middle">\' +',
    '    \'<circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" stroke-width="1.5"/>\' +',
    '    marks +',
    '    \'<line x1="50" y1="50" x2="\' + fx(30,hA) + \'" y2="\' + fy(30,hA) + \'" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>\' +',
    '    \'<line x1="50" y1="50" x2="\' + fx(40,mA) + \'" y2="\' + fy(40,mA) + \'" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>\' +',
    '    \'<circle cx="50" cy="50" r="3" fill="currentColor"/>\' +',
    '    \'</svg>\';',
    '};',
    '',
    'window.tgRenderDigital = function(val) {',
    '  var date = new Date(String(val).replace(" ", "T"));',
    '  if (isNaN(date.getTime())) return String(val);',
    '  var pad = function(n) { return ("0" + n).slice(-2); };',
    '  return \'<span style="font-family:monospace;font-size:1.4em;letter-spacing:0.05em;display:inline-block;background:rgba(0,0,0,0.35);padding:2px 8px;border-radius:4px">\' + pad(date.getHours()) + \':\' + pad(date.getMinutes()) + \'</span>\';',
    '};',
    '',
    'window.tgRenderCalendar = function(val) {',
    '  var date = new Date(String(val).replace(" ", "T"));',
    '  if (isNaN(date.getTime())) return String(val);',
    '  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];',
    '  var DAYS   = ["Mo","Tu","We","Th","Fr","Sa","Su"];',
    '  var yr = date.getFullYear(), mo = date.getMonth(), dy = date.getDate();',
    '  var first = (new Date(yr, mo, 1).getDay() + 6) % 7;',
    '  var total = new Date(yr, mo + 1, 0).getDate();',
    '  var s = \'<table style="border-collapse:collapse;font-size:0.78em;display:inline-table;vertical-align:middle">\';',
    '  s += \'<caption style="text-align:center;padding-bottom:2px;font-weight:bold">\' + MONTHS[mo] + " " + yr + \'</caption><thead><tr>\';',
    '  for (var d = 0; d < 7; d++) s += \'<th style="padding:1px 3px;text-align:center;opacity:0.6">\' + DAYS[d] + \'</th>\';',
    '  s += \'</tr></thead><tbody><tr>\';',
    '  for (var i = 0; i < first; i++) s += \'<td></td>\';',
    '  for (var i = 1; i <= total; i++) {',
    '    if ((i + first - 1) % 7 === 0 && i > 1) s += \'</tr><tr>\';',
    '    var cur = (i === dy);',
    '    s += \'<td style="padding:1px 3px;text-align:center\' + (cur ? ";font-weight:bold;outline:1px solid currentColor;border-radius:50%" : "") + \'">\' + i + \'</td>\';',
    '  }',
    '  s += \'</tr></tbody></table>\';',
    '  return s;',
    '};',
    '',
    'window.tgRenderClockCalendar = function(val) {',
    '  return \'<span style="display:inline-flex;align-items:center;gap:8px">\' + window.tgRenderClock(val) + window.tgRenderCalendar(val) + \'</span>\';',
    '};',
    '',
    'window.tgRenderDigitalCalendar = function(val) {',
    '  return \'<span style="display:inline-flex;flex-direction:column;align-items:center;gap:4px">\' + window.tgRenderCalendar(val) + window.tgRenderDigital(val) + \'</span>\';',
    '};',
  ].join('\n');
}

// ─── Table block → inline HTML (fully self-contained, no class deps) ──────────

function tableCellInnerToSC(cell: SidebarCell, chars: Character[], vars: Variable[], nodes: VariableTreeNode[], idToName?: Map<string, string>, project?: Project): string {
  // A cell is a mini block-list — render each block through the standard pipeline.
  // Joined with '' (no newlines) to avoid SugarCube inserting <p> between siblings.
  return cell.blocks
    .map(b => blockToSC(b, chars, vars, nodes, '', idToName, project))
    .filter(Boolean)
    .join('');
}

function tableBlockToSC(block: TableBlock, chars: Character[], vars: Variable[], nodes: VariableTreeNode[], indent = '', idToName?: Map<string, string>, project?: Project): string {
  if (block.rows.length === 0) return '';
  const s = block.style;

  // CSS custom properties for user-overridable values; structural layout handled by .tg-table class
  const outerStyles: string[] = [
    `--tg-tbl-gap:${s.rowGap}px`,
    `--tg-tbl-border-color:${s.borderColor}`,
    `--tg-tbl-border-width:${s.borderWidth}px`,
  ];
  if (s.showOuterBorder) {
    outerStyles.push(
      `border:var(--tg-tbl-border-width) solid var(--tg-tbl-border-color)`,
      `padding:2px`,
    );
  }

  const rowsHTML = block.rows.map(row => {
    if (row.cells.length === 0) return '';
    const rowParts = [
      'display:flex', 'overflow:hidden', 'align-items:stretch', 'margin:0',
      `height:${row.height}px`,
    ];
    if (s.showRowBorders) {
      rowParts.push(`border:var(--tg-tbl-border-width) solid var(--tg-tbl-border-color)`);
    }
    const cellsHTML = row.cells.map((cell, ci) => {
      const cellParts = [
        `flex:${cell.width}`, 'display:flex', 'align-items:center', 'overflow:hidden',
        'font-size:0.85em', 'min-width:0', 'box-sizing:border-box', 'padding:2px 4px',
      ];
      if (s.showCellBorders && ci > 0) {
        cellParts.push(`border-left:var(--tg-tbl-border-width) solid var(--tg-tbl-border-color)`);
      }
      return `<span style="${cellParts.join(';')}">${tableCellInnerToSC(cell, chars, vars, nodes, idToName, project)}</span>`;
    }).join('');
    return `<div style="${rowParts.join(';')}">${cellsHTML}</div>`;
  }).filter(Boolean).join('');

  if (!rowsHTML) return '';
  return `${indent}<div class="tg-table" style="${outerStyles.join(';')}">${rowsHTML}</div>`;
}

// ─── Recursive walker: detect TableBlock with audio-volume / image cells ──────

/** True when any descendant block is an AudioVolumeBlock (incl. inside table
 *  cells). Used to decide whether to emit master-volume init. */
export function hasAudioVolumeCell(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.type === 'audio-volume') return true;
    if (b.type === 'table') return b.rows.some(r => r.cells.some(c => hasAudioVolumeCell(c.blocks)));
    if (b.type === 'condition') return b.branches.some(br => hasAudioVolumeCell(br.blocks));
    if (b.type === 'dialogue' && b.innerBlocks) return hasAudioVolumeCell(b.innerBlocks);
    if (b.type === 'tabs') return b.tabs.some(tab => hasAudioVolumeCell(tab.blocks));
    if (b.type === 'section') return hasAudioVolumeCell(b.blocks);
    return false;
  });
}

/** True when any descendant block is an image / image-gen block (incl. inside
 *  table cells). Used to gate emission of lightbox CSS + tgOpenLightbox global. */
function hasImageCell(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.type === 'image' || b.type === 'image-gen') return true;
    if (b.type === 'table') return b.rows.some(r => r.cells.some(c => hasImageCell(c.blocks)));
    if (b.type === 'condition') return b.branches.some(br => hasImageCell(br.blocks));
    if (b.type === 'dialogue' && b.innerBlocks) return hasImageCell(b.innerBlocks);
    if (b.type === 'tabs') return b.tabs.some(tab => hasImageCell(tab.blocks));
    if (b.type === 'section') return hasImageCell(b.blocks);
    return false;
  });
}


/**
 * Build CSS + JS overrides from a sidebar-scene's `systemConfig`.
 * Returns empty strings when scene is null or has no relevant config.
 * Used by both `.twee` and HTML export.
 */
export function buildSidebarSystemConfigOutput(
  sidebarScene: Scene | undefined,
  vars?: Variable[],
  nodes?: VariableTreeNode[],
): { css: string; script: string } {
  const cfg = (sidebarScene?.systemConfig && sidebarScene.systemConfig.kind === 'sidebar')
    ? sidebarScene.systemConfig
    : null;
  if (!cfg) return { css: '', script: '' };

  // ── Helpers ─────────────────────────────────────────────────────────────
  // A value is "bound" when it's an object `{ variableId }`. Otherwise it's
  // static (or undefined for default behavior).
  const isBound = (v: unknown): v is { variableId: string } =>
    typeof v === 'object' && v !== null && 'variableId' in (v as Record<string, unknown>);
  const jsVarAccess = (id: string): string | null => {
    if (!vars || !nodes) return null;
    const v = vars.find(x => x.id === id);
    if (!v) return null;
    return `State.variables.${varPath(v, nodes)}`;  // e.g. State.variables.chars.hero.canSave
  };
  const boundAccess = (val: unknown): string | null => {
    if (!isBound(val)) return null;
    return jsVarAccess(val.variableId);
  };

  const rules: string[] = [];           // static CSS
  const syncBody: string[] = [];        // body of _tgSyncSidebar() — runtime updates
  const initLines: string[] = [];       // run-once startup (Config.ui.*, Config.saves.*)

  // ── hidden — static or bound bool ────────────────────────────────────────
  if (cfg.hidden === true) {
    rules.push('#ui-bar { display: none !important; }');
    rules.push('#story { margin-left: 0 !important; margin-right: 0 !important; }');
  } else if (isBound(cfg.hidden)) {
    const access = boundAccess(cfg.hidden);
    if (access) {
      rules.push('body.tg-sidebar-hidden #ui-bar { display: none !important; }');
      rules.push('body.tg-sidebar-hidden #story  { margin-left: 0 !important; margin-right: 0 !important; }');
      syncBody.push(`document.body.classList.toggle('tg-sidebar-hidden', !!${access});`);
    }
  }

  // ── width + position — static rules unless either is bound ──────────────
  const widthStatic    = (typeof cfg.width === 'number' && cfg.width > 0) ? cfg.width : null;
  const widthBound     = isBound(cfg.width) ? boundAccess(cfg.width) : null;
  const widthUnit      = cfg.widthUnit ?? 'em';
  const positionStatic = (cfg.position === 'left' || cfg.position === 'right') ? cfg.position : null;
  const positionBound  = isBound(cfg.position) ? boundAccess(cfg.position) : null;

  if (widthStatic != null && !widthBound) {
    const w = `${widthStatic}${widthUnit}`;
    const sideMargin = positionStatic === 'right' ? 'margin-right' : 'margin-left';
    rules.push(`#ui-bar { width: ${w}; }`);
    rules.push(`#story { ${sideMargin}: ${w}; }`);
  }
  if (positionStatic === 'right' && !positionBound) {
    rules.push('#ui-bar { left: auto; right: 0; }');
    if (widthStatic == null) {
      rules.push('#story { margin-left: 0; margin-right: 17.5em; }');
    } else {
      rules.push('#story { margin-left: 0; }');
    }
  }
  if (widthBound || positionBound) {
    // Dynamic width/position — read both at runtime and apply combined inline styles
    const wExpr = widthBound ?? (widthStatic != null ? String(widthStatic) : 'null');
    const pExpr = positionBound ?? (positionStatic ? `"${positionStatic}"` : '"left"');
    syncBody.push(
      `(function() { var w = ${wExpr}, p = ${pExpr};` +
      ` var bar = document.getElementById('ui-bar');` +
      ` var story = document.getElementById('story');` +
      ` if (!bar || !story) return;` +
      ` var wStr = (typeof w === 'number' && w > 0) ? (w + '${widthUnit}') : '';` +
      ` var right = (p === 'right');` +
      ` bar.style.width = wStr;` +
      ` bar.style.left  = right ? 'auto' : '';` +
      ` bar.style.right = right ? '0'    : '';` +
      ` story.style.marginLeft  = right ? '0' : (wStr || '');` +
      ` story.style.marginRight = right ? (wStr || '17.5em') : '';` +
      ` })();`
    );
  }

  // ── bgColor ─────────────────────────────────────────────────────────────
  if (typeof cfg.bgColor === 'string' && cfg.bgColor) {
    rules.push(`#ui-bar { background: ${cfg.bgColor}; }`);
  } else if (isBound(cfg.bgColor)) {
    const access = boundAccess(cfg.bgColor);
    if (access) {
      syncBody.push(
        `(function() { var c = ${access}; var bar = document.getElementById('ui-bar');` +
        ` if (bar) bar.style.background = (typeof c === 'string' ? c : ''); })();`
      );
    }
  }

  // ── allowCollapse ───────────────────────────────────────────────────────
  if (cfg.allowCollapse === false) {
    rules.push('#ui-bar-toggle { display: none !important; }');
  } else if (isBound(cfg.allowCollapse)) {
    const access = boundAccess(cfg.allowCollapse);
    if (access) {
      rules.push('body.tg-no-collapse #ui-bar-toggle { display: none !important; }');
      syncBody.push(`document.body.classList.toggle('tg-no-collapse', !${access});`);
    }
  }

  // ── initiallyCollapsed — startup only (Config.ui is not reactive) ───────
  // For STATIC `true`: emit `Config.ui.stowBarInitially = true` at script load
  //   — SugarCube reads it during UIBar construction.
  // For BOUND: cannot read State.variables at script load (StoryInit hasn't
  //   run yet → `State.variables.sidePanel` is undefined and access throws).
  //   Defer to `:storyready` and call `UIBar.stow()` if the variable is truthy.
  if (cfg.initiallyCollapsed === true) {
    initLines.push('Config.ui.stowBarInitially = true;');
  } else if (isBound(cfg.initiallyCollapsed)) {
    const access = boundAccess(cfg.initiallyCollapsed);
    if (access) {
      initLines.push(`$(document).one(':storyready', function() { if (${access}) UIBar.stow(); });`);
    }
  }

  // ── historyControls ─────────────────────────────────────────────────────
  const historySelectors = '#history-jumpto, #history-backward, #history-forward';
  if (cfg.historyControls === false) {
    initLines.push('Config.history.controls = false;');
    rules.push(`${historySelectors} { display: none !important; }`);
  } else if (isBound(cfg.historyControls)) {
    const access = boundAccess(cfg.historyControls);
    if (access) {
      rules.push(`body.tg-no-history ${historySelectors} { display: none !important; }`);
      syncBody.push(`document.body.classList.toggle('tg-no-history', !${access});`);
    }
  }

  // ── saveLoadMenu ────────────────────────────────────────────────────────
  const savesSelectors = '#menu-item-saves';
  if (cfg.saveLoadMenu === false) {
    initLines.push('Config.saves.isAllowed = function() { return false; };');
    rules.push(`${savesSelectors} { display: none !important; }`);
  } else if (isBound(cfg.saveLoadMenu)) {
    const access = boundAccess(cfg.saveLoadMenu);
    if (access) {
      // SugarCube calls Config.saves.isAllowed dynamically at save-time → bind directly
      initLines.push(`Config.saves.isAllowed = function() { return !!${access}; };`);
      rules.push(`body.tg-no-saves ${savesSelectors} { display: none !important; }`);
      syncBody.push(`document.body.classList.toggle('tg-no-saves', !${access});`);
    }
  }

  // ── textColor — static or bound ──────────────────────────────────────────
  if (typeof cfg.textColor === 'string' && cfg.textColor) {
    rules.push(`#ui-bar { color: ${cfg.textColor}; }`);
  } else if (isBound(cfg.textColor)) {
    const access = boundAccess(cfg.textColor);
    if (access) {
      syncBody.push(
        `(function() { var c = ${access}; var bar = document.getElementById('ui-bar');` +
        ` if (bar) bar.style.color = (typeof c === 'string' ? c : ''); })();`
      );
    }
  }

  // ── fontFamily — static only ─────────────────────────────────────────────
  if (typeof cfg.fontFamily === 'string' && cfg.fontFamily.trim()) {
    rules.push(`#ui-bar { font-family: ${cfg.fontFamily.trim()}; }`);
  }

  // ── fontSize — static or bound (unit em/px) ──────────────────────────────
  const fontUnit = cfg.fontSizeUnit ?? 'em';
  if (typeof cfg.fontSize === 'number' && cfg.fontSize > 0) {
    rules.push(`#ui-bar { font-size: ${cfg.fontSize}${fontUnit}; }`);
  } else if (isBound(cfg.fontSize)) {
    const access = boundAccess(cfg.fontSize);
    if (access) {
      syncBody.push(
        `(function() { var n = ${access}; var bar = document.getElementById('ui-bar');` +
        ` if (bar) bar.style.fontSize = (typeof n === 'number' && n > 0 ? n + '${fontUnit}' : ''); })();`
      );
    }
  }

  // ── padding — static or bound (px), applied to #ui-bar-body ──────────────
  if (typeof cfg.padding === 'number' && cfg.padding >= 0) {
    rules.push(`#ui-bar-body { padding: ${cfg.padding}px; }`);
  } else if (isBound(cfg.padding)) {
    const access = boundAccess(cfg.padding);
    if (access) {
      syncBody.push(
        `(function() { var n = ${access}; var b = document.getElementById('ui-bar-body');` +
        ` if (b) b.style.padding = (typeof n === 'number' && n >= 0 ? n + 'px' : ''); })();`
      );
    }
  }

  // ── blockGap — vertical spacing between StoryCaption blocks (px) ──────────
  // Uses a sibling-margin rule reading a CSS var, so bound updates only need to
  // set the var (no layout-model change).
  if (typeof cfg.blockGap === 'number' && cfg.blockGap >= 0) {
    rules.push(`#story-caption > * + * { margin-top: ${cfg.blockGap}px; }`);
  } else if (isBound(cfg.blockGap)) {
    const access = boundAccess(cfg.blockGap);
    if (access) {
      rules.push('#story-caption > * + * { margin-top: var(--tg-sb-gap, 0px); }');
      syncBody.push(
        `(function() { var n = ${access}; var c = document.getElementById('story-caption');` +
        ` if (c) c.style.setProperty('--tg-sb-gap', (typeof n === 'number' && n >= 0 ? n : 0) + 'px'); })();`
      );
    }
  }

  // ── Compose output ──────────────────────────────────────────────────────
  const scriptParts: string[] = [];
  if (initLines.length > 0) {
    scriptParts.push('// Sidebar systemConfig — startup');
    scriptParts.push(initLines.join('\n'));
  }
  if (syncBody.length > 0) {
    scriptParts.push(
      '// Sidebar systemConfig — runtime sync (re-runs on every passage render)',
      'window._tgSyncSidebar = function() {',
      ...syncBody.map(l => '  ' + l),
      '};',
      "$(document).on(':storyready :passagedisplay', window._tgSyncSidebar);",
    );
  }

  const css    = rules.length > 0 ? `/* Sidebar systemConfig */\n${rules.join('\n')}` : '';
  const script = scriptParts.length > 0 ? scriptParts.join('\n') : '';
  return { css, script };
}

/**
 * Wrap `passageReadyScript` and `passageDoneScript` from `ProjectSettings` as jQuery
 * handlers on SugarCube's `:passagestart` (≈ PassageReady) and `:passageend`
 * (≈ PassageDone) events. Returns empty string when both scripts are absent or blank.
 */
export function buildPassageLifecycleScript(settings: ProjectSettings | undefined): string {
  const ready = (settings?.passageReadyScript ?? '').trim();
  const done  = (settings?.passageDoneScript  ?? '').trim();
  if (!ready && !done) return '';
  const parts: string[] = [];
  if (ready) {
    parts.push(
      '// Passage ready (SugarCube ::PassageReady analogue) — runs on every :passagestart',
      '$(document).on(":passagestart", function(ev) {',
      ready,
      '});',
    );
  }
  if (done) {
    parts.push(
      '// Passage done (SugarCube ::PassageDone analogue) — runs on every :passageend',
      '$(document).on(":passageend", function(ev) {',
      done,
      '});',
    );
  }
  return parts.join('\n');
}

/**
 * CSS overrides from a title scene's `systemConfig` — `#story-title { color/font-family }`.
 * Returns empty string when scene is null or has no relevant config.
 * Used by both `.twee` and HTML export.
 */
export function buildTitleSystemConfigCSS(titleScene: Scene | undefined): string {
  const cfg = (titleScene?.systemConfig && titleScene.systemConfig.kind === 'title')
    ? titleScene.systemConfig
    : null;
  if (!cfg) return '';
  const props: string[] = [];
  if (cfg.textColor) props.push(`color: ${cfg.textColor}`);
  if (cfg.font)      props.push(`font-family: ${cfg.font}`);
  if (props.length === 0) return '';
  return `/* Title systemConfig */\n#story-title { ${props.join('; ')}; }`;
}

export function buildPurlSignatureScript(): string {
  return [
    '// Purl signature',
    '$(document).one(":storyready", function() {',
    '  var sig = document.createElement("div");',
    '  sig.style.cssText = "position:fixed;bottom:4px;left:0;width:var(--ui-bar-width,17.5em);text-align:center;font-size:0.65em;opacity:0.45;pointer-events:auto;z-index:50;";',
    '  sig.innerHTML = \'Made via <a href="https://purl.pp.ua" target="_blank" rel="noopener" style="color:inherit;">Purl</a>\';',
    '  document.body.appendChild(sig);',
    '});',
  ].join('\n');
}

/**
 * CSS for cell-level utilities shared between TableBlock and (former) panel:
 * progress bars (.tg-progress / .tg-bar), cell images (.tg-cell-img), and the
 * lightbox overlay (.tg-lb / #tg-lb-ov). Emitted only when needed.
 */
export function buildCellSharedCSS(scenes: Scene[]): string {
  const anyImage = scenes.some(s => hasImageCell(s.blocks));
  const anyTable = scenes.some(s => hasNestedTable(s.blocks));
  const anyProgress = scenes.some(s => hasNestedProgress(s.blocks));
  if (!anyTable && !anyImage && !anyProgress) return '';

  const lines: string[] = [
    '.tg-progress { width: 100%; height: 100%; background: var(--tg-bar-empty, #333); border-radius: 2px; overflow: hidden; display: flex; align-items: center; }',
    '.tg-progress-vert { flex-direction: column-reverse; align-items: stretch; }',
    '.tg-bar { height: 100%; background: var(--tg-bar-fill, #4a90d9); transition: width 0.3s, height 0.3s; display: flex; align-items: center; justify-content: center; font-size: 0.75em; color: var(--tg-bar-text, inherit); }',
  ];
  if (anyImage) {
    lines.push(
      '/* lightbox */',
      '.tg-lb { cursor: pointer !important; }',
      '#tg-lb-ov { display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.85); align-items: center; justify-content: center; cursor: zoom-out; }',
      '#tg-lb-ov.on { display: flex; }',
      '#tg-lb-ov img { max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 6px; box-shadow: 0 8px 48px rgba(0,0,0,.8); cursor: default; }',
      '#tg-lb-x { position: absolute; top: 12px; right: 18px; color: #fff; font-size: 2em; line-height: 1; cursor: pointer; opacity: .7; user-select: none; transition: opacity .15s; }',
      '#tg-lb-x:hover { opacity: 1; }',
    );
  }
  return lines.join('\n');
}

/** Recursive: does any descendant block contain a standalone ProgressBlock? */
function hasNestedProgress(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.type === 'progress') return true;
    if (b.type === 'table') return b.rows.some(r => r.cells.some(c => hasNestedProgress(c.blocks)));
    if (b.type === 'condition') return b.branches.some(br => hasNestedProgress(br.blocks));
    if (b.type === 'dialogue' && b.innerBlocks) return hasNestedProgress(b.innerBlocks);
    if (b.type === 'tabs') return b.tabs.some(tab => hasNestedProgress(tab.blocks));
    if (b.type === 'section') return hasNestedProgress(b.blocks);
    return false;
  });
}

/** Recursive: does any descendant block contain a SectionBlock? */
function hasNestedSections(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.type === 'section') return true;
    if (b.type === 'table') return b.rows.some(r => r.cells.some(c => hasNestedSections(c.blocks)));
    if (b.type === 'condition') return b.branches.some(br => hasNestedSections(br.blocks));
    if (b.type === 'dialogue' && b.innerBlocks) return hasNestedSections(b.innerBlocks);
    if (b.type === 'tabs') return b.tabs.some(tab => hasNestedSections(tab.blocks));
    return false;
  });
}

/** Base CSS for SectionBlock (`.tg-section` / `.tg-section-title`). Emitted whenever
 *  any scene contains a SectionBlock (top-level or nested). */
export function buildSectionCSS(scenes: Scene[]): string {
  if (!scenes.some(s => hasNestedSections(s.blocks))) return '';
  return [
    '.tg-section { margin: 6px 0; padding: 6px 8px; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; }',
    '.tg-section-title { font-weight: 600; font-size: 0.9em; opacity: 0.85; margin-bottom: 4px; }',
    'details.tg-section > summary.tg-section-title { cursor: pointer; user-select: none; list-style: revert; margin-bottom: 0; }',
    'details.tg-section[open] > summary.tg-section-title { margin-bottom: 4px; }',
  ].join('\n');
}

/** Recursive: does any descendant block contain a CalloutBlock? */
function hasCalloutBlock(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.type === 'callout') return true;
    if (b.type === 'table') return b.rows.some(r => r.cells.some(c => hasCalloutBlock(c.blocks)));
    if (b.type === 'condition') return b.branches.some(br => hasCalloutBlock(br.blocks));
    if (b.type === 'dialogue' && b.innerBlocks) return hasCalloutBlock(b.innerBlocks);
    if (b.type === 'tabs') return b.tabs.some(tab => hasCalloutBlock(tab.blocks));
    if (b.type === 'section') return hasCalloutBlock(b.blocks);
    return false;
  });
}

/** Base CSS for CalloutBlock (`.tg-callout` + per-variant accent). Emitted whenever
 *  any scene contains a CalloutBlock (top-level or nested). */
export function buildCalloutCSS(scenes: Scene[]): string {
  if (!scenes.some(s => hasCalloutBlock(s.blocks))) return '';
  return [
    '.tg-callout { display: flex; gap: 8px; margin: 8px 0; padding: 8px 10px; border-radius: 4px; border-left: 3px solid var(--tg-co-accent); background: var(--tg-co-bg); }',
    '.tg-callout-icon { flex-shrink: 0; font-size: 1.1em; line-height: 1.5; }',
    '.tg-callout-body { flex: 1; min-width: 0; }',
    '.tg-callout-title { font-weight: 600; margin-bottom: 2px; }',
    '.tg-callout-info    { --tg-co-accent: #3b82f6; --tg-co-bg: rgba(59,130,246,0.12); }',
    '.tg-callout-success { --tg-co-accent: #22c55e; --tg-co-bg: rgba(34,197,94,0.12); }',
    '.tg-callout-warning { --tg-co-accent: #f59e0b; --tg-co-bg: rgba(245,158,11,0.12); }',
    '.tg-callout-danger  { --tg-co-accent: #ef4444; --tg-co-bg: rgba(239,68,68,0.12); }',
    '.tg-callout-note    { --tg-co-accent: #94a3b8; --tg-co-bg: rgba(148,163,184,0.12); }',
  ].join('\n');
}

/** Recursive: does any descendant block contain a DisplayObjectBlock? */
function hasDisplayObject(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.type === 'display-object') return true;
    if (b.type === 'table') return b.rows.some(r => r.cells.some(c => hasDisplayObject(c.blocks)));
    if (b.type === 'condition') return b.branches.some(br => hasDisplayObject(br.blocks));
    if (b.type === 'dialogue' && b.innerBlocks) return hasDisplayObject(b.innerBlocks);
    if (b.type === 'tabs') return b.tabs.some(tab => hasDisplayObject(tab.blocks));
    if (b.type === 'section') return hasDisplayObject(b.blocks);
    return false;
  });
}

/** Structural CSS for DisplayObjectBlock — the six layout variants and
 *  sub-element defaults. Per-instance + project-wide colors come from the
 *  cascade system (`tg-do` is registered as a SimpleBlockType). */
export function buildDisplayObjectCSS(scenes: Scene[]): string {
  if (!scenes.some(s => hasDisplayObject(s.blocks))) return '';
  return [
    '/* DisplayObject — shared sub-elements */',
    '.tg-do { display: block; }',
    '.tg-do-row { display: flex; gap: 8px; align-items: baseline; }',
    '.tg-do-label { opacity: 0.75; }',
    '.tg-do-value { flex: 1; min-width: 0; }',
    '.tg-do-bar { display: inline-block; vertical-align: middle; width: 100%; height: 10px; background: rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden; }',
    '.tg-do-bar-fill { display: block; height: 100%; background: #4a90d9; transition: width 0.3s; }',
    '.tg-do-bar-text { font-size: 0.85em; opacity: 0.8; margin-left: 4px; white-space: nowrap; }',
    '.tg-do-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; background: rgba(255,255,255,0.1); font-size: 0.85em; }',
    '/* list — vertical rows, label left / value right */',
    '.tg-do-list { display: flex; flex-direction: column; gap: 4px; }',
    '.tg-do-list .tg-do-row { justify-content: space-between; }',
    '.tg-do-list .tg-do-value { flex: 0 1 auto; text-align: right; }',
    '/* inline — flowing label:value · label:value */',
    '.tg-do-inline { display: inline-flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }',
    '.tg-do-inline .tg-do-row { display: inline-flex; gap: 4px; }',
    '.tg-do-inline .tg-do-row:not(:last-child)::after { content: "·"; margin-left: 12px; opacity: 0.4; }',
    '/* table — two aligned columns via display:contents */',
    '.tg-do-table { display: grid; grid-template-columns: max-content 1fr; column-gap: 12px; row-gap: 4px; }',
    '.tg-do-table .tg-do-row { display: contents; }',
    '.tg-do-table .tg-do-label { text-align: right; }',
    '/* cards — boxed tiles */',
    '.tg-do-cards { display: flex; flex-wrap: wrap; gap: 8px; }',
    '.tg-do-cards .tg-do-row { flex-direction: column; align-items: center; padding: 6px 10px; border-radius: 5px; background: rgba(255,255,255,0.06); min-width: 60px; }',
    '.tg-do-cards .tg-do-label { font-size: 0.78em; opacity: 0.7; }',
    '.tg-do-cards .tg-do-value { font-size: 1.05em; flex: none; text-align: center; }',
    '/* grid — N configurable columns via --tg-do-cols */',
    '.tg-do-grid { display: grid; grid-template-columns: repeat(var(--tg-do-cols, 2), minmax(0, 1fr)); gap: 4px 12px; }',
    '.tg-do-grid .tg-do-row { justify-content: space-between; }',
    '/* bars — vertical list, each row is a labeled bar */',
    '.tg-do-bars { display: flex; flex-direction: column; gap: 6px; }',
    '.tg-do-bars .tg-do-row { flex-direction: column; align-items: stretch; gap: 2px; }',
    '.tg-do-bars .tg-do-label { font-size: 0.85em; }',
    '.tg-do-bars .tg-do-value { display: flex; align-items: center; gap: 6px; }',
  ].join('\n');
}

/** Base CSS for the TabsBlock tab bar (`.tg-tabs-block`). Emitted whenever any
 *  scene contains a TabsBlock (top-level or nested). Per-instance overrides come
 *  from the cascade system (`defaultBlockStyles.tabs` + `block.customStyle`). */
export function buildTabsBlockCSS(scenes: Scene[]): string {
  if (!scenes.some(s => hasNestedTabs(s.blocks))) return '';
  return [
    '.tg-tabs-block { display: flex; gap: 2px; margin-bottom: 6px; flex-wrap: wrap; }',
    '.tg-tabs-block > span { display: inline-flex; }',
    '.tg-tabs-block a { flex: 0 0 auto; padding: 3px 10px; border: 1px solid #555; border-radius: 3px; cursor: pointer; text-decoration: none; color: inherit; font-size: 0.85em; transition: background 0.15s; }',
    '.tg-tabs-block a:hover { background: rgba(255,255,255,0.1); }',
    '.tg-tabs-block a.tg-tabs-active { background: rgba(99,102,241,0.25); border-color: #818cf8; }',
  ].join('\n');
}

/** Runtime script: marks the active tab anchor in every tab bar by reading the
 *  control variable referenced by `data-ctrl`. Fires on `:storyready` and after
 *  every passage render. Emits empty string when there are no TabsBlocks. */
export function buildTabsBlockScript(scenes: Scene[]): string {
  if (!scenes.some(s => hasNestedTabs(s.blocks))) return '';
  return [
    '// Tabs — mark active anchor based on State.variables[data-ctrl]',
    'function _tgUpdateTabs() {',
    "  document.querySelectorAll('.tg-tabs-block[data-ctrl]').forEach(function(bar) {",
    "    var ctrl = bar.getAttribute('data-ctrl');",
    '    if (!ctrl) return;',
    "    var val = ctrl.split('.').reduce(function(o, k) { return o && o[k]; }, State.variables);",
    "    bar.querySelectorAll('[data-idx]').forEach(function(span) {",
    "      var a = span.querySelector('a');",
    "      if (a) a.classList.toggle('tg-tabs-active', Number(span.getAttribute('data-idx')) === val);",
    '    });',
    '  });',
    '}',
    "$(document).on(':storyready :passagedisplay', _tgUpdateTabs);",
  ].join('\n');
}

/** Recursive: does any descendant block contain a TabsBlock? */
function hasNestedTabs(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.type === 'tabs') return true;  // includes nested tabs — no need to recurse deeper here
    if (b.type === 'table') return b.rows.some(r => r.cells.some(c => hasNestedTabs(c.blocks)));
    if (b.type === 'section') return hasNestedTabs(b.blocks);
    if (b.type === 'condition') return b.branches.some(br => hasNestedTabs(br.blocks));
    if (b.type === 'dialogue' && b.innerBlocks) return hasNestedTabs(b.innerBlocks);
    return false;
  });
}

/** Recursive: does any descendant block of the given list contain a TableBlock? */
function hasNestedTable(blocks: Block[]): boolean {
  return blocks.some(b => {
    if (b.type === 'table') return true;
    if (b.type === 'condition') return b.branches.some(br => hasNestedTable(br.blocks));
    if (b.type === 'dialogue' && b.innerBlocks) return hasNestedTable(b.innerBlocks);
    if (b.type === 'tabs') return b.tabs.some(tab => hasNestedTable(tab.blocks));
    if (b.type === 'section') return hasNestedTable(b.blocks);
    return false;
  });
}

// ─── Lightbox script (tgOpenLightbox global) ─────────────────────────────────

export function buildLightboxScript(scenes: Scene[]): string {
  if (!scenes.some(s => hasImageCell(s.blocks))) return '';

  // Self-contained global `tgOpenLightbox` — the overlay is created lazily on
  // first call and reused afterwards.
  return [
    'window.tgOpenLightbox = function(src) {',
    "  var o = document.getElementById('tg-lb-ov');",
    '  if (!o) {',
    "    o = document.createElement('div');",
    "    o.id = 'tg-lb-ov';",
    "    o.innerHTML = '<span id=\"tg-lb-x\">✕</span><img id=\"tg-lb-img\">';",
    '    document.body.appendChild(o);',
    "    var cl = function() { o.classList.remove('on'); };",
    "    o.addEventListener('click', function(e) {",
    "      if (e.target === o || e.target.id === 'tg-lb-x') cl();",
    '    });',
    "    document.addEventListener('keydown', function(e) {",
    "      if (e.key === 'Escape') cl();",
    '    });',
    '  }',
    "  document.getElementById('tg-lb-img').src = src;",
    "  o.classList.add('on');",
    '};',
  ].join('\n');
}

// ─── Live-block helpers ───────────────────────────────────────────────────────

function hasLiveBlocks(blocks: Block[]): boolean {
  return blocks.some(b => {
    if ('live' in b && (b as { live?: boolean }).live) return true;
    if (b.type === 'table') return b.rows.some(r => r.cells.some(c => hasLiveBlocks(c.blocks)));
    if (b.type === 'condition') return b.branches.some(br => hasLiveBlocks(br.blocks));
    if (b.type === 'dialogue' && b.innerBlocks) return hasLiveBlocks(b.innerBlocks);
    if (b.type === 'tabs') return b.tabs.some(tab => hasLiveBlocks(tab.blocks));
    if (b.type === 'section') return hasLiveBlocks(b.blocks);
    return false;
  });
}

// ─── Watcher export ───────────────────────────────────────────────────────────

/** Convert a stored condition/action value string to a JS literal or State reference. */
function valueToJS(val: string, varType: string, vars: Variable[], nodes: VariableTreeNode[]): string {
  if (val.startsWith('$')) {
    const refName = val.slice(1);
    const refVar = vars.find(v => v.name === refName);
    if (refVar) return buildJSRef(varPath(refVar, nodes));
    return `State.variables[${JSON.stringify(refName)}]`;
  }
  if (varType === 'number') return val || '0';
  if (varType === 'boolean') return val === 'true' ? 'true' : 'false';
  return JSON.stringify(val);
}

/** Convert a WatcherCondition to a JS boolean expression. */
function conditionToJS(cond: WatcherCondition, vars: Variable[], nodes: VariableTreeNode[]): string {
  const v = vars.find(x => x.id === cond.variableId);
  if (!v) return 'false';

  let ref = buildJSRef(varPath(v, nodes));
  const accessorKind = cond.accessor?.kind ?? 'whole';
  if (cond.accessor?.kind === 'length') {
    ref += '.length';
  } else if (cond.accessor?.kind === 'index') {
    const src = cond.accessor.source;
    if (src.kind === 'literal') ref += `[${src.index}]`;
    else {
      const idxVar = vars.find(x => x.id === src.variableId);
      ref += `[${idxVar ? buildJSRef(varPath(idxVar, nodes)) : '0'}]`;
    }
  }

  if (v.varType === 'array' && accessorKind === 'whole') {
    switch (cond.operator) {
      case 'contains':  return `Array.isArray(${ref}) && ${ref}.indexOf(${JSON.stringify(cond.value)}) !== -1`;
      case '!contains': return `(!Array.isArray(${ref}) || ${ref}.indexOf(${JSON.stringify(cond.value)}) === -1)`;
      case 'empty':     return `Array.isArray(${ref}) && ${ref}.length === 0`;
      case '!empty':    return `Array.isArray(${ref}) && ${ref}.length > 0`;
    }
  }

  const valueType = (v.varType === 'array' && accessorKind === 'index') ? 'string' : v.varType;
  const valJS = valueToJS(cond.value, valueType, vars, nodes);
  switch (cond.operator) {
    case '==': return `${ref} == ${valJS}`;
    case '!=': return `${ref} != ${valJS}`;
    case '>':  return `${ref} > ${valJS}`;
    case '<':  return `${ref} < ${valJS}`;
    case '>=': return `${ref} >= ${valJS}`;
    case '<=': return `${ref} <= ${valJS}`;
    default:   return 'false';
  }
}

/** Convert a single ButtonAction to a JS statement for use in the watcher script. */
function actionToJS(a: ButtonAction, vars: Variable[], nodes: VariableTreeNode[], idToName?: Map<string, string>): string {
  if (a.type === 'open-popup') {
    const target = sceneTarget(a.targetSceneId ?? '', idToName);
    const title = a.title ?? '';
    return `Dialog.setup("${title}"); Dialog.wiki(Story.get(${target}).processText()); Dialog.open();`;
  }
  const v = vars.find(x => x.id === a.variableId);
  if (!v) return '';

  const ref = buildJSRef(varPath(v, nodes));

  if (v.varType === 'array') {
    const accessorKind = a.accessor?.kind ?? 'whole';
    if (accessorKind === 'index') {
      let arrRef = ref;
      if (a.accessor?.kind === 'index') {
        const src = a.accessor.source;
        if (src.kind === 'literal') arrRef += `[${src.index}]`;
        else {
          const idxVar = vars.find(x => x.id === src.variableId);
          arrRef += `[${idxVar ? buildJSRef(varPath(idxVar, nodes)) : '0'}]`;
        }
      }
      return `${arrRef} = ${JSON.stringify(a.value)};`;
    }
    switch (a.operator) {
      case 'push':   return `if (Array.isArray(${ref})) ${ref}.push(${JSON.stringify(a.value)});`;
      case 'remove': return `if (Array.isArray(${ref})) { var _i = ${ref}.indexOf(${JSON.stringify(a.value)}); if (_i !== -1) ${ref}.splice(_i, 1); }`;
      case 'clear':  return `if (Array.isArray(${ref})) ${ref}.length = 0;`;
      default:       return `${ref} = ${JSON.stringify(a.value)};`;
    }
  }

  const valJS = valueToJS(a.value, v.varType, vars, nodes);
  switch (a.operator) {
    case '=':  return `${ref} = ${valJS};`;
    case '+=': return `${ref} += ${valJS};`;
    case '-=': return `${ref} -= ${valJS};`;
    case '*=': return `${ref} *= ${valJS};`;
    case '/=': return `${ref} /= ${valJS};`;
    default:   return '';
  }
}

/**
 * Generates a global _tgCheckWatchers function and a :passagedisplay hook.
 * The function uses rising-edge semantics (fires only when condition
 * transitions false → true).  It is also callable from button actions
 * so watchers react to variable changes even without Engine.show().
 * Only included when the project has at least one enabled watcher.
 */
export function buildWatcherScript(watchers: Watcher[], vars: Variable[], nodes: VariableTreeNode[], idToName?: Map<string, string>): string {
  const active = watchers.filter(w => w.enabled);
  if (active.length === 0) return '';

  const lines: string[] = [];
  lines.push('/* TG: watchers — global check function + :passagedisplay hook */');
  lines.push('window._tgCheckWatchers = function() {');
  lines.push('  window._tgWPrev = window._tgWPrev || {};');
  lines.push('  if (!State || !State.variables) return;');

  for (const w of active) {
    const label = w.label ? ` // ${w.label}` : '';
    const actionLines = w.actions.map(a => actionToJS(a, vars, nodes, idToName)).filter(Boolean);

    let navLine = '';
    if (w.navigate?.type === 'scene' && w.navigate.sceneId) {
      const raw = w.navigate.sceneId;
      const navTarget = raw.startsWith('param:')
        ? `State.temporary["${raw.slice('param:'.length)}"]`
        : JSON.stringify(idToName?.get(raw) ?? raw);
      navLine = `    Engine.play(${navTarget});`;
    } else if (w.navigate?.type === 'back') {
      navLine = '    Engine.backward();';
    }

    if (actionLines.length === 0 && !navLine) continue;

    if (!w.condition.variableId) {
      // Unconditional: run on every check
      lines.push(`  (function() {${label}`);
      for (const al of actionLines) lines.push(`    ${al}`);
      if (navLine) { lines.push(navLine); lines.push('    return;'); }
      lines.push('  })();');
    } else {
      // Conditional: rising-edge (fires only when condition transitions false → true)
      const condExpr = conditionToJS(w.condition, vars, nodes);
      if (condExpr === 'false') continue;

      const idJS = JSON.stringify(w.id);
      lines.push(`  (function() {${label}`);
      lines.push(`    var _cond = !!(${condExpr});`);
      lines.push(`    var _prev = window._tgWPrev[${idJS}];`);
      lines.push(`    window._tgWPrev[${idJS}] = _cond;`);
      lines.push(`    if (!_cond || _prev) return;`);
      for (const al of actionLines) lines.push(`    ${al}`);
      if (navLine) {
        lines.push(navLine);
        lines.push('    return;');
      }
      lines.push('  })();');
    }
  }

  lines.push('};');
  lines.push('$(document).on(":passagedisplay", window._tgCheckWatchers);');
  return lines.join('\n');
}

/**
 * Generates a :passagedisplay/:passagehide pair that polls .tg-live[data-wiki]
 * spans every 200ms and re-wikifies them so live blocks stay in sync with
 * variable changes from buttons, function scenes, etc.
 * Only included when the project has at least one block with live: true.
 */
export function buildLiveScript(scenes: Scene[]): string {
  if (!scenes.some(s => hasLiveBlocks(s.blocks))) return '';
  return [
    '/* TG: periodic re-render of live blocks every 200ms */',
    '$(document).on(":passagedisplay", function() {',
    '  clearInterval(window._tgLiveTimer);',
    '  if ($(".tg-live[data-wiki]").length) {',
    '    window._tgLiveTimer = setInterval(function() {',
    '      $(".tg-live[data-wiki]").each(function() {',
    '        $(this).empty().wiki($(this).attr("data-wiki"));',
    '      });',
    '    }, 200);',
    '  }',
    '});',
    '$(document).on(":passagehide", function() {',
    '  clearInterval(window._tgLiveTimer);',
    '});',
  ].join('\n');
}

/**
 * Generates a debounced jQuery listener that calls UIBar.update() whenever
 * any <<textbox>> or <<numberbox>> in the passage changes.
 * Only included when the project has at least one input-field block.
 */
export function buildInputScript(scenes: Scene[]): string {
  function hasInput(blocks: Block[]): boolean {
    return blocks.some(b => {
      if (b.type === 'input-field') return true;
      if (b.type === 'table') return b.rows.some(r => r.cells.some(c => hasInput(c.blocks)));
      if (b.type === 'condition') return b.branches.some(br => hasInput(br.blocks));
      if (b.type === 'dialogue' && b.innerBlocks) return hasInput(b.innerBlocks);
      if (b.type === 'tabs') return b.tabs.some(tab => hasInput(tab.blocks));
      if (b.type === 'section') return hasInput(b.blocks);
      return false;
    });
  }
  if (!scenes.some(s => hasInput(s.blocks))) return '';

  // Helper snippet: re-render all tg-live spans using their stored wiki template.
  // Harmless when no live blocks exist — selector simply matches nothing.
  const refreshLive = "  $('.tg-live[data-wiki]').each(function() { $(this).empty().wiki($(this).attr('data-wiki')); });";

  return [
    '/* TG: auto-refresh sidebar + live blocks when textbox/numberbox values change */',
    '/* change fires on Enter / blur / stepper-arrow — the moment SugarCube commits the value */',
    '$(document).on("change.tg-inp", ".macro-textbox, .macro-numberbox", function() {',
    '  UIBar.update();',
    refreshLive,
    '});',
    '/* input fires on every keystroke — debounced for live block preview */',
    '$(document).on("input.tg-inp", ".macro-textbox, .macro-numberbox", (function() {',
    '  var t;',
    '  return function() {',
    '    clearTimeout(t);',
    '    t = setTimeout(function() {',
    '      UIBar.update();',
    refreshLive,
    '    }, 200);',
    '  };',
    '})());',
  ].join('\n');
}

// ─── Animation CSS ────────────────────────────────────────────────────────────
// Animations use CSS transitions triggered via inline JS (setTimeout 16ms) rather than
// CSS @keyframes, which are unreliable on elements inserted by SugarCube's <<timed>> macro.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildAnimationCSS(_scenes: Scene[]): string {
  return '';
}

// ─── Tooltip CSS ──────────────────────────────────────────────────────────────

export function buildTooltipCSS(): string {
  return [
    '.tg-tip { position: relative; border-bottom: 1px dotted currentColor; cursor: help; }',
    '.tg-tip .tg-tip-text { display: none; position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); background: #1a1a2e; color: #e2e8f0; padding: 6px 8px; border-radius: 4px; font-size: 0.85em; z-index: 100; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,.4); max-width: 240px; text-align: center; }',
    '.tg-tip:hover .tg-tip-text { display: block; }',
    '.tg-tip-img { display: block; max-width: 100%; height: auto; border-radius: 3px; margin-bottom: 4px; }',
    '.tg-tip-text .tg-tip-img:last-child { margin-bottom: 0; }',
  ].join('\n');
}

// ─── Button CSS ───────────────────────────────────────────────────────────────
// Button-family CSS emission now lives in styleCascade.ts:
//   - buildButtonsCascadeCss(scenes, settings)  — per-block Std + per-type Common
//   - buildButtonSpotStyleBlock(block)          — per-block Spot (inline <style>)

// ─── Audio helpers ──────────────────────────────────────────────────────────────

/** Union of block types that share the AudioBlock playback surface. */
type AudioLike = AudioBlock | AudioGenBlock;

/**
 * Emit the SugarCube playback macros for an AudioBlock or AudioGenBlock.
 * Shared between the two block-type cases so the playback pipeline lives in one
 * place (cacheaudio + audio play + stopOthers + cancellable delayed-start).
 */
function emitAudioPlayback(ab: AudioLike, indent: string): string {
  const trackId = `tga_${ab.id.replace(/-/g, '')}`;
  const vol = Math.round(ab.volume) / 100;

  const stopAllMacro = ab.stopOthers ? `<<audio ":all" stop>>` : '';

  // No source — only stop others (if requested), nothing to play.
  if (!ab.src) {
    return stopAllMacro ? `${indent}${stopAllMacro}` : '';
  }

  const parts: string[] = [];
  if (vol !== 1) parts.push(`volume ${vol}`);
  if (ab.loop) parts.push('loop');
  parts.push('play');
  const audioMacro = `<<audio "${trackId}" ${parts.join(' ')}>>`;

  if (ab.trigger === 'delay' && ab.triggerDelay && ab.triggerDelay > 0) {
    // stopOthers fires immediately; new audio starts after the delay.
    // Use cancellable setTimeout instead of <<timed>> so navigation away
    // before the delay fires won't still start audio on a different scene.
    const ms = Math.round(ab.triggerDelay * 1000);
    const chain = [
      vol !== 1 ? `.volume(${vol})` : '',
      ab.loop ? '.loop(true)' : '',
      '.play()',
    ].join('');
    const jsPlay = `var _tr=SugarCube.SimpleAudio.tracks.get("${trackId}");if(_tr){_tr${chain};}`;
    const jsTimer = `(window._tgDA=window._tgDA||[]).push(setTimeout(function(){${jsPlay}},${ms}));`;
    const timerMacro = `<<script>>${jsTimer}<</script>>`;
    return stopAllMacro
      ? `${indent}${stopAllMacro}\n${indent}${timerMacro}`
      : `${indent}${timerMacro}`;
  }

  return stopAllMacro
    ? `${indent}${stopAllMacro}\n${indent}${audioMacro}`
    : `${indent}${audioMacro}`;
}

/**
 * Collect all audio-playing blocks from all scenes (including nested inside conditions).
 * AudioGenBlock drafts (src not under assets/) are skipped — only approved takes
 * participate in the SugarCube export.
 */
function collectAudioBlocks(scenes: Scene[]): { block: AudioLike; sceneName: string }[] {
  const result: { block: AudioLike; sceneName: string }[] = [];
  function walk(blocks: Block[], sceneName: string) {
    for (const b of blocks) {
      if (b.type === 'audio') {
        result.push({ block: b as AudioBlock, sceneName });
      } else if (b.type === 'audio-gen') {
        const ag = b as AudioGenBlock;
        if (ag.src.startsWith('assets/')) result.push({ block: ag, sceneName });
      } else if (b.type === 'condition') {
        for (const br of b.branches) walk(br.blocks, sceneName);
      } else if (b.type === 'dialogue' && b.innerBlocks) {
        walk(b.innerBlocks, sceneName);
      } else if (b.type === 'tabs') {
        for (const tab of b.tabs) walk(tab.blocks, sceneName);
      } else if (b.type === 'section') {
        walk(b.blocks, sceneName);
      } else if (b.type === 'table') {
        for (const row of b.rows) for (const cell of row.cells) walk(cell.blocks, sceneName);
      }
    }
  }
  for (const s of scenes) walk(s.blocks, s.name);
  return result;
}

/** Build <<cacheaudio>> lines for StoryInit. */
export function buildAudioCacheLines(scenes: Scene[]): string[] {
  const entries = collectAudioBlocks(scenes).filter(e => e.block.src);
  if (entries.length === 0) return [];
  return entries.map(({ block }) => {
    const trackId = `tga_${block.id.replace(/-/g, '')}`;
    return `<<cacheaudio "${trackId}" "${block.src}">>`;
  });
}

/** Build the :passageleave handler for stopping audio.
 *  Uses a static passage→trackIds map so it works reliably with back/forward navigation. */
export function buildAudioScript(scenes: Scene[], unlockText?: string): string {
  const allEntries = collectAudioBlocks(scenes);
  if (allEntries.length === 0) return '';

  // Only entries with a source file matter for track operations.
  const entries    = allEntries.filter(e => e.block.src);
  const stopEntries = entries.filter(e => e.block.onLeave === 'stop');
  const hasDelayed  = entries.some(
    e => e.block.trigger === 'delay' && e.block.triggerDelay && e.block.triggerDelay > 0,
  );
  // Immediate-trigger tracks — used to detect and recover from autoplay blocking.
  const immediateEntries = entries.filter(e => e.block.trigger === 'immediate');

  const lines: string[] = ['// Audio: passageinit handler + autoplay unlock'];

  // ── _tgAudioPlayMap: passage → [{id, volume, loop}] for immediate tracks ──────
  // Used by the autoplay-unlock overlay to replay blocked tracks on first click.
  if (immediateEntries.length > 0) {
    const playMap: Record<string, { id: string; volume: number; loop: boolean }[]> = {};
    for (const { block, sceneName } of immediateEntries) {
      const trackId = `tga_${block.id.replace(/-/g, '')}`;
      const vol     = Math.round(block.volume) / 100;
      (playMap[sceneName] ??= []).push({ id: trackId, volume: vol, loop: block.loop });
    }
    lines.push(`var _tgAudioPlayMap = ${JSON.stringify(playMap)};`);
  }

  // ── _tgAudioStopMap: passage → [trackId] for stop-on-leave tracks ─────────────
  if (stopEntries.length > 0) {
    const map: Record<string, string[]> = {};
    for (const { block, sceneName } of stopEntries) {
      const trackId = `tga_${block.id.replace(/-/g, '')}`;
      (map[sceneName] ??= []).push(trackId);
    }
    lines.push(`var _tgAudioStopMap = ${JSON.stringify(map)};`);
  }

  // ── :passageinit handler ───────────────────────────────────────────────────────
  if (stopEntries.length > 0 || hasDelayed) {
    lines.push('$(document).on(":passageinit", function(ev) {');
    if (hasDelayed) {
      // Cancel pending delayed-audio timers so they don't fire on a different scene.
      lines.push('  if (window._tgDA) { window._tgDA.forEach(function(id){ clearTimeout(id); }); window._tgDA = []; }');
    }
    if (stopEntries.length > 0) {
      lines.push(
        '  var incoming = ev.passage.title;',
        '  Object.keys(_tgAudioStopMap).forEach(function(passageName) {',
        '    if (passageName === incoming) return;',
        '    _tgAudioStopMap[passageName].forEach(function(id) {',
        '      var t = SimpleAudio.tracks.get(id);',
        '      if (t) t.stop();',
        '    });',
        '  });',
      );
    }
    lines.push('});');
  }

  // ── Autoplay-unlock overlay ────────────────────────────────────────────────────
  // Modern browsers block audio until the user interacts with the page.
  // After :passageend we check if immediate-trigger tracks are actually playing.
  // If any are blocked, we show a click-to-begin overlay. The click counts as a
  // user gesture, which unlocks the AudioContext so tracks can start.
  if (immediateEntries.length > 0) {
    // Sanitize user-supplied text: HTML-escape special chars, then escape single
    // quotes so the string is safe to embed inside a JS single-quoted literal.
    const rawText = (unlockText ?? '').trim() || '▶ Click to begin';
    const safeText = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, "\\'");
    lines.push(
      '$(document).one(":passageend", function() {',
      '  if (typeof _tgAudioPlayMap === "undefined") return;',
      '  var ts = _tgAudioPlayMap[State.passage];',
      '  if (!ts || !ts.length) return;',
      '  var blocked = ts.some(function(t) {',
      '    var tr = SimpleAudio.tracks.get(t.id);',
      '    return tr && !tr.isPlaying();',
      '  });',
      '  if (!blocked) return;',
      '  var ov = document.createElement("div");',
      '  ov.id = "tg-audio-unlock";',
      '  ov.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);cursor:pointer";',
      `  ov.innerHTML = '<div style="pointer-events:none;color:#fff;font-size:1.4em;text-align:center;line-height:1.6">${safeText}</div>';`,
      '  ov.addEventListener("click", function() {',
      '    ov.remove();',
      '    var ts2 = _tgAudioPlayMap[State.passage];',
      '    if (ts2) ts2.forEach(function(t) {',
      '      var tr = SimpleAudio.tracks.get(t.id);',
      '      if (tr && !tr.isPlaying()) tr.volume(t.volume).loop(t.loop).play();',
      '    });',
      '  }, { once: true });',
      '  document.body.appendChild(ov);',
      '});',
    );
  }

  return lines.join('\n');
}

// ─── Character CSS ─────────────────────────────────────────────────────────────
// Implementation moved to styleCascade.ts (buildAllDialogueCss).

// ─── Twine graph hint helpers ─────────────────────────────────────────────────

/**
 * Recursively collect all target scene names reachable from a block list.
 * Used to emit <<if false>>[[Target]]<</if>> hints so the Twine editor can
 * draw passage connections in its graph view (it scans for [[...]] by regex,
 * while SugarCube never executes the content under `<<if false>>`).
 */
function collectSceneTargets(blocks: Block[], idToName?: Map<string, string>): string[] {
  const resolve = (v: string) => idToName?.get(v) ?? v;
  const targets: string[] = [];
  for (const b of blocks) {
    if (b.type === 'choice') {
      for (const opt of b.options) {
        if (opt.targetSceneId) targets.push(resolve(opt.targetSceneId));
      }
    } else if (b.type === 'link') {
      if (b.target === 'scene' && b.targetSceneId) targets.push(resolve(b.targetSceneId));
    } else if (b.type === 'menu-link') {
      if (b.target === 'scene' && b.targetSceneId) targets.push(resolve(b.targetSceneId));
    } else if (b.type === 'function') {
      if (b.targetSceneId) targets.push(resolve(b.targetSceneId));
    } else if (b.type === 'condition') {
      for (const branch of b.branches) {
        targets.push(...collectSceneTargets(branch.blocks, idToName));
      }
    } else if (b.type === 'dialogue' && b.innerBlocks?.length) {
      targets.push(...collectSceneTargets(b.innerBlocks, idToName));
    } else if (b.type === 'tabs') {
      for (const tab of b.tabs) {
        targets.push(...collectSceneTargets(tab.blocks, idToName));
      }
    } else if (b.type === 'section') {
      targets.push(...collectSceneTargets(b.blocks, idToName));
    } else if (b.type === 'table') {
      for (const row of b.rows) for (const cell of row.cells) {
        targets.push(...collectSceneTargets(cell.blocks, idToName));
      }
    } else if (b.type === 'plugin') {
      // Dive into plugin body so the Twine graph sees nav targets nested in plugins.
      const def = getPluginDef(b.pluginId);
      if (def) targets.push(...collectSceneTargets(def.blocks, idToName));
    }
  }
  // deduplicate
  return [...new Set(targets)];
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function exportToTwee(project: Project, plugins: PluginBlockDef[] = []): string {
  setPluginRegistry(plugins);
  const variableNodes = project.variableNodes;
  const variables = flattenVariables(variableNodes);
  const { title, ifid, scenes, characters } = project;
  const idToName = new Map(scenes.map(s => [s.id, s.name]));
  const startScene = scenes.find(s => s.tags.includes(START_TAG))?.name ?? scenes[0]?.name ?? 'Start';
  // Sidebar-as-scene: a scene tagged `sidebar` (singleton) becomes ::StoryCaption.
  // The scene is NOT emitted as a regular ::SceneName passage (its name is
  // editor-only — the SugarCube engine reads from `::StoryCaption` directly).
  const sidebarScene = scenes.find(s => s.tags.includes('sidebar'));
  // Title-as-scene: a scene tagged `title` (singleton) becomes ::StoryTitle.
  // Same passage-redirect pattern as sidebar. When absent, fall back to project.title.
  const titleScene = scenes.find(s => s.tags.includes('title'));
  // Other singleton system scenes that redirect to named SugarCube passages.
  const menuScene          = scenes.find(s => s.tags.includes('menu'));
  const passageHeaderScene = scenes.find(s => s.tags.includes('passage-header'));
  const passageFooterScene = scenes.find(s => s.tags.includes('passage-footer'));
  const parts: string[] = [];

  // StoryTitle — plain-text story title / storage ID. Per SugarCube docs it must be
  // plain text (no markup/macros) because it seeds the save-storage ID; in Twine 2 it
  // is unused (title comes from project metadata) but Twee import relies on it. Always
  // the stable project title — never the (possibly rich) title scene.
  parts.push(`::StoryTitle\n${title}\n`);

  // StoryDisplayTitle — the *displayed* title in the UI bar (#story-title) + browser
  // titlebar. Unlike StoryTitle it renders markup/macros/images. Emitted from the
  // title scene when present & non-empty; otherwise SugarCube falls back to StoryTitle.
  // PassageContext 'title' strips the `<div class="tg-text">` wrapper from text blocks
  // (keeps the inline title clean) while image/other blocks render normally.
  const titleDisplayBody = titleScene
    ? titleScene.blocks
        .map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project, 'title'))
        .filter(Boolean)
        .join('\n')
    : '';
  if (titleDisplayBody) parts.push(`::StoryDisplayTitle\n${titleDisplayBody}\n`);

  // StoryData
  const storyData = JSON.stringify({
    ifid,
    format: 'SugarCube',
    'format-version': '2.36.1',
    start: startScene,
    zoom: 1,
  }, null, 2);
  parts.push(`::StoryData\n${storyData}\n`);

  // StoryInit — variable initialization
  const inits: string[] = [];
  for (const n of variableNodes) {
    if (n.kind === 'variable') {
      inits.push(`<<set $${n.name} to ${defaultValueLiteral(n)}>>`);
    } else if (n.kind === 'group' && hasLeafVariables(n)) {
      inits.push(`<<set $${n.name} = ${buildObjectLiteral(n, variableNodes)}>>`);
    }
  }
  // Audio: <<cacheaudio>> lines + <<waitforaudio>> to block start until loaded
  const audioCacheLines = buildAudioCacheLines(scenes);
  inits.push(...audioCacheLines);
  if (audioCacheLines.length > 0) inits.push('<<waitforaudio>>');
  // Audio volume: init master volume variable when any TableBlock contains an
  // audio-volume cell (recursive scan — table can live in any nested container).
  const hasAudioVolume = scenes.some(s => hasAudioVolumeCell(s.blocks));
  if (hasAudioVolume) inits.push('<<set $__tgMasterVol to 1>>');
  // Initial inventory: push starting items for each character
  for (const char of characters) {
    if (!char.varName) continue;
    const charPath = `$${char.varName}`;
    // Paperdoll default equipment: set slot variables from defaultItemVarName
    if (char.paperdoll?.slots?.length) {
      for (const pdSlot of char.paperdoll.slots) {
        if (pdSlot.defaultItemVarName) {
          inits.push(`<<set ${charPath}.equipment.${pdSlot.id} to "${pdSlot.defaultItemVarName}">>`);
        }
      }
    }
    if (!char.initialInventory?.length) continue;
    for (const slot of char.initialInventory) {
      // Mark item as equipped if it matches a paperdoll default
      const isDefaultEquipped = char.paperdoll?.slots?.some(
        ps => ps.defaultItemVarName === slot.itemVarName
      ) ?? false;
      inits.push(`<<run ${charPath}.inventory.push({ item: "${slot.itemVarName}", qty: ${slot.quantity}, equipped: ${isDefaultEquipped} })>>`);
    }
  }
  // Custom init markup — user-supplied SugarCube macros appended at the very end of
  // the autogenerated init lines. Must be SugarCube markup (<<run setup.X = …>>), NOT
  // raw JS (no [script] tag on StoryInit).
  const customInit = (project.settings?.customInit ?? '').trim();
  if (customInit) inits.push(customInit);
  if (inits.length > 0) {
    // NOTE: StoryInit must NOT have [script] tag — its content is SugarCube
    // markup (<<set>>), not raw JavaScript. The [script] tag would cause Twine
    // to interpret the macros as JS and throw "Unexpected token '<<'".
    parts.push(`::StoryInit\n${inits.join('\n')}\n`);
  }

  // Sidebar systemConfig — width / position / hidden / collapse / bgColor.
  // Reads `sidebarScene.systemConfig` (kind 'sidebar') and emits both CSS and a
  // Config.ui.stowBarInitially line if needed.
  const { css: sidebarCfgCSS, script: sidebarCfgScript } = buildSidebarSystemConfigOutput(sidebarScene, variables, variableNodes);
  // Title systemConfig — #story-title text color + font.
  const titleCfgCSS = buildTitleSystemConfigCSS(titleScene);

  // StoryStylesheet
  const charCSS      = buildAllDialogueCss(characters);
  const cellCSS      = buildCellSharedCSS(scenes);  // progress bars, cell images, lightbox
  const tabsCSS      = buildTabsBlockCSS(scenes);    // TabsBlock tab bar
  const sectionCSS   = buildSectionCSS(scenes);      // SectionBlock container
  const calloutCSS   = buildCalloutCSS(scenes);      // CalloutBlock notice box
  const doCSS        = buildDisplayObjectCSS(scenes); // DisplayObject layouts
  const buttonCSS    = buildButtonsCascadeCss(scenes, project.settings);
  const simpleCSS    = buildSimpleBlocksCascadeCss(scenes, project.settings);
  const animCSS      = buildAnimationCSS(scenes);
  const tipCSS       = buildTooltipCSS();
  const containerCSS = buildContainerCSS();
  const paperdollCSS = buildPaperdollCSS(project);
  const inventoryCSS = buildInventoryCSS(project);
  const generatedCSS = [charCSS, cellCSS, tabsCSS, sectionCSS, calloutCSS, doCSS, buttonCSS, simpleCSS, animCSS, tipCSS, containerCSS, paperdollCSS, inventoryCSS, sidebarCfgCSS, titleCfgCSS].filter(Boolean).join('\n\n');
  const userCSS      = (project.customCss ?? '').trim();
  const allCSS       = userCSS
    ? (generatedCSS ? `${generatedCSS}\n\n/* User CSS */\n${userCSS}` : userCSS)
    : generatedCSS;
  if (allCSS) parts.push(`::StoryStylesheet [stylesheet]\n${allCSS}\n`);

  // StoryScript (lightbox + input debounce) — single passage
  const storyScript = [
    sidebarCfgScript,
    buildDateTimeScript(),
    buildLightboxScript(scenes),
    buildTabsBlockScript(scenes),
    buildInputScript(scenes),
    buildLiveScript(scenes),
    buildWatcherScript(project.watchers ?? [], variables, variableNodes, idToName),
    buildAudioScript(scenes, project.settings?.audioUnlockText),
    buildInventoryScript(project),
    buildContainerScript(project),
    buildPaperdollScript(project),
    hasScenesWithBg(scenes) ? buildSceneBgScript() : '',
    hasStyleBindings(project) ? buildStyleBindScript(project) : '',
    buildPopupClassSyncScript(scenes),
    buildPassageLifecycleScript(project.settings),
    hasAudioVolume ? [
      '// Audio volume: restore from saved state on load',
      '$(document).on(":passagedisplay", function() {',
      '  var v = State.variables.__tgMasterVol;',
      '  if (v != null) { SimpleAudio.volume(v); }',
      '});',
    ].join('\n') : '',
    buildPurlSignatureScript(),
  ].filter(Boolean).join('\n\n');
  const userScript = (project.customScript ?? '').trim();
  const fullScript = userScript
    ? (storyScript ? `${storyScript}\n\n/* User script */\n${userScript}` : userScript)
    : storyScript;
  if (fullScript) parts.push(`::StoryScript [script]\n${fullScript}\n`);

  // StoryCaption — emit only when a sidebar-tagged scene exists.
  const captionSC = sidebarScene
    ? sidebarScene.blocks
        .map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project))
        .filter(Boolean)
        .join('\n')
    : '';
  if (captionSC) parts.push(`::StoryCaption\n${captionSC}\n`);

  // StoryMenu / PassageHeader / PassageFooter — singleton system scenes mapped to
  // named SugarCube passages. Emit each only when its scene exists AND has non-empty body.
  // `menu` context strips link/text wrappers because SugarCube parses ::StoryMenu line-by-line
  // into `<li><<link>></li>` items. Header/footer render into the page like regular passages.
  const systemPassagePairs: Array<[Scene | undefined, string, PassageContext]> = [
    [menuScene,          'StoryMenu',     'menu'],
    [passageHeaderScene, 'PassageHeader', undefined],
    [passageFooterScene, 'PassageFooter', undefined],
  ];
  for (const [sc, passageName, ctx] of systemPassagePairs) {
    if (!sc) continue;
    const body = sc.blocks
      .map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project, ctx))
      .filter(Boolean)
      .join('\n');
    if (body) parts.push(`::${passageName}\n${body}\n`);
  }

  // Scene passages
  for (const scene of scenes) {
    if (sidebarScene && scene.id === sidebarScene.id) continue; // sidebar scene → StoryCaption only
    if (titleScene   && scene.id === titleScene.id)   continue; // title scene   → StoryTitle only
    if (menuScene          && scene.id === menuScene.id)          continue; // → StoryMenu
    if (passageHeaderScene && scene.id === passageHeaderScene.id) continue; // → PassageHeader
    if (passageFooterScene && scene.id === passageFooterScene.id) continue; // → PassageFooter
    const exportTags = scene.tags.filter(t => t !== START_TAG);
    const tags = exportTags.length > 0 ? ` [${exportTags.join(' ')}]` : '';

    // Scene background — prepended to passage body
    const bgMarkup = scene.background
      ? exportSceneBg(scene.background, variables, variableNodes)
      : '';

    const blocksBody = scene.blocks
      .map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project))
      .filter(Boolean)
      .join('\n');

    const body = [bgMarkup, blocksBody].filter(Boolean).join('\n');

    // Graph hint: <<if false>>[[Target1]][[Target2]]<</if>>
    // Twine's editor finds [[...]] by regex to draw connections.
    // SugarCube never executes content inside a false <<if>> condition.
    const navTargets = collectSceneTargets(scene.blocks, idToName);
    const graphHint = navTargets.length > 0
      ? `\n<<if false>>${navTargets.map(t => `[[${t}]]`).join('')}<</if>>`
      : '';

    parts.push(`::${scene.name}${tags}\n${body || '(empty scene)'}${graphHint}\n`);
  }

  // ── Hidden plugin passages ────────────────────────────────────────────────
  // Collect every plugin referenced anywhere in the scenes, then recursively
  // expand to include plugins-used-by-plugins. Emit each as `__plug_<id>`.
  const rootPluginIds = new Set<string>();
  for (const scene of scenes) collectPluginIds(scene.blocks, rootPluginIds);
  const allPluginIds = expandPluginDeps(rootPluginIds, getPluginDef);
  for (const id of allPluginIds) {
    const def = getPluginDef(id);
    if (!def) continue;

    // Build virtual variable/group nodes for plugin params so `blockToSC` can
    // resolve `param:<key>` ids. Node names use the path-marker prefix
    // (`__tgParam__key`) so emitted paths like `$__tgParam__key.field` are
    // rewritten to `_key.field` by `rewriteParamRefs` in the final pass.
    // For `object` params with a linked project group, a virtual GROUP node is
    // created whose children mirror the real group — allowing field-level refs.
    const virtualParamNodes: VariableTreeNode[] = paramsToVirtualNodes(
      def.params, variableNodes, /* useMarkerNames */ true,
    );
    const paramVars: Variable[] = flattenVariables(virtualParamNodes);
    const mergedVars: Variable[] = [...variables, ...paramVars];
    const mergedNodes: VariableTreeNode[] = [...variableNodes, ...virtualParamNodes];

    const body = def.blocks
      .map((b) => blockToSC(b, characters, mergedVars, mergedNodes, '', idToName, project))
      .filter(Boolean)
      .join('\n');
    parts.push(`::__plug_${def.id} [nobr]\n${rewriteParamRefs(body) || ''}\n`);
  }

  return parts.join('\n\n') + '\n';
}

/**
 * Build SugarCube macro definitions for the inventory system.
 * Included when the project has at least one character.
 *
 * Macros:
 *   <<tgInvAdd  charVar itemVarName qty>>  — add items to inventory
 *   <<tgInvRemove charVar itemVarName qty>> — remove items from inventory
 *
 * JS helpers (usable in <<if>> expressions):
 *   window.tgInvHas(charVar, itemVarName)   → boolean
 *   window.tgInvCount(charVar, itemVarName) → number
 */
export function buildContainerCSS(): string {
  return [
    '.tg-container { font-family: inherit; }',
    '.tg-cont-header { font-size: 1.05em; font-weight: bold; margin-bottom: 8px; }',
    '.tg-cont-body { display: flex; gap: 16px; align-items: flex-start; }',
    '.tg-cont-grid { display: grid; grid-template-columns: repeat(4, 64px); gap: 4px; align-content: start; }',
    '.tg-cont-cell { width: 64px; height: 64px; border: 2px solid rgba(255,255,255,0.15); border-radius: 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px; position: relative; transition: border-color 0.15s, background 0.15s; box-sizing: border-box; }',
    '.tg-cont-cell:hover { border-color: rgba(255,255,255,0.4); }',
    '.tg-cont-cell.tg-selected { border-color: #6366f1; background: rgba(99,102,241,0.18); }',
    '.tg-cont-cell img { width: 36px; height: 36px; object-fit: contain; }',
    '.tg-cell-qty { position: absolute; bottom: 2px; right: 4px; font-size: 10px; opacity: 0.8; }',
    '.tg-cell-name { font-size: 10px; text-align: center; overflow: hidden; max-width: 60px; white-space: nowrap; text-overflow: ellipsis; }',
    '.tg-cont-detail { flex: 1; min-width: 160px; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; min-height: 140px; }',
    '.tg-detail-placeholder { color: rgba(255,255,255,0.3); font-size: 12px; padding-top: 8px; }',
    '.tg-detail-icon { margin-bottom: 6px; }',
    '.tg-detail-icon img { width: 56px; height: 56px; object-fit: contain; }',
    '.tg-detail-name { font-weight: bold; margin-bottom: 2px; }',
    '.tg-detail-desc { font-size: 12px; color: rgba(255,255,255,0.55); margin-bottom: 6px; }',
    '.tg-detail-meta { font-size: 12px; margin-bottom: 10px; color: rgba(255,255,255,0.7); }',
    '.tg-detail-action { display: inline-block; padding: 5px 18px; background: #6366f1; border: none; border-radius: 4px; color: #fff; cursor: pointer; font-size: 13px; transition: background 0.15s; }',
    '.tg-detail-action:hover:not(:disabled) { background: #4f46e5; }',
    '.tg-detail-action:disabled { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.3); cursor: not-allowed; }',
    '.tg-cont-empty { color: rgba(255,255,255,0.3); font-size: 13px; padding: 16px 0; }',
  ].join('\n');
}

// ── Scene background ──────────────────────────────────────────────────────────

/**
 * Generates the SugarCube markup to set the scene background at the top of a passage.
 *
 * Static/AI-static:  <<tgSceneBg "path" blur opacity "size" posX posY "overlayColor" overlayOpacity>>
 * Bound/AI-bound:    <<set _tgBg to "">>, conditional chain, <<tgSceneBg _tgBg ...>>
 */
export function exportSceneBg(
  bg: SceneBackground,
  vars: Variable[],
  nodes: VariableTreeNode[],
): string {
  const { imageType } = bg;

  // None mode — solid background color and/or overlay only
  if (imageType === 'none') {
    const bgColor    = bg.bgColor ?? '';
    const ovColor    = bg.overlayColor ?? '';
    const ovOp       = bg.overlayOpacity ?? 0;
    if (!bgColor && (!ovColor || ovOp <= 0)) return '';
    return `<<tgSceneBgColor "${bgColor}" "${ovColor}" ${ovOp}>>`;
  }

  const blur          = bg.blur          ?? 0;
  const opacity       = bg.opacity       ?? 100;
  const size          = bg.size          ?? 'cover';
  const posX          = bg.posX          ?? 50;
  const posY          = bg.posY          ?? 50;
  const overlayColor  = bg.overlayColor  ?? '';
  const overlayOpacity = bg.overlayOpacity ?? 0;

  // Static args after src: blur opacity "size" posX posY "overlayColor" overlayOpacity
  const displayArgs = `${blur} ${opacity} "${size}" ${posX} ${posY} "${overlayColor}" ${overlayOpacity}`;

  if (imageType === 'static' || imageType === 'ai-static') {
    if (!bg.src) return '';
    return `<<tgSceneBg "${bg.src}" ${displayArgs}>>`;
  }

  if (imageType === 'bound' || imageType === 'ai-bound') {
    const mapping   = bg.mapping ?? [];
    const defaultSrc = bg.defaultSrc ?? '';
    if (mapping.length === 0 && !defaultSrc) return '';

    const bv    = vars.find(x => x.id === bg.variableId);
    const vname = bv ? `$${varPath(bv, nodes)}` : '$???';

    const lines: string[] = ['<<set _tgBg to "">>'];

    if (mapping.length > 0) {
      const cases = mapping.map((m, i) => {
        const kw = i === 0 ? '<<if' : '<<elseif';
        const mt = m.matchType ?? 'exact';
        let cond: string;
        if (mt === 'range') {
          cond = `${vname} >= ${m.rangeMin ?? '0'} && ${vname} <= ${m.rangeMax ?? '0'}`;
        } else {
          const val = bv?.varType === 'string' ? `"${m.value}"` : m.value;
          cond = `${vname} eq ${val}`;
        }
        return `${kw} ${cond}>><<set _tgBg to "${m.src}">>`;
      });
      if (defaultSrc) cases.push(`<<else>><<set _tgBg to "${defaultSrc}">>`);
      cases.push('<</if>>');
      lines.push(cases.join('\n'));
    } else if (defaultSrc) {
      lines.push(`<<set _tgBg to "${defaultSrc}">>`);
    }

    lines.push(`<<if _tgBg>><<tgSceneBg _tgBg ${displayArgs}>><</if>>`);
    return lines.join('\n');
  }

  return '';
}

/**
 * Returns true if at least one scene in the project has a background configured.
 * Used to conditionally include the <<tgSceneBg>> macro in StoryScript.
 */
export function hasScenesWithBg(scenes: Scene[]): boolean {
  return scenes.some(s => {
    const bg = s.background;
    if (!bg) return false;
    if (bg.imageType !== 'none') return true;
    return !!(bg.bgColor || (bg.overlayColor && (bg.overlayOpacity ?? 0) > 0));
  });
}

/**
 * Build the <<tgSceneBg>> macro JS definition.
 * The macro:
 *  - Inserts a fixed-position background div (id="tg-scene-bg")
 *  - Optionally inserts an overlay div (id="tg-scene-bg-ov") when overlayColor is set
 *  - Clears both divs on :passagestart if no tgSceneBg call was made in the new passage
 *
 * Args: src blur opacity size posX posY overlayColor overlayOpacity
 */
/**
 * Implementation note:
 * Using CSS injection via body::before / body::after instead of extra DOM divs.
 * This guarantees z-ordering: pseudo-elements with negative z-index inside a
 * positioned body are always painted behind SugarCube's #story content.
 *
 * Stacking order inside body's stacking context (body { position: relative }):
 *   body::before (z-index: -2)  ← background image
 *   body::after  (z-index: -1)  ← color overlay
 *   #story / .passage (z-index: auto → above all negatives)  ← story content
 */
export function buildSceneBgScript(): string {
  return [
    '// ── Scene background macro ──',
    // Track whether the current passage set a background
    '$(document).on(":passagestart", function() { window._tgBgSet = false; });',
    // On passageend: if no <<tgSceneBg>> was called, clear the injected CSS
    // so scenes without a background don't keep the previous scene's image.
    '$(document).on(":passageend", function() {',
    '  if (!window._tgBgSet) {',
    '    var s = document.getElementById("tg-bg-style");',
    '    if (s) s.textContent = "";',
    '  }',
    '});',
    '',
    'Macro.add("tgSceneBg", {',
    '  handler: function() {',
    '    var src     = this.args[0] || "";',
    '    if (!src) return;',
    '    window._tgBgSet = true;',
    '    var blur    = this.args[1] != null ? this.args[1] : 0;',
    '    var opacity = this.args[2] != null ? this.args[2] : 100;',
    '    var size    = this.args[3] || "cover";',
    '    var posX    = this.args[4] != null ? this.args[4] : 50;',
    '    var posY    = this.args[5] != null ? this.args[5] : 50;',
    '    var ovColor = this.args[6] || "";',
    '    var ovOp    = this.args[7] != null ? this.args[7] : 0;',
    '',
    '    var bgSz = size === "fill" ? "100% 100%" : size;',
    // Extend inset to hide blur-edge artifacts
    '    var ext = blur > 0 ? (blur * 2) + "px" : "0";',
    '',
    // Build the full CSS rule block for body + ::before (bg) + ::after (overlay)
    '    var css = [',
    // body: position:relative creates a stacking context so negative z-index pseudo-elements work;
    // transparent background lets them show through
    '      "body { position: relative; background-color: transparent !important; background-image: none !important; }",',
    '      "body::before {",',
    '      "  content: \'\';",',
    '      "  position: fixed;",',
    '      "  inset: -" + ext + ";",',
    '      "  z-index: -2;",',
    '      "  pointer-events: none;",',
    '      "  background-image: url(\'" + src + "\');",',
    '      "  background-size: " + bgSz + ";",',
    '      "  background-position: " + posX + "% " + posY + "%;",',
    '      "  background-repeat: no-repeat;",',
    '    ].join("\\n");',
    '    if (blur > 0)    css += "  filter: blur(" + blur + "px);\\n";',
    '    if (opacity < 100) css += "  opacity: " + (opacity / 100) + ";\\n";',
    '    css += "}";',
    '',
    // Overlay via body::after
    '    if (ovColor && ovOp > 0) {',
    '      var hex = ovColor.replace("#","");',
    '      var r = parseInt(hex.substring(0,2),16)||0;',
    '      var g = parseInt(hex.substring(2,4),16)||0;',
    '      var b = parseInt(hex.substring(4,6),16)||0;',
    '      css += [',
    '        "\\nbody::after {",',
    '        "  content: \'\'",',
    '        "  position: fixed",',
    '        "  inset: 0",',
    '        "  z-index: -1",',
    '        "  pointer-events: none",',
    '        "  background: rgba(" + r + "," + g + "," + b + "," + (ovOp/100) + ")",',
    '        "}"',
    '      ].join(";\\n");',
    '    }',
    '',
    // Inject or update the single style tag
    '    var st = document.getElementById("tg-bg-style");',
    '    if (!st) {',
    '      st = document.createElement("style");',
    '      st.id = "tg-bg-style";',
    '      document.head.appendChild(st);',
    '    }',
    '    st.textContent = css;',
    '  }',
    '});',
    '',
    // Solid background color macro (no image): tgSceneBgColor bgColor ovColor ovOpacity
    'Macro.add("tgSceneBgColor", {',
    '  handler: function() {',
    '    var bgColor = this.args[0] || "";',
    '    var ovColor = this.args[1] || "";',
    '    var ovOp    = this.args[2] != null ? this.args[2] : 0;',
    '    if (!bgColor && (!ovColor || ovOp <= 0)) return;',
    '    window._tgBgSet = true;',
    '    var css = "body { position: relative; background-color: transparent !important; background-image: none !important; }\\n";',
    '    if (bgColor) {',
    '      css += "body::before { content: \'\'; position: fixed; inset: 0; z-index: -2; pointer-events: none; background-color: " + bgColor + "; }\\n";',
    '    } else {',
    '      css += "body::before { content: none; }\\n";',
    '    }',
    '    if (ovColor && ovOp > 0) {',
    '      var hex = ovColor.replace("#","");',
    '      var r = parseInt(hex.substring(0,2),16)||0;',
    '      var g = parseInt(hex.substring(2,4),16)||0;',
    '      var b = parseInt(hex.substring(4,6),16)||0;',
    '      css += "body::after { content: \'\'; position: fixed; inset: 0; z-index: -1; pointer-events: none; background: rgba(" + r + "," + g + "," + b + "," + (ovOp/100) + "); }\\n";',
    '    }',
    '    var st = document.getElementById("tg-bg-style");',
    '    if (!st) { st = document.createElement("style"); st.id = "tg-bg-style"; document.head.appendChild(st); }',
    '    st.textContent = css;',
    '  }',
    '});',
  ].join('\n');
}

/**
 * Build SugarCube macro definitions for the container system.
 * Included when the project has at least one container.
 *
 * Macros (usage in passages):
 *   <<tgContainer containerVar charVar [title]>>
 *     — renders the container UI inline (shop/chest/loot based on container mode)
 *   <<tgShopBuy   containerVar itemVarName charVar [qty]>> — buy item from shop
 *   <<tgShopSell  containerVar itemVarName charVar [qty]>> — sell item to shop
 *   <<tgChestTake containerVar itemVarName charVar [qty]>> — take item from chest
 *   <<tgLootAll   containerVar charVar>>                   — take all loot
 */
export function buildContainerScript(project: Project): string {
  const containers = project.containers ?? [];
  if (containers.length === 0) return '';

  // Static map of container varName → mode
  const containerModes = containers.map(c => `"${c.varName}":"${c.mode}"`).join(',');

  return [
    '// ── Container system ──',
    `var _tgModes = {${containerModes}};`,
    '',
    '// Shared: get container object by varName string',
    'function _tgGetCont(n) { return (State.variables["containers"] || {})[n]; }',
    '// Shared: get character object by varName string',
    'function _tgGetChar(n) { return State.variables[n]; }',
    '',
    '// Buy one item from a shop container',
    'window.tgBuyItem = function(contName, charName, itemName, qty) {',
    '  qty = qty || 1;',
    '  var cont = _tgGetCont(contName); var ch = _tgGetChar(charName);',
    '  if (!cont || !ch) return;',
    '  var slot = cont.items.find(function(s){return s.item===itemName;});',
    '  if (!slot) return;',
    '  var items = State.variables["items"] || {};',
    '  var price = (slot.price != null ? slot.price : (items[itemName] ? items[itemName].price||0 : 0)) * qty;',
    '  if ((ch.money||0) < price) return;',
    '  ch.money = (ch.money||0) - price;',
    '  if (slot.qty !== -1) { slot.qty -= qty; if (slot.qty <= 0) cont.items.splice(cont.items.indexOf(slot),1); }',
    '  var stackable = items[itemName] ? items[itemName].stackable : false;',
    '  if (stackable) { var ex=ch.inventory.find(function(e){return e.item===itemName;}); if(ex){ex.qty+=qty;} else {ch.inventory.push({item:itemName,qty:qty,equipped:false});} }',
    '  else { ch.inventory.push({item:itemName,qty:qty,equipped:false}); }',
    '  Engine.show();',
    '};',
    '',
    '// Take one item from a chest/loot container',
    'window.tgTakeItem = function(contName, charName, itemName, qty) {',
    '  qty = qty || 1;',
    '  var cont = _tgGetCont(contName); var ch = _tgGetChar(charName);',
    '  if (!cont || !ch) return;',
    '  var slot = cont.items.find(function(s){return s.item===itemName;});',
    '  if (!slot) return;',
    '  var take = slot.qty === -1 ? qty : Math.min(qty, slot.qty);',
    '  if (slot.qty !== -1) { slot.qty -= take; if (slot.qty <= 0) cont.items.splice(cont.items.indexOf(slot),1); }',
    '  var items = State.variables["items"] || {};',
    '  var stackable = items[itemName] ? items[itemName].stackable : false;',
    '  if (stackable) { var ex=ch.inventory.find(function(e){return e.item===itemName;}); if(ex){ex.qty+=take;} else {ch.inventory.push({item:itemName,qty:take,equipped:false});} }',
    '  else { ch.inventory.push({item:itemName,qty:take,equipped:false}); }',
    '  Engine.show();',
    '};',
    '',
    '// Loot all items at once',
    'window.tgLootAllItems = function(contName, charName) {',
    '  var cont = _tgGetCont(contName); var ch = _tgGetChar(charName);',
    '  if (!cont || !ch) return;',
    '  var items = State.variables["items"] || {};',
    '  cont.items.forEach(function(slot) {',
    '    var qty = slot.qty === -1 ? 1 : slot.qty;',
    '    var stackable = items[slot.item] ? items[slot.item].stackable : false;',
    '    if (stackable) { var ex=ch.inventory.find(function(e){return e.item===slot.item;}); if(ex){ex.qty+=qty; return;} }',
    '    ch.inventory.push({item:slot.item,qty:qty,equipped:false});',
    '  });',
    '  cont.items = [];',
    '  Engine.show();',
    '};',
    '',
    '// Cell click: reads contName/charName from parent data-* attrs — no quoting needed',
    'window.tgCellClick = function(el) {',
    '  var wrap = el.closest(".tg-container");',
    '  if (!wrap) return;',
    '  var contName    = wrap.dataset.cont;',
    '  var charName    = wrap.dataset.char;',
    '  var detailId    = wrap.dataset.det;',
    '  var itemVarName = el.dataset.item;',
    '  el.closest(".tg-cont-grid").querySelectorAll(".tg-cont-cell").forEach(function(c){c.classList.remove("tg-selected");});',
    '  el.classList.add("tg-selected");',
    '  var detail = document.getElementById(detailId);',
    '  if (!detail) return;',
    '  var cont = _tgGetCont(contName);',
    '  var ch   = _tgGetChar(charName);',
    '  var allItems = State.variables["items"] || {};',
    '  var item  = allItems[itemVarName] || {};',
    '  var slot  = cont ? cont.items.find(function(s){return s.item===itemVarName;}) : null;',
    '  if (!slot) { detail.innerHTML = "<div class=\\"tg-detail-placeholder\\">Item not found</div>"; return; }',
    '  var mode  = _tgModes[contName] || "loot";',
    '  var name  = item.name || itemVarName;',
    '  var desc  = item.description || "";',
    '  var icon  = item.icon ? "<img src=\\""+item.icon+"\\">": "";',
    '  var price = slot.price != null ? slot.price : (item.price || 0);',
    '  var qty   = slot.qty === -1 ? "\\u221e" : slot.qty;',
    '  var money = ch ? (ch.money || 0) : 0;',
    '  var html = "";',
    '  if (icon) html += "<div class=\\"tg-detail-icon\\">"+icon+"</div>";',
    '  html += "<div class=\\"tg-detail-name\\">"+name+"</div>";',
    '  if (desc) html += "<div class=\\"tg-detail-desc\\">"+desc+"</div>";',
    '  if (mode === "shop") {',
    '    html += "<div class=\\"tg-detail-meta\\">Price: "+price+"g &nbsp;|&nbsp; Your money: "+money+"g &nbsp;|&nbsp; In stock: "+qty+"</div>";',
    '    html += "<button class=\\"tg-detail-action\\" "+(money>=price?"":"disabled")+" onclick=\\"window.tgBuyNow(this)\\">Buy</button>";',
    '  } else {',
    '    html += "<div class=\\"tg-detail-meta\\">Qty: "+qty+"</div>";',
    '    html += "<button class=\\"tg-detail-action\\" onclick=\\"window.tgTakeNow(this)\\">Take</button>";',
    '  }',
    '  detail.innerHTML = html;',
    '};',
    '// Action dispatchers — walk up DOM to find context, no args needed in onclick',
    'window.tgBuyNow = function(el) {',
    '  var wrap = el.closest(".tg-container");',
    '  var sel  = wrap ? wrap.querySelector(".tg-cont-cell.tg-selected") : null;',
    '  if (!wrap || !sel) return;',
    '  window.tgBuyItem(wrap.dataset.cont, wrap.dataset.char, sel.dataset.item, 1);',
    '};',
    'window.tgTakeNow = function(el) {',
    '  var wrap = el.closest(".tg-container");',
    '  var sel  = wrap ? wrap.querySelector(".tg-cont-cell.tg-selected") : null;',
    '  if (!wrap || !sel) return;',
    '  window.tgTakeItem(wrap.dataset.cont, wrap.dataset.char, sel.dataset.item, 1);',
    '};',
    'window.tgLootNow = function(el) {',
    '  var wrap = el.closest(".tg-container");',
    '  if (!wrap) return;',
    '  window.tgLootAllItems(wrap.dataset.cont, wrap.dataset.char);',
    '};',
    '',
    '// tgContainer macro — renders the full interactive container grid',
    '// Usage: <<tgContainer "containerVarName" "heroVarName" ["Title"]>>',
    'Macro.add("tgContainer", {',
    '  handler: function() {',
    '    var contName = this.args[0];',
    '    var charName = this.args[1];',
    '    var title    = this.args[2] || "";',
    '    var cont     = _tgGetCont(contName);',
    '    var ch       = _tgGetChar(charName);',
    '    if (!cont || !ch) { this.error("tgContainer: container or character not found: "+contName+" / "+charName); return; }',
    '',
    '    var mode     = _tgModes[contName] || "loot";',
    '    var allItems = State.variables["items"] || {};',
    '    var detailId = "tg-det-"+contName;',
    '',
    '    var html = "<div class=\\"tg-container\\" data-cont=\\""+contName+"\\" data-char=\\""+charName+"\\" data-det=\\""+detailId+"\\">";',
    '    if (title) html += "<div class=\\"tg-cont-header\\">"+title+"</div>";',
    '',
    '    if (cont.items.length === 0) {',
    '      html += "<div class=\\"tg-cont-empty\\">Empty</div>";',
    '    } else {',
    '      html += "<div class=\\"tg-cont-body\\">";',
    '      html += "<div class=\\"tg-cont-grid\\">";',
    '      cont.items.forEach(function(slot) {',
    '        var item = allItems[slot.item] || {};',
    '        var name = item.name || slot.item;',
    '        var icon = item.icon ? "<img src=\\""+item.icon+"\\" alt=\\"\\">": "<span style=\\"font-size:28px;line-height:1\\">📦</span>";',
    '        var qty  = slot.qty === -1 ? "∞" : slot.qty;',
    '        html += "<div class=\\"tg-cont-cell\\" data-item=\\""+slot.item+"\\" onclick=\\"window.tgCellClick(this)\\">"+icon+"<span class=\\"tg-cell-qty\\">&times;"+qty+"</span><span class=\\"tg-cell-name\\">"+name+"</span></div>";',
    '      });',
    '      html += "</div>";',
    '      // detail panel',
    '      html += "<div class=\\"tg-cont-detail\\" id=\\""+detailId+"\\"><div class=\\"tg-detail-placeholder\\">Select an item</div></div>";',
    '      // loot-all button for chest/loot modes',
    '      html += "</div>";',
    '      if (mode !== "shop") {',
    '        html += "<div style=\\"margin-top:8px\\"><button class=\\"tg-detail-action\\" onclick=\\"window.tgLootNow(this)\\">Take all</button></div>";',
    '      }',
    '    }',
    '    html += "</div>";',
    '    $(this.output).wiki(html);',
    '  }',
    '});',
    '',
    '// Legacy action macros (for manual use in passages)',
    '// tgShopBuy "containerVarName" "itemVarName" "charVarName" [qty]',
    'Macro.add("tgShopBuy", {',
    '  handler: function() {',
    '    window.tgBuyItem(this.args[0], this.args[2], this.args[1], this.args[3] != null ? this.args[3] : 1);',
    '  }',
    '});',
    'Macro.add("tgShopSell", {',
    '  handler: function() {',
    '    var cont = _tgGetCont(this.args[0]); var ch = _tgGetChar(this.args[2]);',
    '    if (!cont || !ch) return;',
    '    var itemName = this.args[1]; var qty = this.args[3] != null ? this.args[3] : 1;',
    '    var items = State.variables["items"];',
    '    var idx = ch.inventory.findIndex(function(e){return e.item===itemName;});',
    '    if (idx === -1) return;',
    '    var price = (items && items[itemName] ? items[itemName].price||0 : 0) * qty;',
    '    ch.inventory[idx].qty -= qty;',
    '    if (ch.inventory[idx].qty <= 0) ch.inventory.splice(idx,1);',
    '    ch.money = (ch.money||0) + price;',
    '    Engine.show();',
    '  }',
    '});',
    'Macro.add("tgChestTake", {',
    '  handler: function() { window.tgTakeItem(this.args[0], this.args[2], this.args[1], this.args[3] != null ? this.args[3] : 1); }',
    '});',
    'Macro.add("tgLootAll", {',
    '  handler: function() { window.tgLootAllItems(this.args[0], this.args[1]); }',
    '});',
  ].join('\n');
}

// ─── Paperdoll export helpers ─────────────────────────────────────────────────

/**
/**
 * Generate a SugarCube <<if>>/<<elseif>>/<<else>> chain for a bound image mapping.
 * Returns the full conditional block including <</if>>.
 */
function buildBoundMappingHtml(
  vname: string,
  varType: string,
  mapping: { matchType?: string; value: string; rangeMin?: string; rangeMax?: string; src: string }[],
  defaultSrc: string,
  imgStyle: string,
): string {
  const imgTag = (src: string) => `<img src="${src}" style="${imgStyle}"/>`;
  const cases = mapping.map((m, i) => {
    const kw = i === 0 ? '<<if' : '<<elseif';
    const mt = m.matchType ?? 'exact';
    let cond: string;
    if (mt === 'range') {
      cond = `${vname} >= ${m.rangeMin ?? '0'} && ${vname} <= ${m.rangeMax ?? '0'}`;
    } else {
      const val = varType === 'string' ? `"${m.value}"` : m.value;
      cond = `${vname} eq ${val}`;
    }
    return `${kw} ${cond}>>${imgTag(m.src)}`;
  });
  if (defaultSrc) cases.push(`<<else>>${imgTag(defaultSrc)}`);
  if (cases.length > 0) cases.push('<</if>>');
  return cases.join('');
}

/**
 * Build SugarCube HTML for a paperdoll grid cell in the sidebar panel.
 * Generates a static CSS-grid container with <<if>> expressions for each slot.
 */
function buildPaperdollCellSC(
  charVarName: string,
  pd: import('../types').PaperdollConfig,
  showLabels?: boolean,
  vars?: Variable[],
  nodes?: VariableTreeNode[],
  items?: ItemDefinition[],
): string {
  const { gridCols, gridRows, cellSize, slots } = pd;
  const gridStyle = [
    'display:grid',
    `grid-template-columns:repeat(${gridCols},${cellSize}px)`,
    `grid-template-rows:repeat(${gridRows},${cellSize}px)`,
    'gap:2px',
  ].join(';');

  const slotDivs = slots.map(slot => {
    const equipVar = `$${charVarName}.equipment.${slot.id}`;
    const slotLabelNorm = (slot.label || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const baseCellStyle = [
      `grid-row:${slot.row}`,
      `grid-column:${slot.col}`,
      `width:${cellSize}px`,
      `height:${cellSize}px`,
      'box-sizing:border-box',
      'overflow:hidden',
      'border:1px solid rgba(100,116,139,0.7)',
      'border-radius:3px',
      'position:relative',
      'background:rgba(15,23,42,0.5)',
    ];
    const cellStyle = (slot.clickable ? [...baseCellStyle, 'cursor:pointer'] : baseCellStyle).join(';');
    const cellClick = slot.clickable
      ? ` onclick="tgSlotMenu('${charVarName}','${slot.id}','${slotLabelNorm}',event)"`
      : '';

    const phImgStyle = 'width:100%;height:100%;object-fit:contain;opacity:0.3;pointer-events:none;';
    const imgStyle   = 'width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;';

    // ── Empty-slot placeholder ────────────────────────────────────────────────
    const ph = slot.placeholder;
    let emptySlotContent: string;
    if (ph && ph.mode === 'bound' && ph.variableId && ph.mapping?.length && vars && nodes) {
      const boundVar = vars.find(v => v.id === ph.variableId);
      if (boundVar) {
        const vname = `$${varPath(boundVar, nodes)}`;
        emptySlotContent = buildBoundMappingHtml(vname, boundVar.varType, ph.mapping, ph.defaultSrc ?? '', phImgStyle);
      } else {
        emptySlotContent = ph.defaultSrc
          ? `<img src="${ph.defaultSrc}" style="${phImgStyle}"/>`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;pointer-events:none;"><span style="font-size:1.4em;opacity:0.2;color:#94a3b8;">○</span></div>`;
      }
    } else {
      const staticSrc = ph?.src || slot.placeholderIcon;
      emptySlotContent = staticSrc
        ? `<img src="${staticSrc}" style="${phImgStyle}"/>`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;pointer-events:none;"><span style="font-size:1.4em;opacity:0.2;color:#94a3b8;">○</span></div>`;
    }

    // Label overlay (optional)
    const label = showLabels
      ? `<div style="position:absolute;bottom:0;left:0;right:0;font-size:0.6em;text-align:center;background:rgba(0,0,0,0.6);color:#cbd5e1;pointer-events:none;padding:1px 0;">${slot.label}</div>`
      : '';

    // ── Equipped item image (supports bound icon mode) ────────────────────────
    const boundItems = vars && nodes
      ? (items ?? []).filter(i =>
          i.iconConfig.mode === 'bound' &&
          i.iconConfig.variableId &&
          (i.iconConfig.mapping?.length ?? 0) > 0,
        )
      : [];

    let equippedImg: string;
    if (boundItems.length > 0) {
      const branches = boundItems.map((item, idx) => {
        const kw = idx === 0
          ? `<<if ${equipVar} eq "${item.varName}">>`
          : `<<elseif ${equipVar} eq "${item.varName}">>`;
        const bv = vars!.find(v => v.id === item.iconConfig.variableId);
        if (!bv) return `${kw}<img @src="$items[${equipVar}].icon" style="${imgStyle}"/>`;
        const vname = `$${varPath(bv, nodes!)}`;
        const chain = buildBoundMappingHtml(vname, bv.varType, item.iconConfig.mapping ?? [], item.iconConfig.defaultSrc ?? '', imgStyle);
        return `${kw}${chain}`;
      });
      branches.push(`<<else>><img @src="$items[${equipVar}].icon" style="${imgStyle}"/>`);
      branches.push('<</if>>');
      equippedImg = branches.join('');
    } else {
      equippedImg = `<img @src="$items[${equipVar}].icon" style="${imgStyle}"/>`;
    }

    const equipped = [
      `<<if ${equipVar} neq "">>`,
      equippedImg,
      label,
      `<<else>>`,
      emptySlotContent,
      `<</if>>`,
    ].join('');

    return `<div class="tg-pd-slot" style="${cellStyle}"${cellClick}>${equipped}</div>`;
  }).join('');

  return `<div style="display:flex;justify-content:center;width:100%"><div class="tg-paperdoll" style="${gridStyle}">${slotDivs}</div></div>`;
}

export function buildPaperdollCSS(project: Project): string {
  const hasAnyPaperdoll = project.characters.some(c => c.paperdoll?.slots?.length);
  if (!hasAnyPaperdoll) return '';
  return [
    '.tg-pd-slot:hover { border-color: rgba(99,102,241,0.8) !important; }',
    '.tg-pd-menu { position: fixed; z-index: 10000; background: #1a1a2e; border: 1px solid rgba(99,102,241,0.5); border-radius: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); padding: 4px; min-width: 160px; max-height: 60vh; overflow-y: auto; }',
    '.tg-pd-menu-item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 3px; cursor: pointer; color: #e2e8f0; font-size: 13px; transition: background 0.1s; }',
    '.tg-pd-menu-item:hover { background: rgba(99,102,241,0.25); }',
    '.tg-pd-menu-item.tg-pd-menu-unequip { color: #f87171; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 2px; padding-bottom: 6px; }',
    '.tg-pd-menu-icon { width: 24px; height: 24px; object-fit: contain; display: inline-block; flex-shrink: 0; }',
    '.tg-pd-menu-label { flex: 1; white-space: nowrap; }',
    '.tg-pd-menu-empty { padding: 8px 10px; color: rgba(255,255,255,0.4); font-size: 12px; text-align: center; }',
  ].join('\n');
}

export function buildPaperdollScript(project: Project): string {
  const hasAnyPaperdoll = project.characters.some(c => c.paperdoll?.slots?.length);
  if (!hasAnyPaperdoll) return '';

  return [
    '// ── Paperdoll macros ──',
    '// tgEquip($charVar, itemVarName) — equips wearable item into its target slot',
    'Macro.add("tgEquip", {',
    '  handler: function() {',
    '    var charVar = this.args[0];',
    '    var itemName = this.args[1];',
    '    if (!charVar || !itemName) return;',
    '    var items = State.variables["items"];',
    '    var item = items ? items[itemName] : null;',
    '    if (!item || !item.slot) return;',
    '    var slot = item.slot;',
    '    if (!charVar.equipment) charVar.equipment = {};',
    '    // Unequip anything already in the slot',
    '    var prev = charVar.equipment[slot];',
    '    if (prev && charVar.inventory) {',
    '      var pe = charVar.inventory.find(function(e){ return e.item === prev; });',
    '      if (pe) pe.equipped = false;',
    '    }',
    '    charVar.equipment[slot] = itemName;',
    '    // Mark as equipped in inventory',
    '    if (charVar.inventory) {',
    '      var e = charVar.inventory.find(function(e){ return e.item === itemName; });',
    '      if (e) e.equipped = true;',
    '    }',
    '    UIBar.update();',
    '  }',
    '});',
    '',
    '// tgUnequip($charVar, slotId) — unequips item from named slot',
    'Macro.add("tgUnequip", {',
    '  handler: function() {',
    '    var charVar = this.args[0];',
    '    var slotId = this.args[1];',
    '    if (!charVar || !slotId || !charVar.equipment) return;',
    '    var itemName = charVar.equipment[slotId];',
    '    charVar.equipment[slotId] = "";',
    '    if (itemName && charVar.inventory) {',
    '      var e = charVar.inventory.find(function(e){ return e.item === itemName; });',
    '      if (e) e.equipped = false;',
    '    }',
    '  }',
    '});',
    '',
    '// tgIsEquipped(charVar, itemVarName) → boolean (use in expressions)',
    'window.tgIsEquipped = function(charVar, itemName) {',
    '  if (!charVar || !charVar.equipment || !itemName) return false;',
    '  return Object.values(charVar.equipment).indexOf(itemName) !== -1;',
    '};',
    '',
    '// tgSlotMenu(charVarName, slotId, slotLabelNorm, event) — open a popup menu to equip/unequip',
    '// Shows compatible items from the character inventory + an Unequip option.',
    'window.tgSlotMenu = function(charVarName, slotId, slotLabelNorm, ev) {',
    '  if (ev) { ev.stopPropagation(); ev.preventDefault(); }',
    '  var ch = State.variables[charVarName];',
    '  if (!ch) return;',
    '  if (!ch.equipment) ch.equipment = {};',
    '  if (!ch.inventory) ch.inventory = [];',
    '  var items = State.variables["items"] || {};',
    '  var currentEquipped = ch.equipment[slotId] || "";',
    '  // Compatible: inventory entries whose item.slot matches slotId or normalized label',
    '  var compatible = ch.inventory.filter(function(entry) {',
    '    var it = items[entry.item];',
    '    if (!it || !it.slot) return false;',
    '    var nslot = String(it.slot).toLowerCase().replace(/\\s+/g,"_").replace(/[^a-z0-9_]/g,"");',
    '    return nslot === slotId || nslot === slotLabelNorm;',
    '  });',
    '  // Remove any existing menu',
    '  var existing = document.getElementById("tg-pd-menu");',
    '  if (existing) existing.remove();',
    '  var menu = document.createElement("div");',
    '  menu.id = "tg-pd-menu";',
    '  menu.className = "tg-pd-menu";',
    '  function addRow(html, onClick, extraCls) {',
    '    var row = document.createElement("div");',
    '    row.className = "tg-pd-menu-item" + (extraCls ? " " + extraCls : "");',
    '    row.innerHTML = html;',
    '    row.addEventListener("click", function(e) { e.stopPropagation(); onClick(); menu.remove(); UIBar.update(); });',
    '    menu.appendChild(row);',
    '  }',
    '  if (currentEquipped) {',
    '    var curIt = items[currentEquipped] || {};',
    '    var curIcon = curIt.icon ? \'<img src="\' + curIt.icon + \'" class="tg-pd-menu-icon"/>\' : \'<span class="tg-pd-menu-icon"></span>\';',
    '    addRow(curIcon + \'<span class="tg-pd-menu-label">✕ \' + (curIt.name || currentEquipped) + \'</span>\', function() {',
    '      ch.equipment[slotId] = "";',
    '      var e = ch.inventory.find(function(x){ return x.item === currentEquipped; });',
    '      if (e) e.equipped = false;',
    '    }, "tg-pd-menu-unequip");',
    '  }',
    '  compatible.forEach(function(entry) {',
    '    if (entry.item === currentEquipped) return;',
    '    var it = items[entry.item] || {};',
    '    var icon = it.icon ? \'<img src="\' + it.icon + \'" class="tg-pd-menu-icon"/>\' : \'<span class="tg-pd-menu-icon"></span>\';',
    '    addRow(icon + \'<span class="tg-pd-menu-label">\' + (it.name || entry.item) + \'</span>\', function() {',
    '      if (currentEquipped) {',
    '        var old = ch.inventory.find(function(x){ return x.item === currentEquipped; });',
    '        if (old) old.equipped = false;',
    '      }',
    '      ch.equipment[slotId] = entry.item;',
    '      entry.equipped = true;',
    '    });',
    '  });',
    '  if (menu.children.length === 0) {',
    '    var empty = document.createElement("div");',
    '    empty.className = "tg-pd-menu-empty";',
    '    empty.textContent = "No compatible items";',
    '    menu.appendChild(empty);',
    '  }',
    '  document.body.appendChild(menu);',
    '  // Position next to the clicked cell',
    '  var rect = (ev && ev.currentTarget ? ev.currentTarget : ev && ev.target).getBoundingClientRect();',
    '  var mw = menu.offsetWidth, mh = menu.offsetHeight;',
    '  var vw = window.innerWidth, vh = window.innerHeight;',
    '  var left = rect.right + 4;',
    '  if (left + mw > vw) left = Math.max(4, rect.left - mw - 4);',
    '  var top = rect.top;',
    '  if (top + mh > vh) top = Math.max(4, vh - mh - 4);',
    '  menu.style.left = left + "px";',
    '  menu.style.top = top + "px";',
    '  setTimeout(function() {',
    '    var closer = function(e) {',
    '      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", closer); document.removeEventListener("keydown", keyCloser); }',
    '    };',
    '    var keyCloser = function(e) {',
    '      if (e.key === "Escape") { menu.remove(); document.removeEventListener("click", closer); document.removeEventListener("keydown", keyCloser); }',
    '    };',
    '    document.addEventListener("click", closer);',
    '    document.addEventListener("keydown", keyCloser);',
    '  }, 0);',
    '};',
  ].join('\n');
}

export function buildInventoryCSS(project: Project): string {
  if (!project.characters.length) return '';
  return [
    '.tg-inv-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }',
    '.tg-inv-tab { padding: 4px 10px; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; background: transparent; color: #e2e8f0; cursor: pointer; font-size: 12px; transition: background 0.1s, border-color 0.1s; }',
    '.tg-inv-tab:hover { border-color: rgba(255,255,255,0.4); }',
    '.tg-inv-tab.tg-active { background: rgba(99,102,241,0.25); border-color: #6366f1; }',
    '.tg-cont-cell.tg-inv-equipped { box-shadow: inset 0 0 0 2px #10b981; }',
    '.tg-cont-cell.tg-inv-equipped::after { content: "✔"; position: absolute; top: 2px; right: 4px; font-size: 11px; color: #10b981; text-shadow: 0 0 2px rgba(0,0,0,0.6); }',
    '.tg-detail-actions { display: flex; gap: 6px; flex-wrap: wrap; }',
    '.tg-detail-action.tg-inv-drop { background: #dc2626; }',
    '.tg-detail-action.tg-inv-drop:hover:not(:disabled) { background: #b91c1c; }',
  ].join('\n');
}

export function buildInventoryScript(project: Project): string {
  if (!project.characters.length) return '';

  return [
    '// ── Inventory macros ──',
    'Macro.add("tgInvAdd", {',
    '  handler: function() {',
    '    var charVar = this.args[0];',
    '    var itemName = this.args[1];',
    '    var qty = this.args[2] != null ? this.args[2] : 1;',
    '    if (!charVar || !charVar.inventory) return;',
    '    var items = State.variables["items"];',
    '    var item = items ? items[itemName] : null;',
    '    if (item && item.stackable) {',
    '      var ex = charVar.inventory.find(function(e) { return e.item === itemName; });',
    '      if (ex) { ex.qty += qty; return; }',
    '    }',
    '    charVar.inventory.push({ item: itemName, qty: qty, equipped: false });',
    '  }',
    '});',
    '',
    'Macro.add("tgInvRemove", {',
    '  handler: function() {',
    '    var charVar = this.args[0];',
    '    var itemName = this.args[1];',
    '    var qty = this.args[2] != null ? this.args[2] : 1;',
    '    if (!charVar || !charVar.inventory) return;',
    '    var idx = charVar.inventory.findIndex(function(e) { return e.item === itemName; });',
    '    if (idx === -1) return;',
    '    charVar.inventory[idx].qty -= qty;',
    '    if (charVar.inventory[idx].qty <= 0) charVar.inventory.splice(idx, 1);',
    '  }',
    '});',
    '',
    '// Inventory helpers usable in <<if>> expressions',
    'window.tgInvHas = function(charVar, itemName) {',
    '  if (!charVar || !charVar.inventory) return false;',
    '  return charVar.inventory.some(function(e) { return e.item === itemName; });',
    '};',
    'window.tgInvCount = function(charVar, itemName) {',
    '  if (!charVar || !charVar.inventory) return 0;',
    '  var entry = charVar.inventory.find(function(e) { return e.item === itemName; });',
    '  return entry ? entry.qty : 0;',
    '};',
    '',
    '// ── Inventory UI (tgInventory) ──',
    'window._tgInvState = window._tgInvState || {};',
    'window._tgInvDialog = function(title, bodyHtml) {',
    '  if (typeof Dialog === "undefined") { alert(bodyHtml.replace(/<[^>]+>/g, "")); return; }',
    '  Dialog.setup(title);',
    '  Dialog.wiki(bodyHtml);',
    '  Dialog.open();',
    '};',
    '',
    'window._tgInvNormSlot = function(s) {',
    '  return String(s || "").toLowerCase().replace(/\\s+/g, "_").replace(/[^a-z0-9_]/g, "");',
    '};',
    '',
    'window._tgInvCharHasSlot = function(ch, slotName) {',
    '  if (!ch || !ch.equipment) return false;',
    '  var norm = window._tgInvNormSlot(slotName);',
    '  var keys = Object.keys(ch.equipment);',
    '  for (var i = 0; i < keys.length; i++) {',
    '    if (window._tgInvNormSlot(keys[i]) === norm) return true;',
    '  }',
    '  return false;',
    '};',
    '',
    'window._tgInvRender = function(wrap) {',
    '  var charName = wrap.dataset.char;',
    '  var ch = State.variables[charName];',
    '  if (!ch) return;',
    '  if (!ch.inventory) ch.inventory = [];',
    '  var state = window._tgInvState[wrap.id] || { cat: "all", selected: "" };',
    '  window._tgInvState[wrap.id] = state;',
    '  var items = State.variables["items"] || {};',
    '  var filtered = ch.inventory.filter(function(e) {',
    '    if (state.cat === "all") return true;',
    '    var it = items[e.item] || {};',
    '    return (it.category || "misc") === state.cat;',
    '  });',
    '  var grid = wrap.querySelector(".tg-cont-grid");',
    '  var detail = wrap.querySelector(".tg-cont-detail");',
    '  var empty = wrap.querySelector(".tg-inv-empty");',
    '  // Tabs',
    '  wrap.querySelectorAll(".tg-inv-tab").forEach(function(t) {',
    '    t.classList.toggle("tg-active", t.dataset.cat === state.cat);',
    '  });',
    '  if (!filtered.length) {',
    '    if (grid) grid.innerHTML = "";',
    '    if (empty) empty.style.display = "";',
    '    if (detail) detail.innerHTML = \'<div class="tg-detail-placeholder">\' + (state.cat === "all" ? "Inventory is empty" : "No items in this category") + \'</div>\';',
    '    return;',
    '  }',
    '  if (empty) empty.style.display = "none";',
    '  var cellsHtml = filtered.map(function(e) {',
    '    var it = items[e.item] || {};',
    '    var name = it.name || e.item;',
    '    var icon = it.icon ? \'<img src="\' + it.icon + \'" alt="">\' : \'<span style="font-size:28px;line-height:1">📦</span>\';',
    '    var eqCls = e.equipped ? " tg-inv-equipped" : "";',
    '    var sel = (state.selected === e.item) ? " tg-selected" : "";',
    '    return \'<div class="tg-cont-cell\' + eqCls + sel + \'" data-item="\' + e.item + \'" onclick="window._tgInvCellClick(this)">\' + icon + \'<span class="tg-cell-qty">&times;\' + e.qty + \'</span><span class="tg-cell-name">\' + name + \'</span></div>\';',
    '  }).join("");',
    '  if (grid) grid.innerHTML = cellsHtml;',
    '  // Detail panel',
    '  if (!detail) return;',
    '  var selEntry = state.selected ? ch.inventory.find(function(x) { return x.item === state.selected; }) : null;',
    '  if (!selEntry) {',
    '    detail.innerHTML = \'<div class="tg-detail-placeholder">Select an item</div>\';',
    '    return;',
    '  }',
    '  var it = items[selEntry.item] || {};',
    '  var name = it.name || selEntry.item;',
    '  var desc = it.description || "";',
    '  var icon = it.icon ? \'<img src="\' + it.icon + \'">\' : "";',
    '  var html = "";',
    '  if (icon) html += \'<div class="tg-detail-icon">\' + icon + \'</div>\';',
    '  html += \'<div class="tg-detail-name">\' + name + \'</div>\';',
    '  if (desc) html += \'<div class="tg-detail-desc">\' + desc + \'</div>\';',
    '  html += \'<div class="tg-detail-meta">Qty: \' + selEntry.qty + (selEntry.equipped ? " &nbsp;|&nbsp; Equipped" : "") + \'</div>\';',
    '  html += \'<div class="tg-detail-actions">\';',
    '  var cat = it.category || "misc";',
    '  if (cat === "wearable") {',
    '    if (selEntry.equipped) {',
    '      html += \'<button class="tg-detail-action" onclick="window._tgInvUnequip(this)">Unequip</button>\';',
    '    } else {',
    '      html += \'<button class="tg-detail-action" onclick="window._tgInvEquip(this)">Equip</button>\';',
    '    }',
    '  } else if (cat === "consumable") {',
    '    html += \'<button class="tg-detail-action" onclick="window._tgInvUse(this)">Use</button>\';',
    '  }',
    '  html += \'<button class="tg-detail-action tg-inv-drop" onclick="window._tgInvDrop(this)">Drop</button>\';',
    '  html += \'</div>\';',
    '  detail.innerHTML = html;',
    '};',
    '',
    'window._tgInvTabClick = function(el) {',
    '  var wrap = el.closest(".tg-container");',
    '  if (!wrap) return;',
    '  var st = window._tgInvState[wrap.id] || (window._tgInvState[wrap.id] = { cat: "all", selected: "" });',
    '  st.cat = el.dataset.cat || "all";',
    '  st.selected = "";',
    '  window._tgInvRender(wrap);',
    '};',
    '',
    'window._tgInvCellClick = function(el) {',
    '  var wrap = el.closest(".tg-container");',
    '  if (!wrap) return;',
    '  var st = window._tgInvState[wrap.id] || (window._tgInvState[wrap.id] = { cat: "all", selected: "" });',
    '  st.selected = el.dataset.item;',
    '  window._tgInvRender(wrap);',
    '};',
    '',
    'window._tgInvCtx = function(el) {',
    '  var wrap = el.closest(".tg-container");',
    '  if (!wrap) return null;',
    '  var st = window._tgInvState[wrap.id];',
    '  if (!st || !st.selected) return null;',
    '  var ch = State.variables[wrap.dataset.char];',
    '  if (!ch) return null;',
    '  var items = State.variables["items"] || {};',
    '  var it = items[st.selected] || {};',
    '  return { wrap: wrap, ch: ch, st: st, it: it, itemName: st.selected };',
    '};',
    '',
    'window._tgInvEquip = function(el) {',
    '  var ctx = window._tgInvCtx(el);',
    '  if (!ctx) return;',
    '  var slot = ctx.it.targetSlot || ctx.it.slot;',
    '  if (!slot) { window._tgInvDialog("Cannot equip", "This item has no target slot."); return; }',
    '  if (!window._tgInvCharHasSlot(ctx.ch, slot)) {',
    '    window._tgInvDialog("Cannot equip", \'Paperdoll has no slot named "\' + slot + \'".\');',
    '    return;',
    '  }',
    '  if (!ctx.ch.equipment) ctx.ch.equipment = {};',
    '  var norm = window._tgInvNormSlot(slot);',
    '  var targetKey = slot;',
    '  Object.keys(ctx.ch.equipment).forEach(function(k) {',
    '    if (window._tgInvNormSlot(k) === norm) targetKey = k;',
    '  });',
    '  var prev = ctx.ch.equipment[targetKey];',
    '  if (prev) {',
    '    var pe = ctx.ch.inventory.find(function(e) { return e.item === prev; });',
    '    if (pe) pe.equipped = false;',
    '  }',
    '  ctx.ch.equipment[targetKey] = ctx.itemName;',
    '  var e = ctx.ch.inventory.find(function(x) { return x.item === ctx.itemName; });',
    '  if (e) e.equipped = true;',
    '  window._tgInvRender(ctx.wrap);',
    '  UIBar.update();',
    '};',
    '',
    'window._tgInvUnequip = function(el) {',
    '  var ctx = window._tgInvCtx(el);',
    '  if (!ctx || !ctx.ch.equipment) return;',
    '  Object.keys(ctx.ch.equipment).forEach(function(k) {',
    '    if (ctx.ch.equipment[k] === ctx.itemName) ctx.ch.equipment[k] = "";',
    '  });',
    '  var e = ctx.ch.inventory.find(function(x) { return x.item === ctx.itemName; });',
    '  if (e) e.equipped = false;',
    '  window._tgInvRender(ctx.wrap);',
    '  UIBar.update();',
    '};',
    '',
    'window._tgInvUse = function(el) {',
    '  var ctx = window._tgInvCtx(el);',
    '  if (!ctx) return;',
    '  var idx = ctx.ch.inventory.findIndex(function(e) { return e.item === ctx.itemName; });',
    '  if (idx === -1) return;',
    '  ctx.ch.inventory[idx].qty -= 1;',
    '  if (ctx.ch.inventory[idx].qty <= 0) {',
    '    ctx.ch.inventory.splice(idx, 1);',
    '    ctx.st.selected = "";',
    '  }',
    '  window._tgInvRender(ctx.wrap);',
    '  UIBar.update();',
    '};',
    '',
    'window._tgInvDrop = function(el) {',
    '  var ctx = window._tgInvCtx(el);',
    '  if (!ctx) return;',
    '  var wrapId = ctx.wrap.id;',
    '  var itemName = ctx.itemName;',
    '  var name = ctx.it.name || itemName;',
    '  var entry = ctx.ch.inventory.find(function(e) { return e.item === itemName; });',
    '  if (!entry) return;',
    '  var qty = entry.qty;',
    '  if (typeof Dialog === "undefined") {',
    '    if (!confirm("Drop " + qty + "× " + name + "?")) return;',
    '    window._tgInvDoDrop(wrapId, itemName);',
    '    return;',
    '  }',
    '  Dialog.setup("Drop item");',
    '  var body = \'<p>Drop \' + qty + \'× \' + name + \'?</p>\' +',
    '             \'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">\' +',
    '             \'<button class="tg-detail-action" onclick="Dialog.close()">Cancel</button>\' +',
    '             \'<button class="tg-detail-action tg-inv-drop" onclick="Dialog.close();window._tgInvDoDrop(\\\'\' + wrapId + \'\\\',\\\'\' + itemName + \'\\\')">Drop</button>\' +',
    '             \'</div>\';',
    '  Dialog.wiki(body);',
    '  Dialog.open();',
    '};',
    '',
    'window._tgInvDoDrop = function(wrapId, itemName) {',
    '  var wrap = document.getElementById(wrapId);',
    '  if (!wrap) return;',
    '  var ch = State.variables[wrap.dataset.char];',
    '  if (!ch || !ch.inventory) return;',
    '  var idx = ch.inventory.findIndex(function(e) { return e.item === itemName; });',
    '  if (idx === -1) return;',
    '  var entry = ch.inventory[idx];',
    '  if (entry.equipped && ch.equipment) {',
    '    Object.keys(ch.equipment).forEach(function(k) {',
    '      if (ch.equipment[k] === itemName) ch.equipment[k] = "";',
    '    });',
    '  }',
    '  ch.inventory.splice(idx, 1);',
    '  var st = window._tgInvState[wrap.id];',
    '  if (st) st.selected = "";',
    '  window._tgInvRender(wrap);',
    '  UIBar.update();',
    '};',
    '',
    '// <<tgInventory "charVarName" ["Title"]>>',
    'Macro.add("tgInventory", {',
    '  handler: function() {',
    '    var charName = this.args[0];',
    '    var title    = this.args[1] || "";',
    '    var ch = State.variables[charName];',
    '    if (!ch) { this.error("tgInventory: character not found: " + charName); return; }',
    '    if (!ch.inventory) ch.inventory = [];',
    '    var wrapId = "tg-inv-" + charName + "-" + (Math.random().toString(36).substr(2, 6));',
    '    var tabs = [',
    '      { cat: "all",        label: "All" },',
    '      { cat: "wearable",   label: "👕 Wearable" },',
    '      { cat: "consumable", label: "🧪 Consumable" },',
    '      { cat: "misc",       label: "📦 Misc" },',
    '    ];',
    '    var tabsHtml = \'<div class="tg-inv-tabs">\' + tabs.map(function(t) {',
    '      return \'<button type="button" class="tg-inv-tab\' + (t.cat === "all" ? " tg-active" : "") + \'" data-cat="\' + t.cat + \'" onclick="window._tgInvTabClick(this)">\' + t.label + \'</button>\';',
    '    }).join("") + \'</div>\';',
    '    var html = \'<div class="tg-container" id="\' + wrapId + \'" data-char="\' + charName + \'">\';',
    '    if (title) html += \'<div class="tg-cont-header">\' + title + \'</div>\';',
    '    html += tabsHtml;',
    '    html += \'<div class="tg-cont-body">\';',
    '    html += \'<div class="tg-cont-grid"></div>\';',
    '    html += \'<div class="tg-cont-detail"><div class="tg-detail-placeholder">Select an item</div></div>\';',
    '    html += \'</div>\';',
    '    html += \'<div class="tg-inv-empty tg-cont-empty" style="display:none">Inventory is empty</div>\';',
    '    html += \'</div>\';',
    '    var self = this;',
    '    $(self.output).wiki(html);',
    '    setTimeout(function() {',
    '      var wrap = document.getElementById(wrapId);',
    '      if (wrap) window._tgInvRender(wrap);',
    '    }, 0);',
    '  }',
    '});',
  ].join('\n');
}

export function downloadFile(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
