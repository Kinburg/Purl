import { lazy, Suspense, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { PanelLayout } from '../../store/editorPrefsStore';
import { useProjectStore } from '../../store/projectStore';
import { Sidebar } from './Sidebar';
import { SceneEditor } from '../scenes/SceneEditor';

// PreviewPanel / SceneGraphPanel / PlayPanel are off by default and pull in heavy
// deps. Render them lazily so the initial load doesn't even resolve their imports
// unless the corresponding column is toggled on.
const PreviewPanel    = lazy(() => import('../preview/PreviewPanel').then(m => ({ default: m.PreviewPanel })));
const SceneGraphPanel = lazy(() => import('../graph/SceneGraphPanel').then(m => ({ default: m.SceneGraphPanel })));
const PlayPanel       = lazy(() => import('../play/PlayPanel').then(m => ({ default: m.PlayPanel })));

function PanelFallback() {
  return <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">Loading…</div>;
}

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

  const previewVisible = panelLayout.previewVisible;
  const graphVisible   = panelLayout.graphVisible;
  const playVisible    = panelLayout.playVisible ?? false;
  const rightVisible   = previewVisible || graphVisible;
  const previewSizePct = panelLayout.previewSizePct;

  // Defensive defaults — layouts persisted before the 3-column split lack weights.
  const editorWeight = panelLayout.editorWeight ?? 50;
  const playWeight   = panelLayout.playWeight   ?? 38;
  const rightWeight  = panelLayout.rightWeight  ?? 34;

  // Visible horizontal columns, left → right: editor (always), play, right (code/graph).
  const cols = useMemo(() => {
    const list: { id: string; weight: number; min: number }[] = [
      { id: 'editor-panel', weight: editorWeight, min: 480 },
    ];
    if (playVisible)  list.push({ id: 'play-panel',  weight: playWeight,  min: 360 });
    if (rightVisible) list.push({ id: 'right-panel', weight: rightWeight, min: 250 });
    return list;
  }, [editorWeight, playWeight, rightWeight, playVisible, rightVisible]);

  // Normalize the visible columns' weights to 100 for the panel library.
  const mainLayout: Layout = useMemo(() => {
    const total = cols.reduce((s, c) => s + c.weight, 0) || 1;
    return Object.fromEntries(cols.map(c => [c.id, (c.weight / total) * 100]));
  }, [cols]);

  const rightLayout: Layout = useMemo(
    () => ({ 'preview-panel': previewSizePct, 'graph-panel': 100 - previewSizePct }),
    [previewSizePct],
  );

  const onMainLayoutChanged = useCallback((layout: Layout) => {
    const patch: Partial<PanelLayout> = {};
    const e = layout['editor-panel'];
    const p = layout['play-panel'];
    const r = layout['right-panel'];
    if (e != null && Math.abs(e - editorWeight) > 0.5) patch.editorWeight = Math.round(e);
    if (p != null && Math.abs(p - playWeight)   > 0.5) patch.playWeight   = Math.round(p);
    if (r != null && Math.abs(r - rightWeight)  > 0.5) patch.rightWeight  = Math.round(r);
    if (Object.keys(patch).length) setPanelLayout(patch);
  }, [editorWeight, playWeight, rightWeight, setPanelLayout]);

  // Editor only → no split group.
  if (!playVisible && !rightVisible) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <SidebarResizeHandle />
        <SceneEditor />
      </div>
    );
  }

  // Right column content (code preview over graph, or a single one).
  const rightColumn = (
    <Suspense fallback={<PanelFallback />}>
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
    </Suspense>
  );

  // Flat children (Panel / Separator / Panel …) — the panel library reads Panel +
  // Separator children directly, so build the array rather than using fragments.
  const children: ReactNode[] = [
    <Panel key="editor-panel" id="editor-panel" minSize={480} className="flex flex-col min-h-0">
      <SceneEditor />
    </Panel>,
  ];
  if (playVisible) {
    children.push(<ResizeHandle key="h-play" orientation="vertical" />);
    children.push(
      <Panel key="play-panel" id="play-panel" minSize={360} className="flex flex-col min-h-0">
        <Suspense fallback={<PanelFallback />}>
          <PlayPanel />
        </Suspense>
      </Panel>,
    );
  }
  if (rightVisible) {
    children.push(<ResizeHandle key="h-right" orientation="vertical" />);
    children.push(
      <Panel key="right-panel" id="right-panel" minSize={250} className="flex flex-col min-h-0">
        {rightColumn}
      </Panel>,
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar />
      <SidebarResizeHandle />
      <Group
        // Remount only when the SET of columns changes (toggling play / the right
        // column), so a fresh normalized defaultLayout applies. Resizing within a
        // fixed set keeps the same key and doesn't remount.
        key={cols.map(c => c.id).join('|')}
        orientation="horizontal"
        id="main-group"
        className="flex-1 min-w-0"
        defaultLayout={mainLayout}
        onLayoutChanged={onMainLayoutChanged}
      >
        {children}
      </Group>
    </div>
  );
}
