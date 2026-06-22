import type { Project, ProjectSettings, PluginBlockDef } from '../../types';
import { START_TAG } from '../../types';
import { flattenVariables, hasLeafVariables } from '../treeUtils';
import {
  blockToSC, defaultValueLiteral, buildObjectLiteral, exportSceneBg,
  buildAudioCacheLines, hasAudioVolumeCell, collectSceneTargets,
  buildCellSharedCSS, buildTabsBlockCSS, buildSectionCSS, buildCalloutCSS, buildDisplayObjectCSS,
  buildQuestShowCSS, buildTooltipCSS, buildContainerCSS, buildPaperdollCSS, buildInventoryCSS,
  buildSidebarSystemConfigOutput, buildTitleSystemConfigCSS,
  buildDateTimeScript, buildLightboxScript, buildTabsBlockScript, buildInputScript, buildLiveScript,
  buildWatcherScript, buildQuestScript, buildAudioScript, buildInventoryScript, buildContainerScript,
  buildPaperdollScript, hasScenesWithBg, buildSceneBgScript,
  buildPassageLifecycleScript, buildSavesConfigScript, buildPurlSignatureScript,
  buildPluginPassageBodies, setPluginRegistry,
  type PassageContext,
} from '../exportToTwee';
import {
  buildAllDialogueCss, buildButtonsCascadeCss, buildSimpleBlocksCascadeCss,
  buildBlockTypesCSS, buildStyleBindScript, hasStyleBindings, buildPopupClassSyncScript,
} from '../styleCascade';

// ─── Format-neutral compiled story ──────────────────────────────────────────────
//
// Single source of truth for the SugarCube story orchestration. `exportToTwee()` and
// `generateStandaloneHtml()` are thin serializers over this — so the two output formats
// can no longer drift (they previously did: the .twee path was missing the global
// background CSS, the block-type base CSS, and the video half of the audio-volume
// restore script). Leaf builders (blockToSC, buildAudioScript, …) stay in exportToTwee
// / styleCascade; only the ORCHESTRATION lives here.

interface CompiledPassage {
  name: string;
  /** Format-neutral tags (no `[ ]` / no `tags=""` syntax); START_TAG already removed. */
  tags: string[];
  /** Passage body verbatim — what BOTH serializers emit (no twee graphHint, no '(empty scene)'). */
  content: string;
  kind: 'system' | 'scene' | 'plugin';
  /** Scene passages only — Twine nav-graph targets; the twee serializer renders the <<if false>> hint. */
  navTargets?: string[];
  /** Scene passages only — true for the START_TAG scene. */
  isStart?: boolean;
  /** Scene passages only — index in project.scenes (drives the HTML serializer's x/y grid). */
  sceneIndex?: number;
}

export interface CompiledStory {
  passages: CompiledPassage[];
  /** Canonical start, by passage NAME. */
  startName: string;
  /** Fully-assembled stylesheet (verbatim into ::StoryStylesheet or story.css). */
  css: string;
  /** Fully-assembled script (verbatim into ::StoryScript or the user-script block). */
  script: string;
}

// ─── Settings → CSS / JS (moved here from exportToHtml so both formats share them) ──

function withSection(label: string, css: string): string {
  if (!css) return '';
  return `/* ═══ ${label} ═══ */\n${css}`;
}

function buildGlobalCSS(settings?: ProjectSettings): string {
  if (!settings) return '';
  const rules: string[] = [];
  if (settings.bgColor)
    rules.push(`body, #story { background-color: ${settings.bgColor} !important; }`);
  return rules.join('\n');
}

function buildSettingsScript(_settings?: ProjectSettings): string {
  // historyControls + saveLoadMenu moved to SidebarSceneConfig.systemConfig. Kept as a
  // stub (returns '') for future project-level settings that don't fit per-scene config.
  return '';
}

