import { useCallback, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useT } from '../../i18n';
import { buildGraphData } from '../../utils/buildGraphData';
import { SceneGraphView } from './SceneGraphView';
import { useDebouncedValue } from '../../utils/useDebouncedValue';
import type { GraphData } from '../../utils/buildGraphData';
import type { Project } from '../../types';

/**
 * Wrapper that feeds SceneGraphView with data from the store directly (no IPC).
 * Honors `editorPrefs.graphMode`:
 *  - 'live'   — rebuild (debounced) on every edit.
 *  - 'manual' — rebuild only on the Refresh overlay button. The graph re-layout is
 *               the heaviest panel, so this avoids churn on big stories. The
 *               snapshot is seeded once on mount so the graph is never blank, and a
 *               "story changed" badge appears when it's out of date.
 */
export function SceneGraphPanel() {
  const project       = useProjectStore(s => s.project);
  const activeSceneId = useProjectStore(s => s.activeSceneId);
  const updateSceneGraphPosition = useProjectStore(s => s.updateSceneGraphPosition);
  const setActiveScene = useProjectStore(s => s.setActiveScene);
  const mode = useEditorPrefsStore(s => s.graphMode);
  const t = useT();

  // Debounce so a 'live' rebuild runs 200ms after the last keystroke, not per char.
  const debouncedProject       = useDebouncedValue(project, 200);
  const debouncedActiveSceneId = useDebouncedValue(activeSceneId, 200);

  const live = useMemo<GraphData | null>(
    () => (mode === 'live' ? buildGraphData(debouncedProject, debouncedActiveSceneId) : null),
    [mode, debouncedProject, debouncedActiveSceneId],
  );

  // Manual-mode snapshot — seeded once on mount (lazy init) so the graph isn't blank.
  const [snap, setSnap] = useState<{ data: GraphData; project: Project; activeSceneId: string | null }>(
    () => ({ data: buildGraphData(project, activeSceneId), project, activeSceneId }),
  );
  const refresh = useCallback(
    () => setSnap({ data: buildGraphData(project, activeSceneId), project, activeSceneId }),
    [project, activeSceneId],
  );
  const stale = mode === 'manual' && (snap.project !== project || snap.activeSceneId !== activeSceneId);

  const graphData = mode === 'live' ? (live ?? snap.data) : snap.data;

  const onNodeDragStop = useCallback(
    (nodeId: string, x: number, y: number) => updateSceneGraphPosition(nodeId, x, y),
    [updateSceneGraphPosition],
  );
  const onNodeDoubleClick = useCallback((nodeId: string) => setActiveScene(nodeId), [setActiveScene]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <SceneGraphView
        graphData={graphData}
        onNodeDragStop={onNodeDragStop}
        onNodeNavigate={onNodeDoubleClick}
      />
      {mode === 'manual' && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }} className="flex items-center gap-2 select-none">
          {stale && (
            <span className="text-[10px] text-amber-300 bg-slate-900/80 px-1.5 py-0.5 rounded">{t.graphView.stale}</span>
          )}
          <button
            type="button"
            onClick={refresh}
            className={`text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors shadow ${
              stale ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            }`}
          >
            {t.graphView.refresh}
          </button>
        </div>
      )}
    </div>
  );
}
