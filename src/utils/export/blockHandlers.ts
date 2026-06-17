import type {
  Block, BlockType, IncludeBlock,
  CheckboxBlock, RadioBlock, AudioBlock, AudioGenBlock, ContainerBlock,
  TimeManipulationBlock, PluginBlock, QuestState,
} from '../../types';
import type { BlockContext } from '../exportToTwee';
import {
  blockToSC, varPath, scStr, sceneTarget, htmlAttr, varRefWithAccessor, buildJSRef,
  actionToSC, emitAudioPlayback, getPluginDef, branchToSC, tableBlockToSC,
  buildProgressBarSC, buildDateTimeCellSC, buildAudioVolumeBlockSC, buildPaperdollCellSC,
  choiceConditionExpr, buildSetObjectLiteral,
} from '../exportToTwee';
import {
  simpleBlockCascadeClasses, simpleBlockDataStyleBind, buildSimpleBlockSpotStyleBlock,
  dialogueElementClasses, dialogueDataStyleBind, buildDialogueSpotStyleBlock,
  buttonElementClasses, buttonDataStyleBind, buildButtonSpotStyleBlock,
} from '../styleCascade';
import { pluginValueLiteral } from '../pluginUtils';

// Per-block-type export handlers, dispatched by blockToSCInner in exportToTwee.ts.
// Extracted from the old monolithic switch; leaf builders + the recursion entry
// (blockToSC) + shared helpers are imported from exportToTwee (function-level cycle).
type BlockHandler<K extends BlockType> = (block: Extract<Block, { type: K }>, ctx: BlockContext) => string;
type HandlerMap = { [K in BlockType]: BlockHandler<K> };

