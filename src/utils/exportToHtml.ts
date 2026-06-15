import type { Project, ProjectSettings, PluginBlockDef } from '../types';
import { START_TAG } from '../types';
import { flattenVariables, hasLeafVariables } from './treeUtils';
import type { PassageContext } from './exportToTwee';
import { blockToSC, buildCellSharedCSS, buildTabsBlockCSS, buildSectionCSS, buildCalloutCSS, buildDisplayObjectCSS, buildTabsBlockScript, buildTooltipCSS, buildLightboxScript, buildInputScript, buildLiveScript, buildWatcherScript, buildQuestScript, buildQuestShowCSS, buildPurlSignatureScript, defaultValueLiteral, buildObjectLiteral, buildAudioCacheLines, buildAudioScript, buildInventoryScript, buildInventoryCSS, buildContainerScript, buildContainerCSS, buildDateTimeScript, buildPaperdollScript, buildPaperdollCSS, setPluginRegistry, exportSceneBg, buildSceneBgScript, hasScenesWithBg, buildSidebarSystemConfigOutput, buildTitleSystemConfigCSS, buildPassageLifecycleScript, buildSavesConfigScript, hasAudioVolumeCell } from './exportToTwee';
import { buildPluginPassageBodies } from './exportToTwee';
import { buildAllDialogueCss, buildStyleBindScript, hasStyleBindings, buildButtonsCascadeCss, buildSimpleBlocksCascadeCss, buildBlockTypesCSS, buildPopupClassSyncScript } from './styleCascade';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ─── Project settings → CSS / JS ──────────────────────────────────────────────

function withSection(label: string, css: string): string {
  if (!css) return '';
  return `/* ═══ ${label} ═══ */\n${css}`;
}

function buildGlobalCSS(settings?: ProjectSettings): string {
  if (!settings) return '';
  const rules: string[] = [];

  if (settings.bgColor)
    rules.push(`body, #story { background-color: ${settings.bgColor} !important; }`);

  // Sidebar background moved to the sidebar scene's systemConfig.bgColor (kind 'sidebar'),
  // emitted via `buildSidebarSystemConfigOutput`. Title color/font live on the title
  // scene's systemConfig (kind 'title'), emitted via `buildTitleSystemConfigCSS`.

  return rules.join('\n');
}

function buildSettingsScript(_settings?: ProjectSettings): string {
  // historyControls + saveLoadMenu moved to SidebarSceneConfig.systemConfig — see
  // `buildSidebarSystemConfigOutput` in exportToTwee. This function is kept as
  // a stub for future project-level settings that don't fit per-scene config.
  return '';
}

// ─── Block type CSS hooks ─────────────────────────────────────────────────────
// `buildBlockTypesCSS` now lives in styleCascade.ts so the editor preview can
// reuse it (Phase 4 — preview parity).

// ─── Passage builder ──────────────────────────────────────────────────────────

interface PassageEntry {
  pid: number;
  name: string;
  tags: string;
  content: string;
  x: number;
  y: number;
}

