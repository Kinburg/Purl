import { useCallback, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { buildGraphData } from '../../utils/buildGraphData';
import { SceneGraphView } from './SceneGraphView';
import { useDebouncedValue } from '../../utils/useDebouncedValue';
import type { GraphData } from '../../utils/buildGraphData';

/**
 * Wrapper that feeds SceneGraphView with data from the store directly
 * (no IPC). Handles node drag → store and node double-click → setActiveScene.
 */
export function SceneGraphPanel() {
  const project       = useProjectStore(s => s.project);
  const activeSceneId = useProjectStore(s => s.activeSceneId);
  const updateSceneGraphPosition = useProjectStore(s => s.updateSceneGraphPosition);
  const setActiveScene = useProjectStore(s => s.setActiveScene);

  // Debounce project so graph rebuilds 200ms after last keystroke instead of
  // running buildGraphData (which walks every scene + every block for nav
  // targets) on every character typed in a TextBlock.
  const debouncedProject       = useDebouncedValue(project, 200);
  const debouncedActiveSceneId = useDebouncedValue(activeSceneId, 200);

  const graphData: GraphData = useMemo(
    () => buildGraphData(debouncedProject, debouncedActiveSceneId),
    [debouncedProject, debouncedActiveSceneId],
  );

  const onNodeDragStop = useCallback(
    (nodeId: string, x: number, y: number) => {
      updateSceneGraphPosition(nodeId, x, y);
    },
    [updateSceneGraphPosition],
  );

  const onNodeDoubleClick = useCallback(
    (nodeId: string) => {
      setActiveScene(nodeId);
    },
    [setActiveScene],
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <SceneGraphView
        graphData={graphData}
        onNodeDragStop={onNodeDragStop}
        onNodeNavigate={onNodeDoubleClick}
      />
    </div>
  );
}
