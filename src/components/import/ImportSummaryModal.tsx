import { useEffect } from 'react';
import { useT } from '../../i18n';
import type { ImportSummary } from '../../utils/importFromTwee';

interface Props {
  summary: ImportSummary;
  onCancel: () => void;
  onConfirm: () => void;
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function ImportSummaryModal({ summary, onCancel, onConfirm }: Props) {
  const t = useT();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter')  onConfirm();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onCancel, onConfirm]);

  const stats = summary;
  const warnings = stats.warnings;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="px-5 py-3 border-b border-slate-700/80 shrink-0">
          <h2 className="text-base font-semibold text-white">{t.importSummary.title}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{t.importSummary.intro}</p>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 text-sm text-slate-200 space-y-3">
          <div className="text-xs text-slate-400 font-mono">{t.importSummary.format(stats.format)}</div>

          <ul className="space-y-1.5">
            <li className="flex items-baseline gap-2">
              <span className="text-indigo-400">•</span>
              <span>{t.importSummary.scenes(stats.sceneCount)}</span>
            </li>
            <li className="flex items-baseline gap-2">
              <span className="text-indigo-400">•</span>
              <span>{t.importSummary.blocksTotal(stats.blockCount)}</span>
            </li>
            {stats.rawBlockCount > 0 && (
              <li className="flex items-baseline gap-2">
                <span className="text-amber-400">⚠</span>
                <span className="text-amber-300">{t.importSummary.rawBlocks(stats.rawBlockCount)}</span>
              </li>
            )}
            {stats.variableCount > 0 && (
              <li className="flex items-baseline gap-2">
                <span className="text-indigo-400">•</span>
                <span>{t.importSummary.variables(stats.variableCount)}</span>
              </li>
            )}
            {stats.variableAutoCreatedCount > 0 && (
              <li className="flex items-baseline gap-2">
                <span className="text-indigo-400">•</span>
                <span className="text-slate-300">{t.importSummary.variablesAutoCreated(stats.variableAutoCreatedCount)}</span>
              </li>
            )}
            {stats.variableTodoCount > 0 && (
              <li className="flex items-baseline gap-2">
                <span className="text-amber-400">⚠</span>
                <span className="text-amber-300">{t.importSummary.variablesTodo(stats.variableTodoCount)}</span>
              </li>
            )}
            {stats.customCssBytes > 0 && (
              <li className="flex items-baseline gap-2">
                <span className="text-indigo-400">•</span>
                <span>{t.importSummary.customCss(humanBytes(stats.customCssBytes))}</span>
              </li>
            )}
            {stats.customScriptBytes > 0 && (
              <li className="flex items-baseline gap-2">
                <span className="text-indigo-400">•</span>
                <span>{t.importSummary.customScript(humanBytes(stats.customScriptBytes))}</span>
              </li>
            )}
          </ul>

          {Object.keys(stats.blockBreakdown).length > 0 && (
            <div className="bg-slate-900/40 rounded border border-slate-700/60 px-3 py-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {t.importSummary.blocksBreakdown}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(stats.blockBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <span
                      key={type}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
                        type === 'raw'
                          ? 'bg-amber-900/30 text-amber-300 border border-amber-800/40'
                          : 'bg-indigo-900/30 text-indigo-300 border border-indigo-800/40'
                      }`}
                    >
                      <span>{type}</span>
                      <span className="opacity-70">×{count}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}


          {warnings.length > 0 && (
            <details className="bg-slate-900/40 rounded border border-slate-700/60 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-amber-300 select-none">
                {t.importSummary.warningsTitle} ({warnings.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-300 font-mono break-all max-h-72 overflow-y-auto pr-2">
                {warnings.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </details>
          )}
        </div>

        <div className="bg-slate-900/50 px-5 py-3 border-t border-slate-700 flex justify-end gap-2 shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-slate-300 hover:text-white rounded border border-slate-600 hover:border-slate-400 transition-colors cursor-pointer"
          >
            {t.importSummary.cancel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors cursor-pointer font-medium"
          >
            {t.importSummary.openProject}
          </button>
        </div>
      </div>
    </div>
  );
}
