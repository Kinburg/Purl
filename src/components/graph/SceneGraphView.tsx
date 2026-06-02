import { useEffect, useRef, useCallback, memo, useState, createContext, useContext } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type EdgeProps,
  type OnNodeDrag,
  type NodeMouseHandler,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getBezierPath
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import type { GraphData, GraphScene, GraphEdge } from '../../utils/buildGraphData';
import { SYSTEM_TAG_COLORS } from '../../types';
import type { SystemTag } from '../../types';

import { EmojiIcon } from '../shared/EmojiIcons';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { CSSProperties } from 'react';
// ─── Layout / geometry constants ──────────────────────────────────────────────

const NODE_W         = 210;
const NODE_H_BASE    = 58;
const NODE_PADDING_V = 10;
const NODE_BORDER    = 1;
const TITLE_LINE_H   = 18;
const OUT_HEADER_H   = 11;   // marginTop(6) + border(1) + paddingTop(4)
const OUT_ROW_H      = 17;

const OUT_ROWS_TOP = NODE_BORDER + NODE_PADDING_V + TITLE_LINE_H + OUT_HEADER_H; // = 40

function outHandleTop(i: number): number {
  return OUT_ROWS_TOP + i * OUT_ROW_H + OUT_ROW_H / 2;
}

function nodeHeight(outCount: number): number {
  if (outCount === 0) return NODE_H_BASE;
  return NODE_H_BASE + OUT_HEADER_H + outCount * OUT_ROW_H;
}

// ─── Yarn colours + loop geometry (knit theme) ────────────────────────────────

const YARN_PALETTE = ['#e0918e', '#e0a96f', '#d8c170', '#9cc888', '#79b6c7', '#a99bd6', '#d893bd', '#cdb892'];
const ACTIVE_YARN  = '#cba6f7';
const START_YARN   = '#a6e3a1';

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function pickYarn(key: string): string {
  return YARN_PALETTE[hashStr(key) % YARN_PALETTE.length];
}

/** A small loop drawn where the yarn meets the target node. Target handles sit on
 *  the Left, so the strand arrives travelling rightward; the loop opens toward it. */
function yarnLoopPath(x: number, y: number): string {
  const cx = x - 7;
  return `M ${cx - 9} ${y} C ${cx - 9} ${y - 6}, ${cx + 5} ${y - 6}, ${cx + 5} ${y}`
       + ` C ${cx + 5} ${y + 6}, ${cx - 6} ${y + 6}, ${cx - 4} ${y - 1}`;
}

/** Points walked clockwise around a rounded rect (inset by `m`, corner radius `r`),
 *  spaced ~`step` px. Used as a marker carrier so blanket stitches sit evenly along
 *  every edge and wrap the corners, regardless of node size. Returns an SVG `d`. */
function roundedRectPerimeter(w: number, h: number, m: number, r: number, step: number): string {
  const x0 = m, y0 = m, x1 = w - m, y1 = h - m;
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const pts: Array<[number, number]> = [];
  const line = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * (i / n), ay + (by - ay) * (i / n)]);
  };
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const n = Math.max(1, Math.round((Math.abs(a1 - a0) * rr) / step));
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  };
  const HP = Math.PI / 2;
  line(x0 + rr, y0, x1 - rr, y0);                // top
  arc(x1 - rr, y0 + rr, -HP, 0);                 // top-right corner
  line(x1, y0 + rr, x1, y1 - rr);                // right
  arc(x1 - rr, y1 - rr, 0, HP);                  // bottom-right
  line(x1 - rr, y1, x0 + rr, y1);                // bottom
  arc(x0 + rr, y1 - rr, HP, Math.PI);            // bottom-left
  line(x0, y1 - rr, x0, y0 + rr);                // left
  arc(x0 + rr, y0 + rr, Math.PI, Math.PI + HP);  // top-left
  return 'M' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z';
}

// ─── Context: active edge ID + active node ID + knit flag ─────────────────────

type ActiveCtx = { edgeId: string | null; nodeId: string | null; knit: boolean };
const ActiveCtx = createContext<ActiveCtx>({ edgeId: null, nodeId: null, knit: false });

// ─── Dagre auto-layout ────────────────────────────────────────────────────────

