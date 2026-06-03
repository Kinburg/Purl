import { useMemo, useState, useCallback, type ReactNode } from 'react';
import type { Project } from '../../types';
import { useProjectStore } from '../../store/projectStore';
import { usePluginStore } from '../../store/pluginStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import { useT } from '../../i18n';
import { useDebouncedValue } from '../../utils/useDebouncedValue';
import { computeStats, type StoryStats } from '../../utils/storyStats';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pb-1">
      <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-0.5 text-xs">
      <span className="text-slate-400 min-w-0 truncate">{label}</span>
      <span className="text-slate-200 font-medium tabular-nums shrink-0">{value}</span>
    </div>
  );
}

/**
 * Story statistics panel. Honors `editorPrefs.statsMode`:
 *  - 'live'   — recompute (debounced) on every edit.
 *  - 'manual' — recompute only on the Refresh button (the live memo short-circuits
 *               to null, so `computeStats` never runs on edits). Shows a "story
 *               changed" stale hint, mirroring the validator.
 */
export function StatsPanel() {
  const project        = useProjectStore(s => s.project);
  const activeSceneId  = useProjectStore(s => s.activeSceneId);
  const setActiveScene = useProjectStore(s => s.setActiveScene);
  const pluginCount    = usePluginStore(s => s.plugins.length);
  const mode           = useEditorPrefsStore(s => s.statsMode);
  const t = useT();

  const debounced = useDebouncedValue(project, 400);
  const live = useMemo(
    () => (mode === 'live' ? computeStats(debounced, pluginCount) : null),
    [mode, debounced, pluginCount],
  );

  const [manual, setManual] = useState<{ stats: StoryStats; project: Project } | null>(null);
  const refresh = useCallback(
    () => setManual({ stats: computeStats(project, pluginCount), project }),
    [project, pluginCount],
  );

  const ranManual = mode === 'manual' && manual !== null;
  const stale     = mode === 'manual' && manual !== null && manual.project !== project;
  const showStats = mode === 'live' || ranManual;
  const stats     = mode === 'live' ? live : (manual?.stats ?? null);

  return (
    <div className="flex flex-col pb-2">
      {mode === 'manual' && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
          <button
            type="button"
            onClick={refresh}
            className={`text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
              stale ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-indigo-600 text-white hover:bg-indigo-500'
            }`}
          >
            {t.stats.refresh}
          </button>
          {stale && <span className="text-[10px] text-amber-400">{t.stats.stale}</span>}
        </div>
      )}

      {!showStats || !stats ? (
        <div className="px-3 py-8 text-center text-slate-500 text-xs">{t.stats.notComputed}</div>
      ) : (
        <>
          <Section title={t.stats.sectionOverview}>
            <Row label={t.stats.words}        value={stats.totalWords.toLocaleString()} />
            <Row label={t.stats.readingTime}  value={t.stats.minutes(stats.readingMinutes)} />
            <Row label={t.stats.scenes}       value={stats.scenes} />
            <Row label={t.stats.systemScenes} value={stats.systemScenes} />
            <Row label={t.stats.groups}       value={stats.groups} />
          </Section>

          <Section title={t.stats.sectionFlow}>
            <Row label={t.stats.choices}     value={stats.choiceOptions} />
            <Row label={t.stats.links}       value={stats.navLinks} />
            <Row label={t.stats.endings}     value={stats.endings} />
            <Row label={t.stats.unreachable} value={stats.unreachable} />
            <Row label={t.stats.branching}   value={stats.branchingFactor.toFixed(1)} />
          </Section>

          <Section title={t.stats.sectionEntities}>
            <Row label={t.stats.characters} value={stats.characters} />
            <Row label={t.stats.items}      value={stats.items} />
            <Row label={t.stats.containers} value={stats.containers} />
            <Row label={t.stats.variables}  value={stats.variables} />
            <Row label={t.stats.watchers}   value={stats.watchers} />
            <Row label={t.stats.plugins}    value={stats.plugins} />
            <Row label={t.stats.assets}     value={stats.assets} />
          </Section>

          <Section title={t.stats.sectionBlocks}>
            <Row label={t.stats.totalBlocks} value={stats.blocks} />
            {stats.blocksByType.length > 0 && (
              <div className="px-3 pt-1 flex flex-wrap gap-1">
                {stats.blocksByType.map(({ type, count }) => (
                  <span key={type} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    {type} <span className="text-slate-500 tabular-nums">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </Section>

          <Section title={t.stats.perScene}>
            {stats.perScene.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">{t.stats.empty}</div>
            ) : (
              stats.perScene.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveScene(s.id)}
                  title={s.name}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-0.5 text-xs cursor-pointer transition-colors hover:bg-slate-800 ${
                    s.id === activeSceneId ? 'bg-slate-800/60' : ''
                  }`}
                >
                  <span className="min-w-0 truncate text-slate-300 text-left">{s.name}</span>
                  <span className="text-slate-500 tabular-nums shrink-0">{s.words}</span>
                </button>
              ))
            )}
          </Section>
        </>
      )}
    </div>
  );
}
