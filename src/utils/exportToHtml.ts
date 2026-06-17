import type { Project, PluginBlockDef } from '../types';
import { compileStory } from './export/compileStory';

// ─── HTML escaping helpers ──────────────────────────────────────────────────────

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
  // Thin position-assigning adapter over compileStory(). The shared orchestration
  // produces the passages/css/script; here we add the Twine-layout pid + x/y grid that
  // only the HTML/Twine format needs — system passages on row 0, scene passages gridded
  // by their original scene index, plugin passages in column 7 (matching the legacy layout).
  const { passages: compiled, startName, css, script } = compileStory(project, plugins);
  const colW = 180, rowH = 120;
  const out: PassageEntry[] = [];
  let pid = 1;
  let startPid = 1;
  for (const p of compiled) {
    const myPid = pid++;
    let x: number;
    let y: number;
    if (p.kind === 'scene') {
      const idx = p.sceneIndex ?? 0;
      x = colW * (idx % 5 + 1);
      y = 100 + rowH * (Math.floor(idx / 5) + 1);
    } else if (p.kind === 'plugin') {
      x = colW * 7;
      y = 100 + rowH * out.length;
    } else {
      x = colW * systemColIndex(p.name);
      y = 100;
    }
    if (p.name === startName) startPid = myPid;
    out.push({ pid: myPid, name: p.name, tags: p.tags.join(' '), content: p.content || '', x, y });
  }
  return { passages: out, startPid, combinedCSS: css, scriptContent: script };
}

/** Twine-editor column for each system passage (matches the legacy buildPassages layout). */
function systemColIndex(name: string): number {
  switch (name) {
    case 'StoryDisplayTitle': return 1;
    case 'StoryInit':         return 2;
    case 'StoryCaption':      return 3;
    case 'StoryMenu':         return 4;
    case 'PassageHeader':     return 5;
    case 'PassageFooter':     return 6;
    default:                  return 1;
  }
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