function runDagre(
  scenes: GraphScene[],
  edges:  GraphEdge[],
  outMap: Map<string, string[]>,
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 110, marginx: 40, marginy: 40 });

  const ids = new Set(scenes.map(s => s.id));
  scenes.forEach(s => {
    const h = nodeHeight((outMap.get(s.id) ?? []).length);
    g.setNode(s.id, { width: NODE_W, height: h });
  });
  edges
    .filter(e => ids.has(e.sourceId) && ids.has(e.targetId))
    .forEach(e => g.setEdge(e.sourceId, e.targetId));

  dagre.layout(g);

  const result = new Map<string, { x: number; y: number }>();
  scenes.forEach(s => {
    const n = g.node(s.id);
    if (n) {
      const h = nodeHeight((outMap.get(s.id) ?? []).length);
      result.set(s.id, { x: n.x - NODE_W / 2, y: n.y - h / 2 });
    }
  });
  return result;
}

// ─── Custom scene node ────────────────────────────────────────────────────────

type SceneNodeData = {
  id:         string;
  label:      string;
  isStart:    boolean;
  isActive:   boolean;
  systemTag?: SystemTag;
  outgoing:   string[];
};

const SYSTEM_ICONS: Record<SystemTag, string> = {
  func:             'ƒ',
  popup:            '⬝',
  sidebar:          '▌',  // left-half block — visually evokes a sidebar column
  title:            'T',  // title bar
  menu:             '☰',  // hamburger / menu
  'passage-header': '⤒',  // arrow up — runs before each passage
  'passage-footer': '⤓',  // arrow down — runs after each passage
};

const SceneNode = memo(({ data, width, height }: { data: SceneNodeData; width?: number; height?: number }) => {
  const { knit } = useContext(ActiveCtx);
  const sysColor = data.systemTag ? SYSTEM_TAG_COLORS[data.systemTag] : null;
  const yarn = data.isActive ? ACTIVE_YARN : (sysColor ?? (data.isStart ? START_YARN : pickYarn(data.label)));
  const yarnDark = `color-mix(in srgb, ${yarn}, #000000 45%)`;

  const border = data.isActive
    ? '2px solid #cba6f7'
    : sysColor
    ? `2px solid ${sysColor}`
    : data.isStart
    ? '2px solid #a6e3a1'
    : '1px solid #585b70';

  const bg = data.isActive
    ? '#3b3552'
    : sysColor
    ? `${sysColor}22`
    : '#313244';

  const labelColor = sysColor ?? '#cdd6f4';

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: knit ? yarn : '#585b70', border: knit ? `1px solid ${yarnDark}` : 'none' }} />

      <div
        className={knit ? 'scene-knit-node' : undefined}
        style={{
          backgroundColor: bg,
          border:       knit ? 'none' : border,
          borderRadius: 8,
          padding:      `${NODE_PADDING_V}px 14px`,
          width:        NODE_W,
          color:        labelColor,
          fontSize:     13,
          fontFamily:   'system-ui, -apple-system, sans-serif',
          fontWeight:   data.isStart || data.isActive || !!data.systemTag ? 600 : 400,
          cursor:       'pointer',
          userSelect:   'none',
          boxSizing:    'border-box',
          ...(knit ? ({ '--node-yarn': yarn } as CSSProperties) : null),
        }}
        title={`${data.label} — double-click to open`}
      >
        {/* Blanket-stitch edging — a yarn rail around the patch with a purl loop (out) +
            short leg (in) at each stitch, evenly placed & oriented along the edge via a
            marker on a perimeter path built from the node's measured size. Behind label. */}
        {knit && height && (
          <svg
            aria-hidden="true"
            width={width ?? NODE_W}
            height={height}
            viewBox={`0 0 ${width ?? NODE_W} ${height}`}
            style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}
          >
            <defs>
              {/* one blanket stitch: purl loop (out) + short leg (in). A darker, thicker
                  base under a lighter top gives the yarn body its rounded depth — matching
                  the cords. orient="auto" rotates it to follow the edge. */}
              <marker id={`stitch-${data.id}`} orient="auto" markerUnits="userSpaceOnUse"
                markerWidth="18" markerHeight="18" refX="0" refY="0" overflow="visible">
                <path d="M -3.2,0 C -3.2,-5 3.2,-5 3.2,0 M 0,0 L 0.9,5.5" fill="none"
                  stroke={yarnDark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M -3.2,0 C -3.2,-5 3.2,-5 3.2,0 M 0,0 L 0.9,5.5" fill="none"
                  stroke={yarn} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            {/* dark under-rail → gives the edge yarn some thickness / shadow */}
            <path d={roundedRectPerimeter(width ?? NODE_W, height, 4, 7, 11)} fill="none"
              stroke={yarnDark} strokeWidth={2.6} opacity={0.5} />
            {/* yarn rail carrying the blanket stitches */}
            <path d={roundedRectPerimeter(width ?? NODE_W, height, 4, 7, 11)} fill="none"
              stroke={yarn} strokeWidth={1.4} opacity={0.95}
              markerStart={`url(#stitch-${data.id})`} markerMid={`url(#stitch-${data.id})`} />
          </svg>
        )}

        {/* Title row — explicit lineHeight keeps handle positions accurate */}
        <div style={{
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
          lineHeight:   `${TITLE_LINE_H}px`,
        }}>
          {data.systemTag && (
            <span style={{ color: sysColor!, marginRight: 6, fontSize: 12 }}>
              {SYSTEM_ICONS[data.systemTag]}
            </span>
          )}
          {!data.systemTag && data.isStart && (
            <span style={{ color: '#a6e3a1', marginRight: 6, display: 'inline-flex' }}><EmojiIcon name="caret-right" size={9} /></span>
          )}
          {data.label}
        </div>

        {/* Outgoing connections list */}
        {data.outgoing.length > 0 && (
          <div style={{ borderTop: knit ? `1.5px dashed color-mix(in srgb, ${yarn}, transparent 30%)` : '1px solid #45475a', marginTop: 6, paddingTop: 4 }}>
            {data.outgoing.map((name, i) => (
              <div
                key={i}
                style={{
                  fontSize:     11,
                  color:        '#6c7086',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                  lineHeight:   `${OUT_ROW_H}px`,
                }}
              >
                → {name}
              </div>
            ))}
          </div>
        )}
      </div>

      {data.outgoing.length > 0
        ? data.outgoing.map((_, i) => (
            <Handle
              key={`out-${i}`}
              type="source"
              position={Position.Right}
              id={`out-${i}`}
              style={{ top: outHandleTop(i), background: knit ? yarn : '#585b70', border: knit ? `1px solid ${yarnDark}` : 'none' }}
            />
          ))
        : <Handle type="source" position={Position.Right} style={{ background: knit ? yarn : '#585b70', border: knit ? `1px solid ${yarnDark}` : 'none' }} />
      }
    </>
  );
});
SceneNode.displayName = 'SceneNode';

