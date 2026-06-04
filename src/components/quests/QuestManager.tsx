import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { QuestDefinition, QuestState } from '../../types';
import { useT } from '../../i18n';
import { QuestEditor } from './QuestEditor';
import { useConfirm } from '../shared/ConfirmModal';

const STATE_DOT: Record<QuestState, string> = {
  hidden: '#6c7086', active: '#89b4fa', done: '#a6e3a1', failed: '#f38ba8',
};

type Draft = Omit<QuestDefinition, 'id' | 'varIds'>;
type ModalState = { mode: 'create'; draft: Draft } | { mode: 'edit'; quest: QuestDefinition } | null;

const ADD_BTN = 'flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600';

export function QuestManager() {
  const t = useT();
  const project              = useProjectStore(s => s.project);
  const addQuest             = useProjectStore(s => s.addQuest);
  const updateQuest          = useProjectStore(s => s.updateQuest);
  const deleteQuest          = useProjectStore(s => s.deleteQuest);
  const addQuestCategory     = useProjectStore(s => s.addQuestCategory);
  const updateQuestCategory  = useProjectStore(s => s.updateQuestCategory);
  const deleteQuestCategory  = useProjectStore(s => s.deleteQuestCategory);
  const confirmDelete        = useEditorPrefsStore(s => s.confirmDeleteCharacter);
  const { ask, modal: confirmModal } = useConfirm();

  const quests = project.quests ?? [];
  const categories = project.questCategories ?? [];
  const [modal, setModal] = useState<ModalState>(null);
  const [showCats, setShowCats] = useState(false);

  const cat = (id?: string) => categories.find(c => c.id === id);

  const openCreate = () =>
    setModal({ mode: 'create', draft: { name: t.quests.defaultName, varName: '', initialState: 'active', composite: false, steps: [] } });

  const onDelete = (q: QuestDefinition) => {
    if (confirmDelete) ask({ message: t.quests.confirmDelete(q.name), variant: 'danger' }, () => deleteQuest(q.id));
    else deleteQuest(q.id);
  };

  return (
    <div className="p-2 flex flex-col gap-1">
      <div className="flex gap-1 pb-1 border-b border-slate-800 mb-1">
        <button className={ADD_BTN} onClick={openCreate}>{t.quests.add}</button>
      </div>

      {quests.map(q => {
        const c = cat(q.categoryId);
        return (
          <div
            key={q.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-slate-700 hover:bg-slate-800 transition-colors cursor-pointer"
            onClick={() => setModal({ mode: 'edit', quest: q })}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATE_DOT[q.initialState] }} title={q.initialState} />
            <span className="flex-1 text-xs truncate" style={{ color: c?.color ?? '#cdd6f4' }}>{q.name || t.quests.noName}</span>
            {q.composite && <span className="text-[10px] text-slate-500 shrink-0">{q.steps.length}⋯</span>}
            {c && <span className="text-[10px] text-slate-500 shrink-0 truncate max-w-[60px]">{c.name}</span>}
            <button
              className="text-slate-600 hover:text-red-400 shrink-0 px-0.5 cursor-pointer"
              onClick={e => { e.stopPropagation(); onDelete(q); }}
            >✕</button>
          </div>
        );
      })}
      {quests.length === 0 && <p className="text-xs text-slate-600 italic px-2 py-1">{t.quests.empty}</p>}

      {/* Categories (collapsible) */}
      <div className="mt-2 border-t border-slate-800 pt-1">
        <button
          onClick={() => setShowCats(v => !v)}
          className="w-full text-left text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 px-1 py-1 cursor-pointer"
        >
          {showCats ? '▾' : '▸'} {t.quests.categories} ({categories.length})
        </button>
        {showCats && (
          <div className="flex flex-col gap-1 px-1 pb-1">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={c.color || '#cba6f7'}
                  onChange={e => updateQuestCategory(c.id, { color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border border-slate-600 p-0.5 shrink-0"
                />
                <input
                  className="flex-1 min-w-0 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 outline-none focus:border-indigo-500"
                  value={c.name}
                  onChange={e => updateQuestCategory(c.id, { name: e.target.value })}
                />
                <button onClick={() => deleteQuestCategory(c.id)} className="text-slate-600 hover:text-red-400 shrink-0 px-1 cursor-pointer">✕</button>
              </div>
            ))}
            <button
              onClick={() => addQuestCategory({ name: t.quests.newCategory, color: '#cba6f7' })}
              className="text-xs text-slate-400 hover:text-indigo-300 rounded px-2 py-1 border border-dashed border-slate-700 hover:border-indigo-600 cursor-pointer transition-colors"
            >
              {t.quests.addCategory}
            </button>
          </div>
        )}
      </div>

      {modal && (
        <QuestEditor
          mode={modal.mode}
          initial={modal.mode === 'create' ? modal.draft : modal.quest}
          categories={categories}
          onSave={(data) => { if (modal.mode === 'create') addQuest(data); else updateQuest(modal.quest.id, data); }}
          onClose={() => setModal(null)}
        />
      )}
      {confirmModal}
    </div>
  );
}
