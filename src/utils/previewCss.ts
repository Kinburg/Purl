/**
 * Injects story-style CSS into the editor's `document.head` so block previews
 * in the editor reflect the real exported story output. Three layers contribute:
 *
 *   1. Block-types base CSS    — structural hooks (`.tg-text`, `.tg-divider`, …)
 *   2. Cascade Common CSS      — dialogue + button-family + simple-blocks rules
 *                                (from per-character / project-defaults state)
 *   3. Spot CSS                — per-block-id overrides, collected across all
 *                                scenes (mirrors the inline `<style>` blocks
 *                                emitted on export).
 *
 * Single managed style element: `#purl-preview-css`. Re-injected by App.tsx on
 * every relevant project mutation (characters / scenes / settings).
 */

import type { Project } from '../types';
import {
  buildAllDialogueCss,
  buildButtonsCascadeCss,
  buildSimpleBlocksCascadeCss,
  buildAllSpotStyleRules,
  buildBlockTypesCSS,
} from './styleCascade';

function upsertStyle(id: string, css: string): void {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function removeStyle(id: string): void {
  document.getElementById(id)?.remove();
}

/**
 * Build the combined CSS string used both for direct preview injection and as
 * the single source of truth tested by snapshot/manual checks.
 */
function buildPreviewCSS(project: Project): string {
  const parts = [
    buildBlockTypesCSS(),
    buildAllDialogueCss(project.characters),
    buildButtonsCascadeCss(project.scenes, project.settings),
    buildSimpleBlocksCascadeCss(project.scenes, project.settings),
    buildAllSpotStyleRules(project.scenes),
  ];
  return parts.filter(Boolean).join('\n\n');
}

/** Inject (or refresh) the editor preview CSS. */
export function injectPreviewCSS(project: Project): void {
  const css = buildPreviewCSS(project);
  if (css) upsertStyle('purl-preview-css', css);
  else     removeStyle('purl-preview-css');
}
