import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import type { SaveBlock } from '../../types';

export function SaveBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: SaveBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<SaveBlock>) => void;
}) {
  const t = useT();
  const sb = t.saveBlock;
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const update = onUpdate ?? ((p: Partial<SaveBlock>) => updateBlock(sceneId, block.id, p));

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] text-slate-400 leading-relaxed">{sb.hint}</p>

      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{sb.titleLabel}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
          placeholder={sb.titlePlaceholder}
          value={block.title ?? ''}
          onFocus={saveSnapshot}
          onChange={e => update({ title: e.target.value })}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={block.notify ?? false}
          onChange={e => update({ notify: e.target.checked })}
          className="accent-indigo-500 cursor-pointer"
        />
        <span className="text-xs text-slate-300">{sb.notifyLabel}</span>
      </label>

      {block.notify && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 w-24 shrink-0">{sb.notifyTextLabel}</label>
          <input
            className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
            placeholder={sb.notifyTextPlaceholder}
            value={block.notifyText ?? ''}
            onFocus={saveSnapshot}
            onChange={e => update({ notifyText: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
