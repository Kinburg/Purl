import { useProjectStore } from '../../store/projectStore';
import { useFlatVariablesOf } from '../../hooks/useFlatVariables';
import { useVariableNodes } from '../shared/VariableScope';
import { VariablePicker } from '../shared/VariablePicker';
import { useT } from '../../i18n';
import type { SetObjectBlock, SetObjectEntry } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { EmojiIcon } from '../shared/EmojiIcons';

type EntryType = SetObjectEntry['valueType'];

const VALUE_TYPES: { value: EntryType; label: string }[] = [
  { value: 'string',  label: 'string' },
  { value: 'number',  label: 'number' },
  { value: 'boolean', label: 'bool' },
  { value: 'array',   label: 'array' },
  { value: 'object',  label: 'object' },
];

function uid(): string { return crypto.randomUUID(); }

/** Recursive entries editor — the heart of SetObjectBlockEditor. */
function EntriesEditor({
  entries,
  onChange,
  onFocus,
}: {
  entries: SetObjectEntry[];
  onChange: (entries: SetObjectEntry[]) => void;
  onFocus: () => void;
}) {
  const t = useT();

  const patchEntry = (id: string, patch: Partial<SetObjectEntry>) => {
    onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  };
  const removeEntry = (id: string) => {
    onChange(entries.filter(e => e.id !== id));
  };
  const addEntry = () => {
    onChange([...entries, { id: uid(), key: '', valueType: 'string', value: '' }]);
  };

  return (
    <div className="flex flex-col gap-1">
      {entries.map(e => {
        const isObj = e.valueType === 'object';
        return (
          <div key={e.id} className="rounded border border-slate-700/70 bg-slate-900/30">
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              <input
                className="flex-1 min-w-0 bg-slate-800 text-xs text-white font-mono rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                placeholder={t.setObject.keyPlaceholder}
                value={e.key}
                onFocus={onFocus}
                onChange={ev => patchEntry(e.id, { key: ev.target.value })}
              />
              <select
                className="bg-slate-800 text-xs text-slate-300 rounded px-1.5 py-1 outline-none border border-slate-600 cursor-pointer font-mono"
                value={e.valueType}
                onChange={ev => {
                  const nt = ev.target.value as EntryType;
                  // Reset value/entries when switching kinds to avoid stale data.
                  patchEntry(e.id, {
                    valueType: nt,
                    value: nt === 'object' ? undefined : (nt === 'boolean' ? 'false' : ''),
                    entries: nt === 'object' ? (e.entries ?? []) : undefined,
                  });
                }}
              >
                {VALUE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              {!isObj && (
                e.valueType === 'boolean' ? (
                  <select
                    className="w-20 bg-slate-800 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 cursor-pointer font-mono"
                    value={e.value === 'true' ? 'true' : 'false'}
                    onChange={ev => patchEntry(e.id, { value: ev.target.value })}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    className="flex-1 min-w-0 bg-slate-800 text-xs text-white font-mono rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                    placeholder={
                      e.valueType === 'array' ? '[1, 2, "x"]'
                      : e.valueType === 'number' ? '0'
                      : t.setObject.valuePlaceholder
                    }
                    value={e.value ?? ''}
                    onFocus={onFocus}
                    onChange={ev => patchEntry(e.id, { value: ev.target.value })}
                  />
                )
              )}

              <button
                className="text-slate-500 hover:text-red-400 px-1 cursor-pointer shrink-0"
                title={t.setObject.removeEntry}
                onClick={() => removeEntry(e.id)}
              >
                <EmojiIcon name="close" size={18} />
              </button>
            </div>

            {isObj && (
              <div className="pl-4 pr-1.5 pb-1.5 border-l-2 border-purple-700/40 ml-3 mb-1">
                <EntriesEditor
                  entries={e.entries ?? []}
                  onChange={ne => patchEntry(e.id, { entries: ne })}
                  onFocus={onFocus}
                />
              </div>
            )}
          </div>
        );
      })}

      <button
        className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/60 rounded px-2 py-1 transition-colors cursor-pointer text-left border border-dashed border-indigo-800/40"
        onClick={addEntry}
      >
        {t.setObject.addEntry}
      </button>
    </div>
  );
}

export function SetObjectBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: SetObjectBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<SetObjectBlock>) => void;
}) {
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const variableNodes = useVariableNodes();
  const variables = useFlatVariablesOf(variableNodes);
  const t = useT();

  const update = onUpdate ?? ((p: Partial<SetObjectBlock>) => updateBlock(sceneId, block.id, p as never));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 shrink-0 font-mono">$</label>
        <VariablePicker
          value={block.variableId}
          onChange={id => update({ variableId: id })}
          nodes={variableNodes}
          // Object assignments are usually targeted at string-typed slots in Purl
          // (or freshly-created vars). Don't filter — let the user pick anything.
          placeholder={t.setObject.varPlaceholder}
          className="flex-1 min-w-0"
        />
      </div>

      <EntriesEditor
        entries={block.entries}
        onChange={es => update({ entries: es })}
        onFocus={saveSnapshot}
      />

      {variables.find(v => v.id === block.variableId) === undefined && (
        <div className="text-xs text-slate-500 italic">
          {t.setObject.pickVariableHint}
        </div>
      )}

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
