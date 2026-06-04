import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import type { SetQuestStateBlock, QuestState } from '../../types';

const STATES: QuestState[] = ['hidden', 'active', 'done', 'failed'];
const inputCls = 'bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 outline-none focus:border-indigo-500';

export function QuestSetBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: SetQuestStateBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<SetQuestStateBlock>) => void;
}) {
  const updateBlock = useProjectStore(s => s.updateBlock);
  const quests = useProjectStore(s => s.project.quests) ?? [];
  const t = useT();
  const update = onUpdate ?? ((p: Partial<SetQuestStateBlock>) => updateBlock(sceneId, block.id, p as never));

  const stateLabel: Record<QuestState, string> = {
    hidden: t.quests.stateHidden, active: t.quests.stateActive, done: t.quests.stateDone, failed: t.quests.stateFailed,
  };

  if (quests.length === 0) {
    return <div className="text-xs text-slate-500 italic">{t.questSetBlock.noQuests}</div>;
  }

  const quest = quests.find(q => q.id === block.questId);
  const stepStateOf = (stepId: string) => block.stepStates?.find(s => s.stepId === stepId)?.state ?? '';
  const setStepState = (stepId: string, value: string) => {
    const arr = (block.stepStates ?? []).filter(s => s.stepId !== stepId);
    if (value) arr.push({ stepId, state: value as QuestState });
    update({ stepStates: arr });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0">{t.questSetBlock.quest}</span>
        <select
          className={`flex-1 min-w-0 ${inputCls} cursor-pointer`}
          value={block.questId}
          onChange={e => update({ questId: e.target.value, parentState: undefined, stepStates: [] })}
        >
          <option value="">{t.questSetBlock.selectQuest}</option>
          {quests.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
        </select>
      </div>

      {quest && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0 w-32 truncate">{t.questSetBlock.parentState}</span>
            <select
              className={`flex-1 min-w-0 ${inputCls} cursor-pointer`}
              value={block.parentState ?? ''}
              onChange={e => update({ parentState: e.target.value ? e.target.value as QuestState : undefined })}
            >
              <option value="">{t.questSetBlock.keep}</option>
              {STATES.map(s => <option key={s} value={s}>{stateLabel[s]}</option>)}
            </select>
          </div>

          {quest.composite && quest.steps.map(st => (
            <div key={st.id} className="flex items-center gap-2 pl-3">
              <span className="text-xs text-slate-500 shrink-0 w-32 truncate" title={st.name}>{st.name}</span>
              <select
                className={`flex-1 min-w-0 ${inputCls} cursor-pointer`}
                value={stepStateOf(st.id)}
                onChange={e => setStepState(st.id, e.target.value)}
              >
                <option value="">{t.questSetBlock.keep}</option>
                {STATES.map(s => <option key={s} value={s}>{stateLabel[s]}</option>)}
              </select>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
