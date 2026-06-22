import { fsApi, joinPath, safeName } from './fsApi';
import { useFolderConflictStore } from '../store/folderConflictStore';
import { useEditorPrefsStore } from '../store/editorPrefsStore';

/**
 * The parent "projects" folder suggested in the picker: the user-configured
 * folder (Preferences → Behavior → Projects), or the built-in default
 * (Documents/Purl/Projects) when unset.
 */
async function defaultProjectsParent(): Promise<string> {
  const configured = useEditorPrefsStore.getState().projectsDir;
  if (configured) return configured;
  try {
    return await fsApi.getProjectsDir();
  } catch {
    return '';
  }
}

/** True if `dir` exists on disk and contains at least one entry. */
async function dirExistsNonEmpty(dir: string): Promise<boolean> {
  if (!(await fsApi.exists(dir))) return false;
  const entries = await fsApi.listDir(dir);
  return entries.length > 0;
}

/**
 * First non-existent `{parent}/{base}-N` path. N starts at 2 because the bare
 * `{parent}/{base}` is already taken when this is called.
 */
async function findFreeSubdir(parent: string, base: string): Promise<string> {
  for (let n = 2; n < 10000; n++) {
    const candidate = joinPath(parent, `${base}-${n}`);
    if (!(await fsApi.exists(candidate))) return candidate;
  }
  // Practically unreachable; keep the project save-able rather than throwing.
  return joinPath(parent, `${base}-${crypto.randomUUID().slice(0, 8)}`);
}

/**
 * Given a chosen PARENT folder and a project title, return the project's own
 * sub-folder: `{parent}/{safeName(title)}`.
 *
 * If that sub-folder already exists AND is non-empty, ask the user what to do
 * (overwrite / create a new suffixed folder / cancel). An empty or missing
 * folder is used as-is without prompting. Returns null only if the user cancels.
 */
async function resolveProjectSubdir(parent: string, title: string): Promise<string | null> {
  const base = safeName(title);
  const target = joinPath(parent, base);
  if (await dirExistsNonEmpty(target)) {
    const choice = await useFolderConflictStore.getState().ask(base);
    if (choice === 'cancel') return null;
    if (choice === 'suffix') return findFreeSubdir(parent, base);
    // 'overwrite' → reuse the existing folder.
  }
  return target;
}

/**
 * Prompt for a parent "projects" folder, then resolve the project's own
 * sub-folder inside it (see `resolveProjectSubdir`). This is the entry point
 * for first-saving / creating a project: the user picks where their projects
 * live, and a folder named after the project is created inside it.
 *
 * Returns the final project directory, or null if the user cancelled either the
 * folder picker or the name-collision prompt.
 */
export async function pickNewProjectDir(title: string): Promise<string | null> {
  const parent = await fsApi.openFolderDialog(await defaultProjectsParent());
  if (!parent) return null;
  return resolveProjectSubdir(parent, title);
}