const nodeTypes = { scene: SceneNode };

// ─── Custom scene edge ────────────────────────────────────────────────────────

const MAX_LABEL = 30;

const ARROW_NORMAL   = 'tc-arrow-normal';
const ARROW_SELECTED = 'tc-arrow-selected';
const ARROW_DIM      = 'tc-arrow-dim';

function SceneEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  label,
  data,
}: EdgeProps) {
  const { edgeId: activeEdgeId, nodeId: activeNodeId, knit } = useContext(ActiveCtx);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Active: this edge is selected, OR it leaves the selected node
  const isSelected   = Boolean(selected);
  const isFromActive = activeNodeId !== null && source === activeNodeId;
  const isActive     = isSelected || isFromActive;

  // Dim: something is active, but not this edge
  const anyActive = activeEdgeId !== null || activeNodeId !== null;
  const isDimmed  = anyActive && !isActive;

  const opacity   = isDimmed ? 0.2 : 1;
  const showLabel = isSelected;

  // Label — opaque background hides the line underneath it. Always in DOM; fades
  // in only when this specific edge is selected. Shared by both render modes.
  const labelEl = label ? (
    <EdgeLabelRenderer>
      <div
        style={{
          position:      'absolute',
          transform:     `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          background:    '#1e1e2e',
          color:         '#cba6f7',
          fontSize:      11,
          fontFamily:    'system-ui, sans-serif',
          padding:       '2px 7px',
          borderRadius:  4,
          border:        '1px solid #cba6f7',
          pointerEvents: 'none',
          whiteSpace:    'nowrap',
          userSelect:    'none',
          opacity:       showLabel ? 1 : 0,
          transition:    'opacity 0.15s',
        }}
      >
        {String(label)}
      </div>
    </EdgeLabelRenderer>
  ) : null;

  // ── Knit theme: render the connection as a twisted yarn cord ending in a loop ──
  if (knit) {
    const yarn      = (data?.yarnColor as string | undefined) ?? '#9aa0b5';
    const cordColor = isActive ? ACTIVE_YARN : yarn;
    const dark      = `color-mix(in srgb, ${cordColor}, #000000 40%)`;
    const w         = isActive ? 6 : 5;
    const inner     = w - 1.5;

    return (
      <>
        {/* under-shadow gives the cord depth */}
        <path
          d={edgePath}
          fill="none"
          stroke={dark}
          strokeWidth={w}
          strokeLinecap="round"
          style={{ opacity, pointerEvents: 'none', transition: 'opacity 0.15s' }}
        />
        {/* main body — BaseEdge keeps click / selection + interaction width */}
        <BaseEdge
          id={id}
          path={edgePath}
          interactionWidth={26}
          style={{
            stroke:        cordColor,
            strokeWidth:   inner,
            strokeLinecap: 'round',
            opacity,
            transition:    'stroke 0.15s, stroke-width 0.15s, opacity 0.15s',
          }}
        />
        {/* diagonal twist — a repeating 45° sheen reads as plied / twisted yarn */}
        <path
          d={edgePath}
          fill="none"
          stroke="url(#yarn-twist)"
          strokeWidth={inner}
          strokeLinecap="round"
          style={{ opacity, pointerEvents: 'none' }}
        />
        {/* loop where the yarn meets the target node */}
        <path
          d={yarnLoopPath(targetX, targetY)}
          fill="none"
          stroke={cordColor}
          strokeWidth={2}
          strokeLinecap="round"
          style={{ opacity, pointerEvents: 'none' }}
        />
        {labelEl}
      </>
    );
  }

  // ── Default (clean) edge ──
  const stroke      = isActive ? '#cba6f7' : '#585b70';
  const strokeWidth = isActive ? 2.5 : 1.5;
  const markerId    = isActive ? ARROW_SELECTED : (isDimmed ? ARROW_DIM : ARROW_NORMAL);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth,
          opacity,
          transition: 'stroke 0.15s, stroke-width 0.15s, opacity 0.15s',
        }}
        markerEnd={`url(#${markerId})`}
      />
      {labelEl}
    </>
  );
}
SceneEdge.displayName = 'SceneEdge';

