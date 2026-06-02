import type { Project, Block } from '../types';
import { START_TAG } from '../types';
import { collectNavRefs, type NavKind } from './navTargets';

// ─── Shared types (used by both main app and graph window) ───────────────────

export interface GraphEdge {
  edgeId:   string;
  sourceId: string;
  targetId: string;
  label:    string;
  /** Which kind of navigation produced this edge — drives per-kind styling. */
  kind:     NavKind;
}

export interface GraphScene {
  id:            string;
  name:          string;
  tags:          string[];
  graphPosition?: { x: number; y: number };
  isStart:       boolean;
}

export interface GraphData {
  scenes:        GraphScene[];
  edges:         GraphEdge[];
  activeSceneId: string | null;
}

// ─── Edge collection ─────────────────────────────────────────────────────────

// Chrome system tags whose scenes are kept OFF the graph (presentation, not
// navigation). Everything in SYSTEM_TAGS except `func` + `popup` — those two are
// real navigation destinations and DO get edges.
const ISOLATED_TAGS = ['sidebar', 'title', 'menu', 'passage-header', 'passage-footer'] as const;

// targetSceneId everywhere stores the scene UUID (see migrateSceneLinks). The
// unified collectNavRefs walks every nav kind + container arm; here we just stamp
// the source id + a stable edge id onto each discovered reference.
function collectEdges(sourceId: string, blocks: Block[]): GraphEdge[] {
  return collectNavRefs(blocks).map(r => ({
    edgeId:   `${sourceId}-${r.viaId}`,
    sourceId,
    targetId: r.targetId,
    label:    r.label,
    kind:     r.kind,
  }));
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildGraphData(project: Project, activeSceneId: string | null): GraphData {
  const sceneSet = new Set(project.scenes.map(s => s.id));

  const scenes: GraphScene[] = project.scenes.map(s => ({
    id:            s.id,
    name:          s.name,
    tags:          s.tags,
    graphPosition: s.graphPosition,
    isStart:       s.tags.includes(START_TAG),
  }));

  // Chrome scenes stay isolated; func + popup keep their edges (see ISOLATED_TAGS).
  const isIsolated = (sceneId: string) => {
    const s = scenes.find(sc => sc.id === sceneId);
    return s?.tags.some(t => (ISOLATED_TAGS as readonly string[]).includes(t)) ?? false;
  };

  const edges: GraphEdge[] = project.scenes
    .flatMap(s => collectEdges(s.id, s.blocks))
    .filter(e => sceneSet.has(e.targetId) && !isIsolated(e.sourceId) && !isIsolated(e.targetId));

  return { scenes, edges, activeSceneId };
}
