import { useCallback, useMemo, useRef } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useProjectStore } from '../../store/projectStore';
import { Sidebar } from './Sidebar';
import { SceneEditor } from '../scenes/SceneEditor';
import { PreviewPanel } from '../preview/PreviewPanel';
import { SceneGraphPanel } from '../graph/SceneGraphPanel';

function ResizeHandle({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const isVertical = orientation === 'vertical';
  return (
    <Separator
      className={`group relative flex items-center justify-center
        ${isVertical ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'}
        bg-slate-800 hover:bg-indigo-600/40 active:bg-indigo-600/60 transition-colors`}
    />
  );
}

function SidebarResizeHandle() {
  const sidebarWidth    = useProjectStore(s => s.sidebarWidth);
  const setSidebarWidth = useProjectStore(s => s.setSidebarWidth);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setSidebarWidth(startW + (ev.clientX - startX));
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth, setSidebarWidth]);

  return (
    <div
      className="w-1.5 shrink-0 cursor-col-resize hover:bg-indigo-500/30 active:bg-indigo-500/50 transition-colors"
      onMouseDown={onMouseDown}
    />
  );
}

export function WorkspaceLayout() {
  const panelLayout    = useEditorPrefsStore(s => s.panelLayout);
  const setPanelLayout = useEditorPrefsStore(s => s.setPanelLayout);
  const { previewVisible, graphVisible, mainSizePct, previewSizePct } = panelLayout;
  const rightVisible = previewVisible || graphVisible;

  // Memoize layout objects so they only change when the values actually change
  const mainLayout: Layout = useMemo(
    () => ({ 'main-panel': mainSizePct, 'right-panel': 100 - mainSizePct }),
    [mainSizePct],
  );
  const rightLayout: Layout = useMemo(
    () => ({ 'preview-panel': previewSizePct, 'graph-panel': 100 - previewSizePct }),
    [previewSizePct],
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar />
      <SidebarResizeHandle />

      {rightVisible ? (
        <Group
          orientation="horizontal"
          id="main-group"
          className="flex-1 min-w-0"
          defaultLayout={mainLayout}
          onLayoutChanged={(layout) => {
            const main = layout['main-panel'];
            if (main != null && Math.abs(main - mainSizePct) > 0.5) {
              setPanelLayout({ mainSizePct: Math.round(main) });
            }
          }}
        >
          <Panel id="main-panel" minSize={550} className="flex flex-col min-h-0">
            <SceneEditor />
          </Panel>

          <ResizeHandle orientation="vertical" />

          <Panel id="right-panel" minSize={250} className="flex flex-col min-h-0">
            {previewVisible && graphVisible ? (
              <Group
                orientation="vertical"
                id="right-group"
                defaultLayout={rightLayout}
                onLayoutChanged={(layout) => {
                  const preview = layout['preview-panel'];
                  if (preview != null && Math.abs(preview - previewSizePct) > 0.5) {
                    setPanelLayout({ previewSizePct: Math.round(preview) });
                  }
                }}
              >
                <Panel id="preview-panel" minSize={150} className="flex flex-col min-h-0">
                  <PreviewPanel />
                </Panel>
                <ResizeHandle orientation="horizontal" />
                <Panel id="graph-panel" minSize={150} className="flex flex-col min-h-0">
                  <SceneGraphPanel />
                </Panel>
              </Group>
            ) : previewVisible ? (
              <PreviewPanel />
            ) : (
              <SceneGraphPanel />
            )}
          </Panel>
        </Group>
      ) : (
        <SceneEditor />
      )}
    </div>
  );
}
