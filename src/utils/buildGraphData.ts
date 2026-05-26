import type { Project, Block } from '../types';
import { SYSTEM_TAGS, START_TAG } from '../types';

// ─── Shared types (used by both main app and graph window) ───────────────────

export interface GraphEdge {
  edgeId:   string;
  sourceId: string;
  targetId: string;
  label:    string;
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

// ChoiceOption.targetSceneId stores the scene UUID.
function collectEdges(
  sourceId: string,
  blocks: Block[],
): GraphEdge[] {
  const result: GraphEdge[] = [];
  for (const block of blocks) {
    if (block.type === 'choice') {
      for (const opt of block.options) {
        if (opt.targetSceneId) {
          result.push({
            edgeId:   `${sourceId}-${opt.id}`,
            sourceId,
            targetId: opt.targetSceneId,
            label:    opt.label,
          });
        }
      }
    }
    if (block.type === 'condition') {
      for (const branch of block.branches) {
        result.push(...collectEdges(sourceId, branch.blocks));
      }
    }
    if (block.type === 'dialogue' && block.innerBlocks) {
      result.push(...collectEdges(sourceId, block.innerBlocks));
    }
    if (block.type === 'tabs') {
      for (const tab of block.tabs) {
        result.push(...collectEdges(sourceId, tab.blocks));
      }
    }
  }
  return result;
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

  // System-tagged scenes are isolated — no navigation arrows to/from them
  const isSystemTagged = (sceneId: string) => {
    const s = scenes.find(sc => sc.id === sceneId);
    return s?.tags.some(t => (SYSTEM_TAGS as readonly string[]).includes(t)) ?? false;
  };

  const edges: GraphEdge[] = project.scenes
    .flatMap(s => collectEdges(s.id, s.blocks))
    .filter(e => sceneSet.has(e.targetId) && !isSystemTagged(e.sourceId) && !isSystemTagged(e.targetId));

  return { scenes, edges, activeSceneId };
}