const edgeTypes = { scene: SceneEdge };

// ─── Data builders ────────────────────────────────────────────────────────────

function buildOutMap(edges: GraphEdge[], scenes: GraphScene[]): Map<string, string[]> {
  const nameById = new Map(scenes.map(s => [s.id, s.name]));
  const out      = new Map<string, string[]>();
  for (const e of edges) {
    const display = e.label || nameById.get(e.targetId) || e.targetId;
    const list    = out.get(e.sourceId) ?? [];
    list.push(display);
    out.set(e.sourceId, list);
  }
  return out;
}

function buildHandleIndexMap(edges: GraphEdge[]): Map<string, number> {
  const sourceCount = new Map<string, number>();
  const handleMap   = new Map<string, number>();
  for (const e of edges) {
    const idx = sourceCount.get(e.sourceId) ?? 0;
    handleMap.set(e.edgeId, idx);
    sourceCount.set(e.sourceId, idx + 1);
  }
  return handleMap;
}

function toFlowNodes(data: GraphData): Node[] {
  const outMap   = buildOutMap(data.edges, data.scenes);
  const dagrePos = runDagre(data.scenes, data.edges, outMap);
  return data.scenes.map(s => {
    const systemTag = s.tags.find(t => t in SYSTEM_TAG_COLORS) as SystemTag | undefined;
    return {
      id:       s.id,
      type:     'scene',
      position: s.graphPosition ?? dagrePos.get(s.id) ?? { x: 0, y: 0 },
      data: {
        id:       s.id,
        label:    s.name,
        isStart:  s.isStart,
        isActive: s.id === data.activeSceneId,
        systemTag,
        outgoing: outMap.get(s.id) ?? [],
      } satisfies SceneNodeData,
    };
  });
}

function toFlowEdges(data: GraphData): Edge[] {
  const handleMap = buildHandleIndexMap(data.edges);
  const sceneById = new Map(data.scenes.map(s => [s.id, s]));
  const yarnFor   = (sourceId: string): string => {
    const s = sceneById.get(sourceId);
    if (!s) return '#9aa0b5';
    return s.isStart ? START_YARN : pickYarn(s.name);
  };
  return data.edges.map(e => ({
    id:           e.edgeId,
    source:       e.sourceId,
    target:       e.targetId,
    sourceHandle: `out-${handleMap.get(e.edgeId) ?? 0}`,
    label:        e.label.length > MAX_LABEL ? e.label.slice(0, MAX_LABEL) + '…' : e.label,
    type:         'scene',
    data:         { yarnColor: yarnFor(e.sourceId) },
  }));
}

