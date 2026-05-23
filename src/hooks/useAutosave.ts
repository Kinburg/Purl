import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useEditorPrefsStore } from '../store/editorPrefsStore';
import { fsApi, joinPath, safeName } from '../lib/fsApi';

export function useAutosave() {
  const autosave         = useEditorPrefsStore(s => s.autosave);
  const autosaveInterval = useEditorPrefsStore(s => s.autosaveInterval);
  // Subscribed via selector so the interval (re)starts the moment the user
  // picks a project folder — instead of firing empty no-op ticks beforehand.
  const projectDir       = useProjectStore(s => s.projectDir);

  // Keep a ref to the latest store state so the interval closure never goes stale
  const stateRef = useRef(useProjectStore.getState());
  useEffect(() => useProjectStore.subscribe(s => { stateRef.current = s; }), []);

  useEffect(() => {
    if (!autosave || !projectDir) return;

    const ms = autosaveInterval * 60 * 1000;
    const id = setInterval(async () => {
      const { project, projectDir: dir } = stateRef.current;
      if (!dir) return;
      try {
        await fsApi.mkdir(joinPath(dir, 'release', 'assets'));
        const fileName = `${safeName(project.title)}.purl`;
        await fsApi.writeFile(joinPath(dir, fileName), JSON.stringify(project, null, 2));
      } catch (e) {
        console.error('[autosave] failed:', e);
      }
    }, ms);

    return () => clearInterval(id);
  }, [autosave, autosaveInterval, projectDir]);
}
