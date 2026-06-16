import type { Project, PluginBlockDef } from '../types';
import { fsApi, joinPath, safeName } from '../lib/fsApi';
import { generateStandaloneHtml } from '../utils/exportToHtml';

export const PURL_EXT = 'purl';

/** Persist the project JSON to {dir}/{safeName(title)}.purl, ensuring release/assets exists. */
export async function doSaveToDir(project: Project, dir: string): Promise<void> {
  await fsApi.mkdir(joinPath(dir, 'release', 'assets'));
  const content  = JSON.stringify(project, null, 2);
  const fileName = `${safeName(project.title)}.${PURL_EXT}`;
  await fsApi.writeFile(joinPath(dir, fileName), content);
}

/**
 * Names of scenes that still contain unapproved AI media — image-gen/video-gen
 * blocks whose src points at the staging `history/` folder. Used to warn before
 * an HTML export so users don't ship un-committed generations.
 */
export function unapprovedScenes(project: Project): string[] {
  return project.scenes
    .filter(scene => scene.blocks.some(b => (b.type === 'image-gen' || b.type === 'video-gen') && b.src.startsWith('history/')))
    .map(scene => scene.name);
}

/** Directory portion of a (possibly Windows) file path; '.' when there is no separator. */
export function dirOfPath(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSep >= 0 ? filePath.substring(0, lastSep) : '.';
}

/**
 * Single source of truth for writing a standalone-HTML export: generates the
 * {html, css} bundle and writes the HTML to `htmlPath` and `story.css` alongside
 * it in `cssDir`. All three Header export-HTML flows (in-folder / save-as /
 * translated) funnel through here so they can't drift apart.
 */
export async function writeHtmlBundle(
  project: Project,
  template: string,
  plugins: PluginBlockDef[],
  htmlPath: string,
  cssDir: string,
): Promise<void> {
  const { html, css } = generateStandaloneHtml(project, template, plugins);
  await fsApi.writeFile(htmlPath, html);
  await fsApi.writeFile(joinPath(cssDir, 'story.css'), css);
}
