import { useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useFlatVariablesOf } from '../../hooks/useFlatVariables';
import type { MenuLinkBlock, ButtonAction, MenuLinkTarget, VarOperator } from '../../types';
import { SYSTEM_TAGS } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { VarInsertButton } from '../shared/VarInsertButton';
import { useVariableNodes, usePluginParams } from '../shared/VariableScope';
import { ActionRow } from './LinkBlockEditor';

// ─── Main editor ──────────────────────────────────────────────────────────────

export function MenuLinkBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: MenuLinkBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<MenuLinkBlock>) => void;
}) {
  const t = useT();
  const ml = t.menuLinkBlock;
  const project       = useProjectStore(s => s.project);
  const updateBlock   = useProjectStore(s => s.updateBlock);
  const saveSnapshot  = useProjectStore(s => s.saveSnapshot);
  const variableNodes = useVariableNodes();
  const pluginParams  = usePluginParams();
  const update = onUpdate ?? ((p: Partial<MenuLinkBlock>) => updateBlock(sceneId, block.id, p));
  const variables = useFlatVariablesOf(variableNodes);
  const labelRef = useRef<HTMLInputElement>(null);
  const scenes = project.scenes.filter(s => s.id !== sceneId && !s.tags.some(tag => (SYSTEM_TAGS as readonly string[]).includes(tag)));
  const sceneParams = pluginParams.filter(p => p.kind === 'scene');
  const isParamTarget = (block.targetSceneId ?? '').startsWith('param:');

  const TARGETS: { value: MenuLinkTarget; label: string }[] = [
    { value: 'scene',    label: ml.targetScene },
    { value: 'back',     label: ml.targetBack },
    { value: 'saves',    label: ml.targetSaves },
    { value: 'restart',  label: ml.targetRestart },
    { value: 'settings', label: ml.targetSettings },
    { value: 'none',     label: ml.targetNone },
  ];

  const patchAction = (actionId: string, patch: Partial<ButtonAction>) =>
    update({
      actions: block.actions.map(a => a.id === actionId ? { ...a, ...patch } : a) as ButtonAction[],
    });

  const addAction = () =>
    update({
      actions: [
        ...block.actions,
        { id: crypto.randomUUID(), variableId: '', operator: '=' as VarOperator, value: '' },
      ],
    });

  const removeAction = (actionId: string) =>
    update({ actions: block.actions.filter(a => a.id !== actionId) });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-slate-500 -mb-1">{ml.hint}</p>

      {/* Label */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-24 shrink-0">{ml.labelField}</label>
        <input
          ref={labelRef}
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
          placeholder={ml.labelPlaceholder}
          value={block.label}
          onFocus={saveSnapshot}
          onChange={e => update({ label: e.target.value })}
        />
        <VarInsertButton
          targetRef={labelRef}
          value={block.label}
          onChange={label => update({ label })}
          vars={variables}
          variableNodes={variableNodes}
        />
      </div>

      {/* Target */}
      <div className="flex flex-col gap-2 bg-slate-800/50 border border-slate-700 rounded p-3">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{ml.targetLabel}</div>

        <div className="flex flex-wrap gap-1">
          {TARGETS.map(tgt => (
            <button
              key={tgt.value}
              onClick={() => update({ target: tgt.value })}
              className={`text-xs px-3 py-1 rounded border cursor-pointer transition-colors ${
                block.target === tgt.value
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'
              }`}
            >
              {tgt.label}
            </button>
          ))}
        </div>

        {/* Scene selector — only when target is 'scene' */}
        {block.target === 'scene' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-24 shrink-0">{ml.sceneLabel}</label>
            <select
              className="flex-1 bg-slate-800 text-xs text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none cursor-pointer"
              value={block.targetSceneId ?? ''}
              onChange={e => update({ targetSceneId: e.target.value })}
            >
              <option value="">{ml.noScene}</option>
              {sceneParams.length > 0 ? (
                <>
                  <optgroup label="— params —">
                    {sceneParams.map(p => (
                      <option key={p.key} value={`param:${p.key}`}>
                        _{p.key}{p.label ? ` (${p.label})` : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="— scenes —">
                    {scenes.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                </>
              ) : (
                scenes.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))
              )}
            </select>
            {isParamTarget && <span className="text-[10px] text-indigo-400 shrink-0">_param</span>}
          </div>
        )}

        {(block.target === 'saves' || block.target === 'restart' || block.target === 'settings') && (
          <p className="text-[10px] text-slate-500">{ml.builtinHint}</p>
        )}
      </div>

      {/* Actions (optional — run before the target action) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {ml.actionsTitle}
          </span>
          <button
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
            onClick={addAction}
          >
            {t.linkBlock.addAction}
          </button>
        </div>

        {block.actions.length === 0 && (
          <div className="text-xs text-slate-500 italic px-1">{t.linkBlock.noActions}</div>
        )}

        {block.actions.map(a => (
          <ActionRow
            key={a.id}
            action={a}
            variables={variables}
            onChange={patch => patchAction(a.id, patch)}
            onDelete={() => removeAction(a.id)}
            onFocusValue={saveSnapshot}
          />
        ))}
      </div>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
