import { useState } from 'react';
import { charToVarPrefix } from '../../store/projectStore';
import type { QuestDefinition, QuestStep, QuestState, QuestCategory } from '../../types';
import { useT } from '../../i18n';
import {
  ModalShell, ModalHeader, ModalBody, ModalSection, ModalField, ModalFooter,
  PrimaryButton, SecondaryButton, Segmented, Toggle, INPUT_CLS,
} from '../shared/ModalShell';

type Draft = Omit<QuestDefinition, 'id' | 'varIds'>;

const STATES: QuestState[] = ['hidden', 'active', 'done', 'failed'];

function newStep(): QuestStep {
  return { id: crypto.randomUUID(), name: '', varName: '', description: '', initialState: 'active' };
}

export function QuestEditor({
  mode, initial, categories, onSave, onClose,
}: {
  mode: 'create' | 'edit';
  initial: Draft;
  categories: QuestCategory[];
  onSave: (data: Draft) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '');
  const [initialState, setInitialState] = useState<QuestState>(initial.initialState);
  const [composite, setComposite] = useState(initial.composite);
  const [ordered, setOrdered] = useState(initial.ordered ?? false);
  const [autoCompleteParent, setAutoCompleteParent] = useState(initial.autoCompleteParent ?? true);
  const [steps, setSteps] = useState<QuestStep[]>(initial.steps ?? []);

  const stateLabels: Record<QuestState, string> = {
    hidden: t.quests.stateHidden, active: t.quests.stateActive, done: t.quests.stateDone, failed: t.quests.stateFailed,
  };
  const stateOptions = STATES.map(s => ({ value: s, label: stateLabels[s] }));

  const setStep = (id: string, patch: Partial<QuestStep>) =>
    setSteps(arr => arr.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeStep = (id: string) => setSteps(arr => arr.filter(s => s.id !== id));
  const moveStep = (idx: number, dir: -1 | 1) => setSteps(arr => {
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  const nameTrim = name.trim();
  const varNamePreview = charToVarPrefix(nameTrim) || 'quest';

  const save = () => {
    if (!nameTrim) return;
    const usedStepVars = new Set<string>();
    const finalSteps: QuestStep[] = composite
      ? steps.filter(s => s.name.trim()).map(s => {
          const base = charToVarPrefix(s.name) || 'step';
          let v = base, i = 2;
          while (usedStepVars.has(v)) { v = `${base}_${i}`; i++; }
          usedStepVars.add(v);
          return { ...s, name: s.name.trim(), varName: v, description: s.description?.trim() || undefined };
        })
      : [];
    onSave({
      name: nameTrim,
      varName: varNamePreview,
      description: description.trim() || undefined,
      categoryId: categoryId || undefined,
      initialState,
      composite,
      ordered: composite ? ordered : undefined,
      autoCompleteParent: composite ? autoCompleteParent : undefined,
      steps: finalSteps,
    });
    onClose();
  };

  return (
    <ModalShell onClose={onClose} width={560}>
      <ModalHeader
        title={mode === 'create' ? t.quests.createTitle : t.quests.editTitle}
        subtitle={`$quests.${varNamePreview}`}
        onClose={onClose}
      />
      <ModalBody>
        <ModalSection title={t.quests.sectionBasics}>
          <ModalField label={t.quests.name} required>
            <input className={INPUT_CLS} value={name} onChange={e => setName(e.target.value)} autoFocus />
          </ModalField>
          <ModalField label={t.quests.description}>
            <textarea className={INPUT_CLS} rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </ModalField>
          <ModalField label={t.quests.category}>
            <select className={INPUT_CLS + ' cursor-pointer'} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">{t.quests.noCategory}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </ModalField>
          <ModalField label={t.quests.initialState}>
            <Segmented<QuestState> value={initialState} options={stateOptions} onChange={setInitialState} />
          </ModalField>
        </ModalSection>

        <ModalSection title={t.quests.sectionStructure}>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Toggle value={composite} onChange={() => setComposite(v => !v)} />
            <span className="text-xs text-slate-300">{t.quests.composite}</span>
          </label>

          {composite && (
            <>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Toggle value={ordered} onChange={() => setOrdered(v => !v)} />
                <span className="text-xs text-slate-300">{t.quests.ordered}</span>
              </label>
              <p className="text-[10px] text-slate-500 -mt-1">{t.quests.orderedHint}</p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Toggle value={autoCompleteParent} onChange={() => setAutoCompleteParent(v => !v)} />
                <span className="text-xs text-slate-300">{t.quests.autoComplete}</span>
              </label>

              {/* Steps */}
              <div className="flex flex-col gap-2 mt-1">
                {steps.map((s, idx) => (
                  <div key={s.id} className="rounded border border-slate-700 bg-slate-900/40 p-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 w-4 shrink-0">{idx + 1}.</span>
                      <input
                        className={INPUT_CLS}
                        placeholder={t.quests.stepName}
                        value={s.name}
                        onChange={e => setStep(s.id, { name: e.target.value })}
                      />
                      <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                        className="text-slate-500 hover:text-slate-200 disabled:opacity-30 cursor-pointer px-1">▲</button>
                      <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                        className="text-slate-500 hover:text-slate-200 disabled:opacity-30 cursor-pointer px-1">▼</button>
                      <button type="button" onClick={() => removeStep(s.id)}
                        className="text-slate-600 hover:text-red-400 cursor-pointer px-1">✕</button>
                    </div>
                    <input
                      className={INPUT_CLS}
                      placeholder={t.quests.description}
                      value={s.description ?? ''}
                      onChange={e => setStep(s.id, { description: e.target.value })}
                    />
                    <Segmented<QuestState> value={s.initialState} options={stateOptions} onChange={v => setStep(s.id, { initialState: v })} />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setSteps(arr => [...arr, newStep()])}
                  className="text-xs text-slate-400 hover:text-indigo-300 rounded px-2 py-1.5 border border-dashed border-slate-700 hover:border-indigo-600 cursor-pointer transition-colors"
                >
                  {t.quests.addStep}
                </button>
              </div>
            </>
          )}
        </ModalSection>
      </ModalBody>
      <ModalFooter>
        <SecondaryButton onClick={onClose}>{t.quests.cancel}</SecondaryButton>
        <PrimaryButton onClick={save} disabled={!nameTrim}>
          {mode === 'create' ? t.quests.create : t.quests.save}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
