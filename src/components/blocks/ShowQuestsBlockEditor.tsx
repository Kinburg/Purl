import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import type { ShowQuestsBlock, QuestState } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';

const STATES: QuestState[] = ['hidden', 'active', 'done', 'failed'];

function chip(active: boolean): string {
  return `text-[11px] px-2 py-0.5 rounded border cursor-pointer transition-colors ${
    active ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400'
  }`;
}

export function ShowQuestsBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: ShowQuestsBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<ShowQuestsBlock>) => void;
}) {
  const updateBlock = useProjectStore(s => s.updateBlock);
  const categories = useProjectStore(s => s.project.questCategories) ?? [];
  const t = useT();
  const update = onUpdate ?? ((p: Partial<ShowQuestsBlock>) => updateBlock(sceneId, block.id, p as never));

  const stateLabel: Record<QuestState, string> = {
    hidden: t.quests.stateHidden, active: t.quests.stateActive, done: t.quests.stateDone, failed: t.quests.stateFailed,
  };

  const selStates = block.filterStates ?? [];
  const selCats = block.filterCategoryIds ?? [];

  const toggleState = (s: QuestState) =>
    update({ filterStates: selStates.includes(s) ? selStates.filter(x => x !== s) : [...selStates, s] });
  const toggleCat = (id: string) =>
    update({ filterCategoryIds: selCats.includes(id) ? selCats.filter(x => x !== id) : [...selCats, id] });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{t.questShowBlock.filterStates}</span>
        <div className="flex flex-wrap gap-1">
          {STATES.map(s => (
            <button key={s} type="button" onClick={() => toggleState(s)} className={chip(selStates.includes(s))}>{stateLabel[s]}</button>
          ))}
        </div>
        {selStates.length === 0 && <span className="text-[10px] text-slate-600">{t.questShowBlock.defaultStates}</span>}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{t.questShowBlock.filterCategories}</span>
          <div className="flex flex-wrap gap-1">
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCat(c.id)}
                className={chip(selCats.includes(c.id))}
                style={selCats.includes(c.id) ? undefined : { color: c.color }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-0.5">
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
          <input type="checkbox" className="accent-indigo-500 cursor-pointer" checked={block.showDescription !== false} onChange={e => update({ showDescription: e.target.checked })} />
          {t.questShowBlock.showDescription}
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
          <input type="checkbox" className="accent-indigo-500 cursor-pointer" checked={block.showSteps !== false} onChange={e => update({ showSteps: e.target.checked })} />
          {t.questShowBlock.showSteps}
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
          <input type="checkbox" className="accent-indigo-500 cursor-pointer" checked={block.live === true} onChange={e => update({ live: e.target.checked })} />
          {t.questShowBlock.live}
        </label>
      </div>

      <BlockEffectsPanel delay={block.delay} onDelayChange={v => update({ delay: v })} />
    </div>
  );
}
