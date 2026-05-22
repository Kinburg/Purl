import { importFromTweeSource, ImportError, type ImportResult } from './importFromTwee';

/**
 * Import a compiled Twine HTML story.
 *
 * Strategy: extract `<tw-storydata>` + its `<tw-passagedata>` / `<style>` /
 * `<script>` children, reconstruct an equivalent .twee source, then delegate
 * to `importFromTweeSource` so the parsing pipeline stays single-sourced.
 */
export function importFromHtmlSource(html: string): ImportResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const storyData = doc.querySelector('tw-storydata');
  if (!storyData) {
    throw new ImportError('No <tw-storydata> element found — this does not look like a Twine HTML file.');
  }

  const format = storyData.getAttribute('format') ?? 'unknown';
  if (format !== 'SugarCube' && format !== 'unknown') {
    throw new ImportError(
      `Format "${format}" is not supported. Only SugarCube projects can be imported right now.`,
    );
  }

  const name      = storyData.getAttribute('name')      ?? 'Imported Story';
  const ifid      = storyData.getAttribute('ifid')      ?? '';
  const startPid  = storyData.getAttribute('startnode') ?? '';

  const styleEls   = Array.from(storyData.querySelectorAll('style[type="text/twine-css"]'));
  const scriptEls  = Array.from(storyData.querySelectorAll('script[type="text/twine-javascript"]'));
  const passageEls = Array.from(storyData.querySelectorAll('tw-passagedata'));

  // Resolve startnode (pid) → passage name
  let startName = '';
  for (const p of passageEls) {
    if (p.getAttribute('pid') === startPid) {
      startName = p.getAttribute('name') ?? '';
      break;
    }
  }

  const parts: string[] = [];

  parts.push(`:: StoryTitle\n${name}\n`);
  parts.push(`:: StoryData\n${JSON.stringify({ ifid, format, start: startName }, null, 2)}\n`);

  styleEls.forEach((el, i) => {
    const css = el.textContent ?? '';
    if (!css.trim()) return;
    const passageName = i === 0 ? 'UserStylesheet' : `UserStylesheet${i + 1}`;
    parts.push(`:: ${passageName} [stylesheet]\n${css}\n`);
  });

  scriptEls.forEach((el, i) => {
    const js = el.textContent ?? '';
    if (!js.trim()) return;
    const passageName = i === 0 ? 'UserScript' : `UserScript${i + 1}`;
    parts.push(`:: ${passageName} [script]\n${js}\n`);
  });

  for (const p of passageEls) {
    const pName = p.getAttribute('name') ?? '';
    const tags  = (p.getAttribute('tags') ?? '').trim();
    const pos   = p.getAttribute('position');
    const size  = p.getAttribute('size');
    // textContent decodes HTML entities (&lt; → <, &amp; → &, etc.) — exactly what we want.
    const body  = p.textContent ?? '';

    const tagBlock = tags ? ` [${tags}]` : '';
    const metaObj: Record<string, string> = {};
    if (pos)  metaObj.position = pos;
    if (size) metaObj.size = size;
    const metaBlock = Object.keys(metaObj).length ? ` ${JSON.stringify(metaObj)}` : '';

    parts.push(`:: ${pName}${tagBlock}${metaBlock}\n${body}\n`);
  }

  return importFromTweeSource(parts.join('\n'));
}