export function buildPassages(project: Project, plugins: PluginBlockDef[] = []): {
  passages: PassageEntry[];
  startPid: number;
  combinedCSS: string;
  scriptContent: string;
} {
  setPluginRegistry(plugins);
  const variables = flattenVariables(project.variableNodes);
  const { scenes, characters } = project;
  const idToName = new Map(scenes.map(s => [s.id, s.name]));
  // Sidebar-as-scene: see exportToTwee for the same logic
  const sidebarScene = scenes.find(s => s.tags.includes('sidebar'));
  const titleScene   = scenes.find(s => s.tags.includes('title'));
  const menuScene          = scenes.find(s => s.tags.includes('menu'));
  const passageHeaderScene = scenes.find(s => s.tags.includes('passage-header'));
  const passageFooterScene = scenes.find(s => s.tags.includes('passage-footer'));
  let pid = 1;
  const passages: PassageEntry[] = [];
  const colW = 180, rowH = 120;
  const variableNodes = project.variableNodes;

  // StoryDisplayTitle passage — the displayed title in the UI bar (#story-title).
  // In Twine 2 the plain story title comes from `<tw-storydata name>` (set below);
  // a "StoryTitle" passage would be treated as an ordinary navigable passage, so we
  // emit StoryDisplayTitle instead, which SugarCube renders (markup/images) into
  // #story-title. Omitted when the title scene is empty → SugarCube falls back to the
  // story name. PassageContext 'title' strips the text `<div>` wrapper.
  const titleDisplayBody = titleScene
    ? titleScene.blocks
        .map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project, 'title'))
        .filter(Boolean)
        .join('\n')
    : '';
  if (titleDisplayBody) {
    passages.push({
      pid: pid++, name: 'StoryDisplayTitle', tags: '',
      content: titleDisplayBody, x: colW, y: 100,
    });
  }

  // StoryInit — variable initialization + $__tgTab
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
  // Audio volume: init master volume variable when any TableBlock has audio-volume cell
  const hasAudioVolume = scenes.some(s => hasAudioVolumeCell(s.blocks));
  if (hasAudioVolume) inits.push('<<set $__tgMasterVol to 1>>');
  // Initial inventory: push starting items for each character
  for (const char of project.characters) {
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
      const isDefaultEquipped = char.paperdoll?.slots?.some(
        ps => ps.defaultItemVarName === slot.itemVarName
      ) ?? false;
      inits.push(`<<run ${charPath}.inventory.push({ item: "${slot.itemVarName}", qty: ${slot.quantity}, equipped: ${isDefaultEquipped} })>>`);
    }
  }
  // Custom init markup — user-supplied SugarCube macros appended at the end.
  const customInit = (project.settings?.customInit ?? '').trim();
  if (customInit) inits.push(customInit);
  if (inits.length > 0) {
    passages.push({
      pid: pid++, name: 'StoryInit', tags: '',
      content: inits.join('\n'), x: colW * 2, y: 100,
    });
  }

  // StoryCaption — emit only when a sidebar-tagged scene exists
  const captionSC = sidebarScene
    ? sidebarScene.blocks
        .map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project))
        .filter(Boolean)
        .join('\n')
    : '';
  if (captionSC) {
    passages.push({
      pid: pid++, name: 'StoryCaption', tags: '',
      content: captionSC, x: colW * 3, y: 100,
    });
  }

  // StoryMenu / PassageHeader / PassageFooter — singleton system scenes mapped to
  // named SugarCube passages. `menu` context strips text/link wrappers because
  // SugarCube parses ::StoryMenu line-by-line into `<li>` items.
  const systemPassagePairs: Array<[typeof sidebarScene, string, PassageContext]> = [
    [menuScene,          'StoryMenu',     'menu'],
    [passageHeaderScene, 'PassageHeader', undefined],
    [passageFooterScene, 'PassageFooter', undefined],
  ];
  systemPassagePairs.forEach(([sc, passageName, ctx], i) => {
    if (!sc) return;
    const body = sc.blocks
      .map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project, ctx))
      .filter(Boolean)
      .join('\n');
    if (!body) return;
    passages.push({
      pid: pid++, name: passageName, tags: '',
      content: body, x: colW * (4 + i), y: 100,
    });
  });

  // Scene passages — track PID for start-tagged scene
  let startPid = pid; // fallback to first scene

  scenes.forEach((scene, idx) => {
    if (sidebarScene && scene.id === sidebarScene.id) return; // sidebar scene → StoryCaption only
    if (titleScene   && scene.id === titleScene.id)   return; // title scene   → StoryTitle only
    if (menuScene          && scene.id === menuScene.id)          return;
    if (passageHeaderScene && scene.id === passageHeaderScene.id) return;
    if (passageFooterScene && scene.id === passageFooterScene.id) return;
    const bgMarkup = scene.background
      ? exportSceneBg(scene.background, variables, variableNodes)
      : '';
    const blocksBody = scene.blocks
      .map(b => blockToSC(b, characters, variables, variableNodes, '', idToName, project))
      .filter(Boolean)
      .join('\n');
    const body = [bgMarkup, blocksBody].filter(Boolean).join('\n');
    const scenePid = pid++;
    if (scene.tags.includes(START_TAG)) startPid = scenePid;
    const exportTags = scene.tags.filter(t => t !== START_TAG);
    passages.push({
      pid: scenePid,
      name: scene.name,
      tags: exportTags.join(' '),
      content: body || '',
      x: colW * (idx % 5 + 1),
      y: 100 + rowH * (Math.floor(idx / 5) + 1),
    });
  });

  // Hidden plugin passages ─ ref'd by scene plugin-blocks via <<include "__plug_id">>.
  // Shared with exportToTwee via buildPluginPassageBodies — this path previously
  // skipped rewriteParamRefs, breaking plugin blocks that reference params.
  for (const { id, body } of buildPluginPassageBodies(scenes, characters, variables, variableNodes, idToName, project)) {
    passages.push({
      pid: pid++,
      name: `__plug_${id}`,
      tags: 'nobr',
      content: body,
      x: colW * 7,
      y: 100 + rowH * passages.length,
    });
  }

  const { css: sidebarCfgCSS, script: sidebarCfgScript } = buildSidebarSystemConfigOutput(sidebarScene, variables, variableNodes);
  const sidebarCfgCSSSection = withSection('Sidebar systemConfig', sidebarCfgCSS);
  const titleCfgCSSSection   = withSection('Title systemConfig',   buildTitleSystemConfigCSS(titleScene));

  const charCSS      = withSection('Dialogue',      buildAllDialogueCss(characters));
  const cellCSS      = withSection('Cell utilities (lightbox / progress)', buildCellSharedCSS(scenes));
  const tabsCSS      = withSection('TabsBlock', buildTabsBlockCSS(scenes));
  const sectionCSS   = withSection('SectionBlock', buildSectionCSS(scenes));
  const calloutCSS   = withSection('Callout',      buildCalloutCSS(scenes));
  const doCSS        = withSection('DisplayObject', buildDisplayObjectCSS(scenes));
  const questCSS     = withSection('Quests', buildQuestShowCSS(scenes));
  const buttonCSS    = withSection('Buttons',       buildButtonsCascadeCss(scenes, project.settings));
  const simpleCSS    = withSection('Block overrides', buildSimpleBlocksCascadeCss(scenes, project.settings));
  const tipCSS       = withSection('Tooltips',      buildTooltipCSS());
  const globalCSS    = withSection('Global',        buildGlobalCSS(project.settings));
  const containerCSS = withSection('Containers',    buildContainerCSS());
  const paperdollCSS = withSection('Paperdoll',     buildPaperdollCSS(project));
  const inventoryCSS = withSection('Inventory',     buildInventoryCSS(project));
  const blockTypesCSS = withSection('Block Types', buildBlockTypesCSS());
  const userCSSRaw    = (project.customCss ?? '').trim();
  const userCSS       = userCSSRaw ? `/* ─── User CSS ─── */\n${userCSSRaw}` : '';
  const combinedCSS   = [globalCSS, charCSS, cellCSS, tabsCSS, sectionCSS, calloutCSS, doCSS, questCSS, buttonCSS, simpleCSS, tipCSS, containerCSS, paperdollCSS, inventoryCSS, blockTypesCSS, sidebarCfgCSSSection, titleCfgCSSSection, userCSS].filter(Boolean).join('\n\n');

  const settingsScript = buildSettingsScript(project.settings);
  const scriptContent = [
    settingsScript,
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
    buildPurlSignatureScript(),
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
    ((project.customScript ?? '').trim())
      ? `/* ─── User script ─── */\n${(project.customScript ?? '').trim()}`
      : '',
  ].filter(Boolean).join('\n\n');

  return { passages, startPid, combinedCSS, scriptContent };
}

