import { useMemo, useState, useCallback } from 'react';
import type { Project } from '../../types';
import { useProjectStore } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useT } from '../../i18n';
import { useDebouncedValue } from '../../utils/useDebouncedValue';
import {
  validateProject,
  SEVERITY_ORDER,
  type ValidationIssue,
  type IssueSeverity,
} from '../../utils/validateProject';

const SEV_COLOR: Record<IssueSeverity, string> = {
  error:   '#f38ba8', // red
  warning: '#f9e2af', // amber
  info:    '#89dceb', // sky
};
const SEV_GLYPH: Record<IssueSeverity, string> = { error: '✕', warning: '!', info: 'i' };

const sortIssues = (list: ValidationIssue[]): ValidationIssue[] =>
  [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

/**
 * Story validator panel ("Doctor"). Lists structural / navigational problems with
 * click-to-open (a row → opens its scene in the main editor).
 *
 * Two modes (Editor Prefs → Behavior → Validator):
 *  - 'live'   — recompute automatically, debounced, on every edit.
 *  - 'manual' — recompute only when the Run button is pressed (better for very
 *               large stories where a per-keystroke pass would lag the app).
 */
export function ValidatePanel() {
  const project        = useProjectStore(s => s.project);
  const activeSceneId  = useProjectStore(s => s.activeSceneId);
  const setActiveScene = useProjectStore(s => s.setActiveScene);
  const mode           = useEditorPrefsStore(s => s.validationMode);
  const t = useT();

  // Live mode: recompute (debounced) whenever the project changes. Manual mode:
  // the memo short-circuits to null so validateProject never runs on edits.
  const debounced = useDebouncedValue(project, 300);
  const liveIssues = useMemo(
    () => (mode === 'live' ? sortIssues(validateProject(debounced)) : null),
    [mode, debounced],
  );

  // Manual mode: results are a snapshot captured on Run; we remember which project
  // they were computed from so we can flag staleness after later edits.
  const [manual, setManual] = useState<{ issues: ValidationIssue[]; project: Project } | null>(null);
  const run = useCallback(
    () => setManual({ issues: sortIssues(validateProject(project)), project }),
    [project],
  );

  const ranManual   = mode === 'manual' && manual !== null;
  const stale       = mode === 'manual' && manual !== null && manual.project !== project;
  const showResults = mode === 'live' || ranManual;
  const issues = useMemo(
    () => (mode === 'live' ? (liveIssues ?? []) : (manual?.issues ?? [])),
    [mode, liveIssues, manual],
  );

  const counts = useMemo(() => ({
    error:   issues.filter(i => i.severity === 'error').length,
    warning: issues.filter(i => i.severity === 'warning').length,
    info:    issues.filter(i => i.severity === 'info').length,
  }), [issues]);

  const message = (issue: ValidationIssue): string => {
    const m = t.validate.messages;
    switch (issue.code) {
      case 'no-start':         return m.noStart;
      case 'multiple-start':   return m.multipleStart(issue.detail ?? '');
      case 'duplicate-name':   return m.duplicateName(issue.detail ?? '');
      case 'dangling-target':  return m.danglingTarget(issue.detail ?? '');
      case 'unreachable':      return m.unreachable;
      case 'dead-end':         return m.deadEnd;
      case 'empty-scene':      return m.emptyScene;
      case 'choice-no-target': return m.choiceNoTarget;
      case 'choice-no-label':  return m.choiceNoLabel;
      case 'empty-branch':     return m.emptyBranch;
    }
  };

  return (
    <div className="flex flex-col">
      {/* Manual-mode toolbar */}
      {mode === 'manual' && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
          <button
            type="button"
            onClick={run}
            className="text-xs px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer transition-colors"
          >
            {ranManual ? t.validate.rerun : t.validate.run}
          </button>
          {stale && <span className="text-[10px] text-amber-400">{t.validate.stale}</span>}
        </div>
      )}

      {/* Body */}
      {!showResults ? (
        <div className="px-3 py-8 text-center text-slate-500 text-xs">{t.validate.notRun}</div>
      ) : issues.length === 0 ? (
        <div className="px-3 py-8 text-center text-slate-500 text-xs">
          <span style={{ color: '#a6e3a1' }}>✓</span> {t.validate.allGood}
        </div>
      ) : (
        <>
          {/* Summary counts */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 text-[11px] border-b border-slate-800">
            {counts.error   > 0 && <span style={{ color: SEV_COLOR.error }}>● {counts.error} {t.validate.errors}</span>}
            {counts.warning > 0 && <span style={{ color: SEV_COLOR.warning }}>● {counts.warning} {t.validate.warnings}</span>}
            {counts.info    > 0 && <span style={{ color: SEV_COLOR.info }}>● {counts.info} {t.validate.notices}</span>}
          </div>

          {/* Issue list */}
          <ul className="py-1">
            {issues.map(issue => {
              const sev       = issue.severity;
              const clickable = !!issue.sceneId;
              const isActive  = !!issue.sceneId && issue.sceneId === activeSceneId;
              return (
                <li key={issue.key}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => issue.sceneId && setActiveScene(issue.sceneId)}
                    title={issue.sceneName}
                    className={`w-full text-left flex gap-2 px-3 py-1.5 border-l-2 transition-colors ${
                      clickable ? 'cursor-pointer hover:bg-slate-800' : 'cursor-default'
                    } ${isActive ? 'bg-slate-800/60' : ''}`}
                    style={{ borderColor: SEV_COLOR[sev] }}
                  >
                    <span
                      className="shrink-0 mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold leading-none"
                      style={{ color: '#11111b', background: SEV_COLOR[sev] }}
                    >
                      {SEV_GLYPH[sev]}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-slate-200 leading-snug">{message(issue)}</span>
                      {issue.sceneName && (
                        <span className="block text-[11px] text-slate-500 truncate">{issue.sceneName}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