export function compileStory(project: Project, plugins: PluginBlockDef[] = []): CompiledStory {
  setPluginRegistry(plugins);
  const variableNodes = project.variableNodes;
  const variables = flattenVariables(variableNodes);
  const { scenes, characters } = project;
  const idToName = new Map(scenes.map(s => [s.id, s.name]));

  const sidebarScene       = scenes.find(s => s.tags.includes('sidebar'));
  const titleScene         = scenes.find(s => s.tags.includes('title'));
  const menuScene          = scenes.find(s => s.tags.includes('menu'));
  const passageHeaderScene = scenes.find(s => s.tags.includes('passage-header'));
  const passageFooterScene = scenes.find(s => s.tags.includes('passage-footer'));

  const startName = scenes.find(s => s.tags.includes(START_TAG))?.name ?? scenes[0]?.name ?? 'Start';

  const passages: CompiledPassage[] = [];

  // StoryDisplayTitle — the displayed UI-bar title (markup/macros); 'title' context strips
  // the text <div> wrapper. Omitted when the title scene is empty.
  const titleDisplayBody = titleScene
    ? titleScene.blocks.map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project, 'title')).filter(Boolean).join('\n')
    : '';
  if (titleDisplayBody) passages.push({ name: 'StoryDisplayTitle', tags: [], content: titleDisplayBody, kind: 'system' });

  // StoryInit — variable initialization + audio cache + paperdoll/inventory seeding.
  const inits: string[] = [];
  for (const n of variableNodes) {
    if (n.kind === 'variable') {
      inits.push(`<<set $${n.name} to ${defaultValueLiteral(n)}>>`);
    } else if (n.kind === 'group' && hasLeafVariables(n)) {
      inits.push(`<<set $${n.name} = ${buildObjectLiteral(n, variableNodes)}>>`);
    }
  }
  const audioCacheLines = buildAudioCacheLines(scenes);
  inits.push(...audioCacheLines);
  if (audioCacheLines.length > 0) inits.push('<<waitforaudio>>');
  const hasAudioVolume = scenes.some(s => hasAudioVolumeCell(s.blocks));
  if (hasAudioVolume) inits.push('<<set $__tgMasterVol to 1>>');
  for (const char of characters) {
    if (!char.varName) continue;
    const charPath = `$${char.varName}`;
    if (char.paperdoll?.slots?.length) {
      for (const pdSlot of char.paperdoll.slots) {
        if (pdSlot.defaultItemVarName) {
          inits.push(`<<set ${charPath}.equipment.${pdSlot.id} to "${pdSlot.defaultItemVarName}">>`);
        }
      }
    }
    if (!char.initialInventory?.length) continue;
    for (const slot of char.initialInventory) {
      const isDefaultEquipped = char.paperdoll?.slots?.some(ps => ps.defaultItemVarName === slot.itemVarName) ?? false;
      inits.push(`<<run ${charPath}.inventory.push({ item: "${slot.itemVarName}", qty: ${slot.quantity}, equipped: ${isDefaultEquipped} })>>`);
    }
  }
  const customInit = (project.settings?.customInit ?? '').trim();
  if (customInit) inits.push(customInit);
  if (inits.length > 0) passages.push({ name: 'StoryInit', tags: [], content: inits.join('\n'), kind: 'system' });

  // StoryCaption — sidebar-tagged scene.
  const captionSC = sidebarScene
    ? sidebarScene.blocks.map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project)).filter(Boolean).join('\n')
    : '';
  if (captionSC) passages.push({ name: 'StoryCaption', tags: [], content: captionSC, kind: 'system' });

  // StoryMenu / PassageHeader / PassageFooter — singleton system scenes.
  const systemPassagePairs: Array<[typeof sidebarScene, string, PassageContext]> = [
    [menuScene,          'StoryMenu',     'menu'],
    [passageHeaderScene, 'PassageHeader', undefined],
    [passageFooterScene, 'PassageFooter', undefined],
  ];
  for (const [sc, passageName, ctx] of systemPassagePairs) {
    if (!sc) continue;
    const body = sc.blocks.map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project, ctx)).filter(Boolean).join('\n');
    if (body) passages.push({ name: passageName, tags: [], content: body, kind: 'system' });
  }

  // Scene passages — content only (no graphHint, no '(empty scene)'); navTargets/isStart
  // carried for the twee serializer / HTML start lookup. sceneIndex is the index in
  // project.scenes (incl. skipped system scenes) so the HTML serializer reproduces x/y.
  scenes.forEach((scene, sceneIndex) => {
    if (sidebarScene       && scene.id === sidebarScene.id)       return;
    if (titleScene         && scene.id === titleScene.id)         return;
    if (menuScene          && scene.id === menuScene.id)          return;
    if (passageHeaderScene && scene.id === passageHeaderScene.id) return;
    if (passageFooterScene && scene.id === passageFooterScene.id) return;
    const bgMarkup = scene.background ? exportSceneBg(scene.background, variables, variableNodes) : '';
    const blocksBody = scene.blocks.map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project)).filter(Boolean).join('\n');
    const content = [bgMarkup, blocksBody].filter(Boolean).join('\n');
    const navTargets = collectSceneTargets(scene.blocks, idToName);
    const entry: CompiledPassage = {
      name: scene.name,
      tags: scene.tags.filter(t => t !== START_TAG),
      content,
      kind: 'scene',
      sceneIndex,
    };
    if (navTargets.length) entry.navTargets = navTargets;
    if (scene.tags.includes(START_TAG)) entry.isStart = true;
    passages.push(entry);
  });

  // Hidden plugin passages — shared param-scoped bodies.
  for (const { id, body } of buildPluginPassageBodies(scenes, characters, variables, variableNodes, idToName, project)) {
    passages.push({ name: `__plug_${id}`, tags: ['nobr'], content: body, kind: 'plugin' });
  }

  // ─── CSS (one stylesheet for both formats; section order is cascade-significant) ──
  const { css: sidebarCfgCSS, script: sidebarCfgScript } = buildSidebarSystemConfigOutput(sidebarScene, variables, variableNodes);
  const userCSS = (project.customCss ?? '').trim();
  const css = [
    withSection('Global',          buildGlobalCSS(project.settings)),
    withSection('Dialogue',        buildAllDialogueCss(characters)),
    withSection('Cell utilities (lightbox / progress)', buildCellSharedCSS(scenes)),
    withSection('TabsBlock',       buildTabsBlockCSS(scenes)),
    withSection('SectionBlock',    buildSectionCSS(scenes)),
    withSection('Callout',         buildCalloutCSS(scenes)),
    withSection('DisplayObject',   buildDisplayObjectCSS(scenes)),
    withSection('Quests',          buildQuestShowCSS(scenes)),
    withSection('Buttons',         buildButtonsCascadeCss(scenes, project.settings)),
    withSection('Block overrides', buildSimpleBlocksCascadeCss(scenes, project.settings)),
    withSection('Tooltips',        buildTooltipCSS()),
    withSection('Containers',      buildContainerCSS()),
    withSection('Paperdoll',       buildPaperdollCSS(project)),
    withSection('Inventory',       buildInventoryCSS(project)),
    withSection('Block Types',     buildBlockTypesCSS()),
    withSection('Sidebar systemConfig', sidebarCfgCSS),
    withSection('Title systemConfig',   buildTitleSystemConfigCSS(titleScene)),
    userCSS ? `/* ─── User CSS ─── */\n${userCSS}` : '',
  ].filter(Boolean).join('\n\n');

  // ─── Script (one block for both formats) ──────────────────────────────────────
  const userScript = (project.customScript ?? '').trim();
  const script = [
    buildSettingsScript(project.settings),
    sidebarCfgScript,
    buildDateTimeScript(),
    buildLightboxScript(scenes),
    buildTabsBlockScript(scenes),
    buildInputScript(scenes),
    buildLiveScript(scenes),
    buildWatcherScript(project.watchers ?? [], variables, variableNodes, idToName),
    buildQuestScript(project.quests ?? []),
    buildAudioScript(scenes, project.settings?.audioUnlockText),
    buildInventoryScript(project),
    buildContainerScript(project),
    buildPaperdollScript(project),
    hasScenesWithBg(scenes) ? buildSceneBgScript() : '',
    hasStyleBindings(project) ? buildStyleBindScript(project) : '',
    buildPopupClassSyncScript(scenes),
    buildPassageLifecycleScript(project.settings),
    buildSavesConfigScript(project.settings),
    hasAudioVolume ? [
      '// Audio volume: restore from saved state on load (audio + video)',
      '$(document).on(":passagedisplay", function() {',
      '  var v = State.variables.__tgMasterVol;',
      '  if (v != null) {',
      '    SimpleAudio.volume(v);',
      '    document.querySelectorAll("video").forEach(function(el) { el.volume = v; });',
      '  }',
      '});',
    ].join('\n') : '',
    buildPurlSignatureScript(),
    userScript ? `/* ─── User script ─── */\n${userScript}` : '',
  ].filter(Boolean).join('\n\n');

  return { passages, startName, css, script };
}