// ─── Standalone HTML generator ────────────────────────────────────────────────

export function generateStandaloneHtml(project: Project, scTemplate: string, plugins: PluginBlockDef[] = [], startPassageName?: string): { html: string; css: string } {
  const { passages, startPid, combinedCSS, scriptContent } = buildPassages(project, plugins);

  // Optional override: start the story at a specific passage (used by the in-app
  // Play panel's "from current scene"). Falls back to the normal start passage
  // when the name isn't found (e.g. a system/chrome scene).
  const startTarget = startPassageName ? passages.find(p => p.name === startPassageName) : undefined;
  const effectiveStart = startTarget ? startTarget.pid : startPid;

  // `<tw-storydata name="…">` feeds `Story.title` / `document.title` and seeds the
  // save-storage ID in SugarCube 2 + Twine 2. It must stay STABLE plain text, so it's
  // always the project title — the (possibly rich) title scene drives only the
  // *displayed* title via the StoryDisplayTitle passage built in buildPassages().
  const storyDataName = project.title;

  // "Play from current scene": force the start passage by name — SugarCube's
  // documented mechanism, more reliable than the startnode pid alone. Empty for
  // normal exports (Header callers don't pass startPassageName), so disk output
  // is unchanged.
  const startOverrideScript = startTarget ? `\n;Config.passages.start = ${JSON.stringify(startTarget.name)};` : '';
  const styleBlock  = `<style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css"></style>`;
  const scriptBlock = `<script role="script" id="twine-user-script" type="text/twine-javascript">${scriptContent}${startOverrideScript}</script>`;

  const passageBlocks = passages.map(p =>
    `<tw-passagedata pid="${p.pid}" name="${escAttr(p.name)}" tags="${escAttr(p.tags)}" position="${p.x},${p.y}" size="100,100">${esc(p.content)}</tw-passagedata>`
  ).join('\n');

  const innerContent = `${styleBlock}\n${scriptBlock}\n${passageBlocks}`;

  const authorAttr = project.author ? ` author="${escAttr(project.author)}"` : '';
  const storyDataElement =
    `<tw-storydata name="${escAttr(storyDataName)}" startnode="${effectiveStart}" ` +
    `creator="Purl" creator-version="1.0.0"${authorAttr} ` +
    `format="SugarCube" format-version="2.36.1" ` +
    `ifid="${escAttr(project.ifid)}" zoom="1" options="" hidden>\n` +
    `${innerContent}\n` +
    `</tw-storydata>`;

  let html = scTemplate;

  html = html.replace(/\{\{STORY_DATA}}/g, storyDataElement);
  html = html.replace(/\{\{STORY_NAME}}/g,           escAttr(storyDataName));
  html = html.replace(/\{\{STORY_START}}/g,          String(effectiveStart));
  html = html.replace(/\{\{STORY_IFID}}/g,           project.ifid);
  html = html.replace(/\{\{CREATOR_NAME}}/g,         'Purl');
  html = html.replace(/\{\{CREATOR_VERSION}}/g,      '1.0.0');
  html = html.replace(/\{\{STORY_FORMAT}}/g,         'SugarCube');
  html = html.replace(/\{\{STORY_FORMAT_VERSION}}/g, '2.36.1');
  html = html.replace(/\{\{STORY_ZOOM}}/g,           '1');
  html = html.replace(/\{\{STORY_OPTIONS}}/g,        '');

  html = html.replace(
    /(<tw-storydata\b[^>]*?\bstartnode=")[^"]*"/,
    `$1${effectiveStart}"`,
  );

  const cssLinks = [
    '  <link rel="stylesheet" href="story.css">',
    '  <link rel="stylesheet" href="addon.css">',
  ].join('\n');
  html = html.replace('</head>', `${cssLinks}\n</head>`);

  return { html, css: combinedCSS };
}