// ─── Graph view ───────────────────────────────────────────────────────────────

interface SceneGraphViewProps {
  graphData:      GraphData;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onNodeNavigate: (nodeId: string) => void;
}

function SceneGraphViewImpl({ graphData, onNodeDragStop, onNodeNavigate }: SceneGraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const isDragging = useRef(false);
  const knit = useEditorPrefsStore(s => s.knitTheme);

  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // Update nodes/edges when graphData changes (skip during drag)
  useEffect(() => {
    if (isDragging.current) return;
    setNodes(toFlowNodes(graphData));
    setEdges(toFlowEdges(graphData));
  }, [graphData, setNodes, setEdges]);

  const handleNodeDragStart: OnNodeDrag = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleNodeDragStop: OnNodeDrag = useCallback((_evt, node) => {
    isDragging.current = false;
    onNodeDragStop(node.id, node.position.x, node.position.y);
  }, [onNodeDragStop]);

  // Double-click navigates to the scene in the editor
  const handleNodeDoubleClick: NodeMouseHandler = useCallback((_evt, node) => {
    onNodeNavigate(node.id);
  }, [onNodeNavigate]);

  // Single click / deselect — track active edge & node for highlight/dim logic
  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
      setActiveEdgeId(selEdges.length > 0 ? selEdges[0].id : null);
      setActiveNodeId(selNodes.length > 0 ? selNodes[0].id : null);
    },
    [],
  );

  const ctxValue: ActiveCtx = { edgeId: activeEdgeId, nodeId: activeNodeId, knit };

  return (
    <ActiveCtx.Provider value={ctxValue}>
      <div className={knit ? 'sg-knit' : undefined} style={{ width: '100%', height: '100%', backgroundColor: knit ? '#1e1c26' : '#1e1e2e' }}>
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>

        <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
          <defs>
            {/* diagonal twist sheen for yarn cords — colour-agnostic (alpha white/black),
                tiled at 45° in flow space so the cord's own colour shows through. */}
            <linearGradient id="yarn-twist" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="7" y2="7" spreadMethod="repeat">
              <stop offset="0"    stopColor="#000000" stopOpacity="0.30" />
              <stop offset="0.20" stopColor="#000000" stopOpacity="0" />
              <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="0.80" stopColor="#000000" stopOpacity="0" />
              <stop offset="1"    stopColor="#000000" stopOpacity="0.30" />
            </linearGradient>
            <marker id={ARROW_NORMAL}   viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#585b70" />
            </marker>
            <marker id={ARROW_SELECTED} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#cba6f7" />
            </marker>
            <marker id={ARROW_DIM}      viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#313244" />
            </marker>
          </defs>
        </svg>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onNodeDoubleClick={handleNodeDoubleClick}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          edgesFocusable
          fitView
          fitViewOptions={{ padding: 0.15 }}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={knit ? BackgroundVariant.Cross : BackgroundVariant.Dots}
            color={knit ? '#3a3552' : '#313244'}
            gap={knit ? 22 : 20}
            size={knit ? 4 : 1.5}
          />
          <Controls style={{ background: '#181825', border: '1px solid #313244', borderRadius: 6 }} />
          <MiniMap
            nodeColor={n => {
              const d = n.data as SceneNodeData;
              if (d?.isActive)   return '#cba6f7';
              if (d?.systemTag)  return SYSTEM_TAG_COLORS[d.systemTag];
              if (d?.isStart)    return '#a6e3a1';
              return '#45475a';
            }}
            style={{ background: '#181825', border: '1px solid #313244', borderRadius: 6 }}
            maskColor="rgba(30,30,46,0.6)"
          />
        </ReactFlow>
        </div>
      </div>
    </ActiveCtx.Provider>
  );
}

/**
 * Memoized so the heavy ReactFlow tree skips re-render when parent re-renders
 * with the SAME graphData ref. The debounce in SceneGraphPanel keeps graphData
 * stable between rebuilds, so typing in a TextBlock no longer re-runs the
 * graph view on every keystroke.
 */
export const SceneGraphView = memo(SceneGraphViewImpl);