export const HANDLERS: HandlerMap = {
  raw: (block, ctx) => {
    if (!block.code) return '';
    return block.code.split('\n').map(line => `${ctx.indent}${line}`).join('\n');
  },

  spacer: (block, ctx) => {
    const size = (typeof block.size === 'number' && block.size >= 0) ? block.size : 8;
    return `${ctx.indent}<div class="tg-spacer" style="height:${size}px"></div>`;
  },

  'audio-volume': (block, ctx) => `${ctx.indent}${buildAudioVolumeBlockSC(block)}`,

  callout: (block, ctx) => {
    const icon = (block.icon ?? '').trim();
    const iconSpan = icon ? `<span class="tg-callout-icon">${icon}</span>` : '';
    const title = (block.title ?? '').trim();
    const titleDiv = title ? `<div class="tg-callout-title">${title}</div>` : '';
    return `${ctx.indent}<div class="tg-callout tg-callout-${block.variant}">${iconSpan}<div class="tg-callout-body">${titleDiv}${block.content}</div></div>`;
  },

  note: () => '',

  save: (block, ctx) => {
    const sTitle = (block.title ?? '').trim();
    const saveCall = `${ctx.indent}<<run Save.autosave.save(${sTitle ? JSON.stringify(sTitle) : ''})>>`;
    if (!block.notify) return saveCall;
    const msg = (block.notifyText ?? '').trim() || '✓';
    const notify = `<<script>>(function(){var n=$('<div>').text(${JSON.stringify(msg)}).css({position:'fixed',bottom:'1.2em',left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,.82)',color:'#fff',padding:'.4em .9em',borderRadius:'.4em',zIndex:99999,fontSize:'.9em',opacity:0,transition:'opacity .3s',pointerEvents:'none'}).appendTo('body');setTimeout(function(){n.css('opacity',1);},16);setTimeout(function(){n.css('opacity',0);setTimeout(function(){n.remove();},320);},1500);})();<</script>>`;
    return `${saveCall}${notify}`;
  },

  text: (block, ctx) => {
    const { indent, project, passageCtx } = ctx;
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
  },

  dialogue: (block, ctx) => {
    const { chars, vars, nodes, indent, idToName, project } = ctx;
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
          const val = boundVar?.varType === 'string' ? scStr(m.value) : m.value;
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
  },

  choice: (block, ctx) => {
    const { vars, nodes, indent, idToName, project } = ctx;
    if (block.options.length === 0) return '';
    const lines = block.options.map(opt => {
      // Structured condition takes priority; fall back to legacy free-text field
      const cond = choiceConditionExpr(opt, vars, nodes) || opt.condition.trim();
      const raw = opt.targetSceneId || '';
      const target = raw ? sceneTarget(raw, idToName) : '"Start"';
      const link = `<<link ${scStr(opt.label)} ${target}>><</link>>`;
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
  },

  condition: (block, ctx) => {
    const { chars, vars, nodes, indent, idToName, project } = ctx;
    if (block.branches.length === 0) return '';
    return block.branches
      .map((branch, i) => branchToSC(branch, chars, vars, nodes, indent, i === 0, idToName, project))
      .join('\n') + `\n${indent}<</if>>`;
  },

  for: (block, ctx) => {
    const { chars, vars, nodes, indent, idToName, project } = ctx;
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
  },

  'set-object': (block, ctx) => {
    const { vars, nodes, indent } = ctx;
    const v = vars.find(x => x.id === block.variableId);
    if (!v) return `${indent}/* variable not found */`;
    const path = varPath(v, nodes);
    const literal = buildSetObjectLiteral(block.entries);
    return `${indent}<<set $${path} = ${literal}>>`;
  },

  'variable-set': (block, ctx) => {
    const { vars, nodes, indent } = ctx;
    const v = vars.find(x => x.id === block.variableId);
    if (!v) return `${indent}/* variable not found */`;
    const path = varPath(v, nodes);

    // ── Array type — special operators ──────────────────────────────────────
    if (v.varType === 'array') {
      const accessorKind = block.accessor?.kind ?? 'whole';
      if (accessorKind === 'index') {
        const ref = varRefWithAccessor(path, block.accessor, vars, nodes);
        return `${indent}<<set ${ref} to ${scStr(block.value)}>>`;
      }
      switch (block.operator) {
        case 'push':   return `${indent}<<run $${path}.push(${scStr(block.value)})>>`;
        case 'remove': return `${indent}<<run $${path}.deleteWith(function(x){return x===${scStr(block.value)};})>>`;
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
          const val = cv?.varType === 'string' ? scStr(m.value) : m.value;
          cond = `${cvName} eq ${val}`;
        }
        return `${indent}${kw} ${cond}>><<set $${path} to ${scStr(m.result)}>>`;
      });

      if (block.dynamicDefault !== undefined) {
        cases.push(`${indent}<<else>><<set $${path} to ${scStr(block.dynamicDefault)}>>`);
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
    if (v.varType === 'string' || v.varType === 'datetime') val = scStr(val);
    if (block.operator === '=') return `${indent}<<set $${path} to ${val}>>`;
    return `${indent}<<set $${path} ${block.operator} ${val}>>`;
  },

  image: (block, ctx) => {
    const { vars, nodes, indent, project } = ctx;
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
          const val = bv?.varType === 'string' ? scStr(m.value) : m.value;
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
  },

  'image-gen': (block, ctx) => {
    const { vars, nodes, indent, project } = ctx;
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
          const val = bv?.varType === 'string' ? scStr(m.value) : m.value;
          cond = `${vname} eq ${val}`;
        }
        return `${indent}${kw} ${cond}>>${imgTag(m.src)}`;
      });

      if (block.defaultSrc) cases.push(`${indent}<<else>>${imgTag(block.defaultSrc)}`);
      cases.push(`${indent}<</if>>`);
      return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}>\n${cases.join('\n')}\n${indent}</div>`;
    }

    return `${spotPrefix}${indent}<div class="${classes}"${bindAttr}>${imgTag(block.src)}</div>`;
  },

  video: (block, ctx) => {
    const { indent, project } = ctx;
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
  },

  'input-field': (block, ctx) => {
    const { vars, nodes, indent, project } = ctx;
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
  },

  include: (block, ctx) => {
    const { indent, idToName, project } = ctx;
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
  },

  divider: (block, ctx) => {
    const { indent, project } = ctx;
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
  },

  progress: (block, ctx) => {
    const { vars, nodes, indent } = ctx;
    // Reuse the progress-bar renderer (CSS-class path). A standalone block needs an
    // explicit height since `.tg-progress` is height:100% — wrap in a sized div.
    const h = (typeof block.height === 'number' && block.height > 0) ? block.height : 16;
    const inner = buildProgressBarSC(block, vars, nodes);
    return `${indent}<div class="tg-progress-block" style="height:${h}px">${inner}</div>`;
  },

  'date-time': (block, ctx) => {
    const { vars, nodes, indent } = ctx;
    const v = vars.find(x => x.id === block.variableId);
    const vname = v ? `$${varPath(v, nodes)}` : '$???';
    return `${indent}${buildDateTimeCellSC(block, vname)}`;
  },

  select: (block, ctx) => {
    const { vars, nodes, indent } = ctx;
    if (block.options.length === 0) return '';
    const v = vars.find(x => x.id === block.variableId);
    const vname = v ? `$${varPath(v, nodes)}` : '$???';
    const opts = block.options.map(o => `<<option ${scStr(o.label)} ${scStr(o.value)}>>`).join('');
    const listbox = `<<listbox "${vname}" autoselect>>${opts}<</listbox>>`;
    const label = block.label ? `${block.label} ` : '';
    return `${indent}<span class="tg-select">${label}${listbox}</span>`;
  },

  slider: (block, ctx) => {
    const { vars, nodes, indent } = ctx;
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
  },

  'display-object': (block, ctx) => {
    const { vars, nodes, indent, project } = ctx;
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
  },

  section: (block, ctx) => {
    const { chars, vars, nodes, indent, idToName, project } = ctx;
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
  },

  'quest-set': (block, ctx) => {
    const { indent, project } = ctx;
    const quest = project?.quests?.find(q => q.id === block.questId);
    if (!quest) return '';
    const lines: string[] = [];
    if (block.parentState) lines.push(`${indent}<<set $quests.${quest.varName}.state to "${block.parentState}">>`);
    for (const ss of block.stepStates ?? []) {
      const step = quest.steps.find(st => st.id === ss.stepId);
      if (step) lines.push(`${indent}<<set $quests.${quest.varName}.steps.${step.varName}.state to "${ss.state}">>`);
    }
    if (quest.composite && quest.steps.length > 0) {
      lines.push(`${indent}<<run window._tgQuestNormalize && window._tgQuestNormalize(${JSON.stringify(quest.varName)})>>`);
    }
    return lines.join('\n');
  },

  'quest-show': (block, ctx) => {
    const { indent, project } = ctx;
    const allQuests = project?.quests ?? [];
    const catFilter = block.filterCategoryIds ?? [];
    const quests = catFilter.length
      ? allQuests.filter(q => q.categoryId && catFilter.includes(q.categoryId))
      : allQuests;
    if (quests.length === 0) return '';
    const states: QuestState[] = (block.filterStates && block.filterStates.length) ? block.filterStates : ['active', 'done'];
    const showDesc = block.showDescription !== false;
    const showSteps = block.showSteps !== false;
    const cats = project?.questCategories ?? [];
    const mark = (path: string) =>
      `<<if ${path} is "done">>✓<<elseif ${path} is "failed">>✗<<elseif ${path} is "active">>•<<else>>·<</if>>`;
    const cards = quests.map(q => {
      const cond = states.map(s => `$quests.${q.varName}.state is "${s}"`).join(' or ');
      const color = cats.find(c => c.id === q.categoryId)?.color;
      const titleStyle = color ? ` style="color:${color}"` : '';
      const parts: string[] = [];
      parts.push(`<div class="tg-quest-title"${titleStyle}><span class="tg-quest-mark">${mark(`$quests.${q.varName}.state`)}</span> <<= $quests.${q.varName}.name>></div>`);
      if (showDesc) parts.push(`<<if $quests.${q.varName}.description>><div class="tg-quest-desc"><<= $quests.${q.varName}.description>></div><</if>>`);
      if (showSteps && q.composite && q.steps.length > 0) {
        const stepLines = q.steps.map(st =>
          `<<if $quests.${q.varName}.steps.${st.varName}.state isnot "hidden">><div class="tg-quest-step"><span class="tg-quest-mark">${mark(`$quests.${q.varName}.steps.${st.varName}.state`)}</span> <<= $quests.${q.varName}.steps.${st.varName}.name>></div><</if>>`,
        ).join('');
        parts.push(`<div class="tg-quest-steps">${stepLines}</div>`);
      }
      return `<<if ${cond}>><div class="tg-quest">${parts.join('')}</div><</if>>`;
    });
    const cardsSrc = cards.join('');
    if (block.live) return `${indent}<div class="tg-quests tg-live" data-wiki="${htmlAttr(cardsSrc)}">${cardsSrc}</div>`;
    return `${indent}<div class="tg-quests">${cardsSrc}</div>`;
  },

  table: (block, ctx) => {
    const { chars, vars, nodes, indent, idToName, project } = ctx;
    return tableBlockToSC(block, chars, vars, nodes, indent, idToName, project);
  },

  paperdoll: (block, ctx) => {
    const { chars, vars, nodes, indent, project } = ctx;
    const char = chars.find(ch => ch.id === block.charId);
    if (!char?.paperdoll || !char.varName) return '';
    const html = buildPaperdollCellSC(char.varName, char.paperdoll, block.showLabels, vars, nodes, project?.items);
    return `${indent}${html}`;
  },

  inventory: (block, ctx) => {
    const { chars, indent } = ctx;
    const char = chars.find(ch => ch.id === block.charId);
    if (!char?.varName) return '';
    const title = block.title ?? '';
    return `${indent}<<tgInventory "${char.varName}"${title ? ` ${scStr(title)}` : ''}>>`;
  },

  button: (block, ctx) => {
    const { vars, nodes, indent, idToName, project } = ctx;
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
      `<<link ${scStr(block.label)}>>\n` +
      actionLines.join('\n') + '\n' +
      `${indent}<</link>></span>`
    );
  },

  link: (block, ctx) => {
    const { vars, nodes, indent, idToName, project, passageCtx } = ctx;
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
      return `${indent}<<link ${scStr(block.label)}>>${inlineActions}${targetActions.join('')}<</link>>`;
    }
    actionLines.push(...targetActions.map(a => `${indent}  ${a}`));
    return (
      spotPrefix +
      `${indent}<span class="${classAttr}"${bindAttr}><<link ${scStr(block.label)}>>\n` +
      actionLines.join('\n') + '\n' +
      `${indent}<</link>></span>`
    );
  },

  'menu-link': (block, ctx) => {
    const { vars, nodes, indent, idToName } = ctx;
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
    return `${indent}<<link ${scStr(block.label)}>>${inlineActions}${nav}<</link>>`;
  },

  function: (block, ctx) => {
    const { vars, nodes, indent, idToName, project } = ctx;
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
      `${indent}<span class="${classAttr}"${bindAttr}><<link ${scStr(block.label)}>>\n` +
      actionLines.join('\n') + '\n' +
      `${indent}<</link>></span>`
    );
  },

  checkbox: (block, ctx) => {
    const { vars, nodes, indent, project } = ctx;
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
        const val = scStr(opt.value ?? '');
        return (
          `var e${i}=document.getElementById('${optId}');` +
          `if(e${i}){` +
          `e${i}.checked=State.variables.${arrPath}.includes(${val});` +
          `e${i}.addEventListener('change',function(){` +
          `if(this.checked){State.variables.${arrPath}.push(${val});}` +
          `else{State.variables.${arrPath}.deleteWith(function(x){return x===${val};});}});}`
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
  },

  radio: (block, ctx) => {
    const { vars, nodes, indent, project } = ctx;
    const rb = block as RadioBlock;
    if (rb.options.length === 0) return '';
    const v = vars.find(x => x.id === rb.variableId);
    const vname = v ? `$${varPath(v, nodes)}` : '$???';
    const lines: string[] = [];
    if (rb.label) lines.push(`${indent}${rb.label}`);
    for (const opt of rb.options) {
      lines.push(`${indent}<<radiobutton "${vname}" ${scStr(opt.value)} autocheck>> ${opt.label}`);
    }
    const rbSettings = project?.settings;
    const rbExtra = rbSettings ? simpleBlockCascadeClasses(rb, rbSettings) : [];
    const rbBindKey = rbSettings ? simpleBlockDataStyleBind(rb, rbSettings) : '';
    const rbBindAttr = rbBindKey ? ` data-style-bind="${rbBindKey}"` : '';
    const rbSpotStyle = buildSimpleBlockSpotStyleBlock(rb);
    const rbSpotPrefix = rbSpotStyle ? `${indent}${rbSpotStyle}\n` : '';
    const rbClasses = ['tg-radio', ...rbExtra].join(' ');
    return `${rbSpotPrefix}${indent}<div class="${rbClasses}"${rbBindAttr}>${lines.join('\n')}</div>`;
  },

  popup: (block, ctx) => {
    const { idToName, indent, project } = ctx;
    const name = (idToName?.get(block.targetSceneId) ?? block.targetSceneId) || '???';
    const title = block.title ?? '';
    const settings = project?.settings;
    const extra = settings ? simpleBlockCascadeClasses(block, settings) : [];
    // Drop the structural `tg-popup` base — it's only the cascade namespace.
    const dlgClasses = extra.join(' ').trim();
    const classArg = dlgClasses ? `, "${dlgClasses}"` : '';
    const spotStyle = buildSimpleBlockSpotStyleBlock(block);
    const spotPrefix = spotStyle ? `${indent}${spotStyle}\n` : '';
    return `${spotPrefix}${indent}<<run Dialog.setup(${scStr(title)}${classArg}); Dialog.wiki(Story.get("${name}").processText()); Dialog.open();>>`;
  },

  audio: (block, ctx) => emitAudioPlayback(block as AudioBlock, ctx.indent),

  'audio-gen': (block, ctx) => {
    const ab = block as AudioGenBlock;
    // Draft (history/) takes are editor-only — never exported.
    // Approved (assets/) files use the same SugarCube playback pipeline as AudioBlock.
    if (!ab.src.startsWith('assets/')) return '';
    return emitAudioPlayback(ab, ctx.indent);
  },

  'video-gen': (block, ctx) => {
    const { indent, project } = ctx;
    // Draft (history/) takes are editor-only — never exported. Approved (assets/)
    // files render exactly like a Video block.
    if (!block.src.startsWith('assets/')) return '';
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
  },

  container: (block, ctx) => {
    const { chars, indent, project } = ctx;
    const cb = block as ContainerBlock;
    if (!cb.containerId) return `${indent}/* Container block: no container selected */`;
    const container = (project?.containers ?? []).find(c => c.id === cb.containerId);
    if (!container) return `${indent}/* Container block: container not found */`;
    const hero = chars.find(c => c.isHero);
    if (!hero) return `${indent}/* Container block: no main hero defined — set one in Characters tab */`;
    const heroVarName = hero.varName || hero.name.toLowerCase().replace(/\s+/g, '_');
    const titleArg = cb.title ? ` ${scStr(cb.title)}` : '';
    return `${indent}<<tgContainer "${container.varName}" "${heroVarName}"${titleArg}>>`;
  },

  'time-manipulation': (block, ctx) => {
    const { vars, nodes, indent } = ctx;
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
  },

  tabs: (block, ctx) => {
    const { chars, vars, nodes, indent, idToName, project } = ctx;
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
      `<span data-idx="${i}"><<link ${scStr(tab.label)}>><<set ${ctrlVar} to ${i}>><<run Engine.show()>><</link>></span>`
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
  },

  plugin: (block, ctx) => {
    const { idToName, indent } = ctx;
    const pb = block as PluginBlock;
    const def = getPluginDef(pb.pluginId);
    if (!def) return `${indent}<!-- plugin ${pb.pluginId} not found -->`;
    const setters = def.params
      .map((p) => `<<set _${p.key} to ${pluginValueLiteral(p, pb.values[p.key], idToName)}>>`)
      .join('');
    return `${indent}${setters}<<include "__plug_${def.id}">>`;
  },
};
