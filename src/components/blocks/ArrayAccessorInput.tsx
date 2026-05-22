import type { ArrayAccessor, ArrayIndexSource, Variable } from '../../types';
import { useT } from '../../i18n';
import NumericInput from '../shared/NumericInput';

/**
 * Secondary control shown when the selected variable is of type 'array'.
 * Lets the user choose HOW the array is accessed:
 *   - 'whole'  → $arr
 *   - 'index'  → $arr[0] or $arr[$i]
 *   - 'length' → $arr.length  (read-only; hidden when allowLength=false)
 */
export function ArrayAccessorInput({
  accessor,
  onChange,
  vars,
  allowLength = true,
}: {
  accessor: ArrayAccessor | undefined;
  onChange: (a: ArrayAccessor) => void;
  /** All project variables (used for the index-variable dropdown) */
  vars: Variable[];
  /** Whether to offer the .length option (useful in read/condition contexts) */
  allowLength?: boolean;
}) {
  const t = useT();
  const kind = accessor?.kind ?? 'whole';

  const numericVars = vars.filter(v => v.varType === 'number');

  const handleKindChange = (newKind: ArrayAccessor['kind']) => {
    if (newKind === 'whole')  onChange({ kind: 'whole' });
    if (newKind === 'length') onChange({ kind: 'length' });
    if (newKind === 'index')  onChange({ kind: 'index', source: { kind: 'literal', index: 0 } });
  };

  // Current index source (only relevant when kind === 'index')
  const indexSource: ArrayIndexSource =
    accessor?.kind === 'index' ? accessor.source : { kind: 'literal', index: 0 };

  const handleIndexSourceKindChange = (srcKind: 'literal' | 'variable') => {
    if (srcKind === 'literal') {
      onChange({ kind: 'index', source: { kind: 'literal', index: 0 } });
    } else {
      const firstNumVar = numericVars[0];
      onChange({ kind: 'index', source: { kind: 'variable', variableId: firstNumVar?.id ?? '' } });
    }
  };

  return (
    <div className="flex flex-col gap-1 mt-1">
      {/* Access kind selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-16 shrink-0">{t.arrayAccessor.label}</label>
        <select
          className="flex-1 bg-slate-800 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-violet-500 cursor-pointer"
          value={kind}
          onChange={e => handleKindChange(e.target.value as ArrayAccessor['kind'])}
        >
          <option value="whole">{t.arrayAccessor.whole}</option>
          <option value="index">{t.arrayAccessor.index}</option>
          {allowLength && <option value="length">{t.arrayAccessor.length}</option>}
        </select>
      </div>

      {/* Index sub-controls */}
      {kind === 'index' && (
        <div className="flex items-center gap-2 pl-18">
          {/* Toggle: literal number vs variable */}
          <div className="flex gap-1 ml-18">
            <button
              className={`text-xs rounded px-2 py-0.5 cursor-pointer transition-colors ${
                indexSource.kind === 'literal'
                  ? 'bg-violet-700 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
              onClick={() => handleIndexSourceKindChange('literal')}
            >
              {t.arrayAccessor.indexLiteral}
            </button>
            <button
              className={`text-xs rounded px-2 py-0.5 cursor-pointer transition-colors ${
                indexSource.kind === 'variable'
                  ? 'bg-violet-700 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
              onClick={() => handleIndexSourceKindChange('variable')}
            >
              {t.arrayAccessor.indexVariable}
            </button>
          </div>

          {indexSource.kind === 'literal' && (
            <NumericInput
              min={0}
              className="w-16 bg-slate-800 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-violet-500 font-mono"
              placeholder={t.arrayAccessor.indexPlaceholder}
              value={indexSource.index}
              onChange={v => onChange({ kind: 'index', source: { kind: 'literal', index: v } })}
            />
          )}

          {indexSource.kind === 'variable' && (
            <select
              className="flex-1 bg-slate-800 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-violet-500 cursor-pointer"
              value={indexSource.variableId}
              onChange={e => onChange({ kind: 'index', source: { kind: 'variable', variableId: e.target.value } })}
            >
              <option value="">{t.arrayAccessor.selectIndexVar}</option>
              {numericVars.map(v => (
                <option key={v.id} value={v.id}>${v.name}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
