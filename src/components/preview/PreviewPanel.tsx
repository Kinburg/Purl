import { useMemo, useState, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { usePluginStore } from '../../store/pluginStore';
import { blockToSC, setPluginRegistry } from '../../utils/exportToTwee';
import { flattenVariables } from '../../utils/treeUtils';
import { useDebouncedValue } from '../../utils/useDebouncedValue';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { Project, PluginBlockDef } from '../../types';

// ── Syntax highlighting (ported from preview.html) ──────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightLine(line: string): string {
  // Passage header: :: ...
  if (/^::/.test(line)) {
    const m = line.match(/^(::)(.*?)(\s+\[.*\])?$/);
    if (m) {
      const dbl  = '<span class="hl-passage-dbl">::</span>';
      const name = `<span class="hl-passage-name">${esc(m[2])}</span>`;
      const tags = m[3]
        ? ` <span class="hl-passage-tag">${esc(m[3].trim())}</span>`
        : '';
      return dbl + name + tags;
    }
    return `<span class="hl-passage-name">${esc(line)}</span>`;
  }

  const result: string[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    // SugarCube macro: <<...>>
    if (ch === '<' && line[i + 1] === '<') {
      const end = line.indexOf('>>', i + 2);
      if (end !== -1) {
        result.push(`<span class="hl-macro">${esc(line.slice(i, end + 2))}</span>`);
        i = end + 2;
        continue;
      }
    }

    // HTML tag: <tag> / </tag>
    if (ch === '<' && line[i + 1] !== '<' && line[i + 1] !== '>') {
      const end = line.indexOf('>', i + 1);
      if (end !== -1) {
        result.push(`<span class="hl-htmltag">${esc(line.slice(i, end + 1))}</span>`);
        i = end + 1;
        continue;
      }
    }

    // Double-quoted string
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\') j++;
        j++;
      }
      result.push(`<span class="hl-string">${esc(line.slice(i, j + 1))}</span>`);
      i = j + 1;
      continue;
    }

    // Variable: $identifier
    if (ch === '$' && i + 1 < line.length && /[a-zA-Z_]/.test(line[i + 1])) {
      let j = i + 1;
      while (j < line.length && /[a-zA-Z0-9_.]/.test(line[j])) j++;
      result.push(`<span class="hl-var">${esc(line.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    result.push(esc(ch));
    i++;
  }

  return result.join('');
}

function highlight(code: string): string {
  return code.split('\n').map(highlightLine).join('\n');
}

// ── Component ───────────────────────────────────────────────────────────────

/** Serialize one scene to its `.twee` source. Pure — shared by live + manual modes. */
function compileScene(
  project: Project,
  sceneId: string | null,
  plugins: PluginBlockDef[],
): { code: string; sceneName: string } {
  const scene = project.scenes.find(s => s.id === sceneId);
  if (!scene) return { code: '', sceneName: '' };
  setPluginRegistry(plugins);
  const vars = flattenVariables(project.variableNodes);
  const idToName = new Map(project.scenes.map(s => [s.id, s.name]));
  const tags = scene.tags.length > 0 ? ` [${scene.tags.join(' ')}]` : '';
  const body = scene.blocks
    .map(b => blockToSC(b, project.characters, vars, project.variableNodes, '', idToName, project))
    .filter(Boolean)
    .join('\n');
  return { code: `::${scene.name}${tags}\n${body || '(empty scene)'}`, sceneName: scene.name };
}

export function PreviewPanel() {
  const project       = useProjectStore(s => s.project);
  const activeSceneId = useProjectStore(s => s.activeSceneId);
  const plugins       = usePluginStore(s => s.plugins);
  const compileMode   = useEditorPrefsStore(s => s.compileMode);
  const [copied, setCopied] = useState(false);

  // Live mode: debounce so we don't re-serialize the active scene on every keystroke.
  const debouncedProject       = useDebouncedValue(project, 200);
  const debouncedActiveSceneId = useDebouncedValue(activeSceneId, 200);

  // Live: recompute (debounced). Manual: the memo short-circuits to null so
  // compileScene never runs on edits.
  const live = useMemo(
    () => (compileMode === 'live' ? compileScene(debouncedProject, debouncedActiveSceneId, plugins) : null),
    [compileMode, debouncedProject, debouncedActiveSceneId, plugins],
  );

  // Manual: snapshot captured on Compile; remember its source to flag staleness.
  const [snap, setSnap] = useState<{ code: string; sceneName: string; project: Project; sceneId: string | null } | null>(null);
  const compile = useCallback(() => {
    setSnap({ ...compileScene(project, activeSceneId, plugins), project, sceneId: activeSceneId });
  }, [project, activeSceneId, plugins]);

  const ranManual = compileMode === 'manual' && snap !== null;
  const stale     = compileMode === 'manual' && snap !== null && (snap.project !== project || snap.sceneId !== activeSceneId);
  const showCode  = compileMode === 'live' || ranManual;
  const code      = compileMode === 'live' ? (live?.code ?? '') : (snap?.code ?? '');
  const sceneName = compileMode === 'live' ? (live?.sceneName ?? '') : (snap?.sceneName ?? '');

  const highlighted = useMemo(() => highlight(code), [code]);

  const handleCopy = useCallback(() => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] text-[#cdd6f4]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#181825] border-b border-[#313244] shrink-0 select-none h-9">
        <span className="text-sm opacity-60">&#128196;</span>
        <span className="text-[11px] text-[#6c7086] flex-1 truncate">
          {sceneName || 'Code Preview'}
        </span>
        {compileMode === 'manual' && (
          <button
            onClick={compile}
            title={stale ? 'Story changed — recompile' : undefined}
            className={`px-2.5 py-0.5 rounded text-[11px] transition-colors cursor-pointer border-none ${
              stale ? 'bg-[#f9a825] text-black' : 'bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a]'
            }`}
          >
            {ranManual ? 'Recompile' : 'Compile'}
          </button>
        )}
        <button
          onClick={handleCopy}
          className={`px-2.5 py-0.5 rounded text-[11px] transition-colors cursor-pointer border-none ${
            copied
              ? 'bg-[#40a02b] text-white'
              : 'bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a]'
          }`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Code area */}
      <div className="flex-1 overflow-auto p-3.5 preview-scrollbar">
        {!showCode ? (
          <div className="flex items-center justify-center h-full text-[#45475a] text-[13px] font-sans">
            Press “Compile” to build the scene code
          </div>
        ) : code ? (
          <pre
            className="whitespace-pre-wrap break-all leading-[1.65] font-mono text-[13px]"
            style={{ tabSize: 2 }}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[#45475a] text-[13px] font-sans">
            Select a scene to see its code
          </div>
        )}
      </div>
    </div>
  );
}
