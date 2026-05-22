import { useState, useEffect, useMemo } from 'react';
import { usePluginStore } from '../../store/pluginStore';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import { toast } from 'sonner';
import type {
  PluginBlockDef, PluginParam, PluginParamKind, Block, VariableTreeNode,
} from '../../types';
import { EmojiIcon } from '../shared/EmojiIcons';
import { ModalShell } from '../shared/ModalShell';
function PluginGlyph({ icon, size }: { icon?: string; size: number }) {
  if (icon) return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
  return <EmojiIcon name="puzzle" size={size} />;
}
import {
  makePluginDef, makePluginParam, defaultForKind, validatePluginDef,
  slugifyPluginName, uniqueSlug,
} from '../../utils/pluginUtils';
import { PluginBodyEditor } from './PluginBodyEditor';

const PARAM_KINDS: PluginParamKind[] = ['text', 'number', 'bool', 'array', 'datetime', 'object', 'scene'];

export function PluginEditorModal() {
  const target = useEditorStore((s) => s.pluginEditorTarget);
  const close  = useEditorStore((s) => s.closePluginEditor);
  const { plugins, savePlugin, deletePlugin, reserveSlug } = usePluginStore();
  const t = useT();

  const [draft, setDraft] = useState<PluginBlockDef | null>(null);
  const [, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load draft when target changes
  useEffect(() => {
    if (!target) { setDraft(null); setDirty(false); return; }
    if (target === 'new') {
      const id = reserveSlug('new-plugin');
      setDraft(makePluginDef(id, 'New Plugin'));
    } else {
      const existing = plugins.find((p) => p.id === target);
      if (existing) {
        // Deep clone so changes don't mutate the store until Save
        setDraft(JSON.parse(JSON.stringify(existing)));
      } else {
        close();
      }
    }
    setDirty(false);
    setConfirmDelete(false);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target || !draft) return null;

  const patch = (p: Partial<PluginBlockDef>) => {
    setDraft((d) => d ? { ...d, ...p } : d);
    setDirty(true);
  };

  const handleSave = async () => {
    const err = validatePluginDef(draft);
    if (err) { toast.error(t.pluginEditor[err as keyof typeof t.pluginEditor] as string ?? err); return; }
    // If this is a new plugin, ensure id is unique against existing
    let toSave = draft;
    if (target === 'new') {
      const existing = new Set(plugins.map((p) => p.id));
      const wantedId = draft.id || slugifyPluginName(draft.name);
      const finalId = uniqueSlug(wantedId, existing);
      if (finalId !== draft.id) toSave = { ...draft, id: finalId };
    }
    const saveErr = await savePlugin(toSave);
    if (saveErr) { toast.error(saveErr); return; }
    toast.success(t.pluginEditor.savedToast);
    close();
  };

  const handleDelete = async () => {
    if (target === 'new') { close(); return; }
    await deletePlugin(draft.id);
    toast.success(t.pluginEditor.deletedToast);
    close();
  };

  return (
    <ModalShell onClose={close} width={760}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700 shrink-0">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 min-w-0">
          <span className="shrink-0"><PluginGlyph icon={draft.icon} size={30} /></span>
          <span className="truncate">{target === 'new' ? t.pluginEditor.newPlugin : t.pluginEditor.title}</span>
          <span className="text-xs text-slate-500 font-mono truncate">[{draft.id}]</span>
        </h2>
        <button
          className="text-slate-400 hover:text-slate-100 transition-colors p-1 -m-1 cursor-pointer shrink-0"
          onClick={close}
          aria-label="Close"
        >
          <EmojiIcon name="close" size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-6">
        <MetaSection draft={draft} patch={patch} />
        <ParamsSection draft={draft} patch={patch} />
        <BlocksSection draft={draft} patch={patch} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-700 shrink-0">
        <div>
          {target !== 'new' && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">{t.pluginEditor.confirmDelete}</span>
                <button
                  className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-500 text-white cursor-pointer transition-colors"
                  onClick={handleDelete}
                >
                  {t.common.delete}
                </button>
                <button
                  className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer transition-colors"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t.common.cancel}
                </button>
              </div>
            ) : (
              <button
                className="text-xs text-red-400 hover:text-red-300 cursor-pointer transition-colors"
                onClick={() => setConfirmDelete(true)}
              >
                {t.pluginEditor.delete}
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={close}
            className="px-3 py-1.5 rounded text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-700/60 cursor-pointer transition-colors"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer transition-colors"
          >
            {t.pluginEditor.save}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Meta section ────────────────────────────────────────────────────────────

function MetaSection({ draft, patch }: { draft: PluginBlockDef; patch: (p: Partial<PluginBlockDef>) => void }) {
  const t = useT();
  const inputCls =
    'bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 outline-none focus:border-indigo-500 transition-colors';

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t.pluginEditor.metaSection}</h3>
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center">
        <span className="text-xs text-slate-400">{t.pluginEditor.name}</span>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          className={`${inputCls} min-w-0`}
        />
        <span className="text-xs text-slate-400">{t.pluginEditor.icon}</span>
        <input
          type="text"
          maxLength={4}
          value={draft.icon ?? ''}
          onChange={(e) => patch({ icon: e.target.value })}
          className={`${inputCls} w-16 text-center`}
          placeholder="icon"
        />

        <span className="text-xs text-slate-400">{t.pluginEditor.color}</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => patch({ color: e.target.value })}
            className="w-8 h-7 rounded cursor-pointer bg-transparent border border-slate-600 p-0.5"
          />
          <input
            type="text"
            value={draft.color}
            onChange={(e) => patch({ color: e.target.value })}
            className={`${inputCls} w-28`}
          />
        </div>
        <span className="text-xs text-slate-400">{t.pluginEditor.version}</span>
        <input
          type="text"
          value={draft.version ?? ''}
          onChange={(e) => patch({ version: e.target.value })}
          className={`${inputCls} w-20`}
        />
      </div>
      <div className="flex items-start gap-2">
        <span className="text-xs text-slate-400 min-w-[80px] pt-1">{t.pluginEditor.description}</span>
        <textarea
          value={draft.description ?? ''}
          onChange={(e) => patch({ description: e.target.value })}
          className={`${inputCls} flex-1 min-h-[40px] resize-y`}
          rows={2}
        />
      </div>
    </section>
  );
}

// ─── Params section ──────────────────────────────────────────────────────────

/** Flatten all groups in the variable tree into a flat list with their full dot-paths. */
function flattenGroups(nodes: VariableTreeNode[], prefix = ''): { id: string; path: string }[] {
  const result: { id: string; path: string }[] = [];
  for (const n of nodes) {
    if (n.kind === 'group') {
      const path = prefix ? `${prefix}.${n.name}` : n.name;
      result.push({ id: n.id, path });
      result.push(...flattenGroups(n.children, path));
    }
  }
  return result;
}

function ParamsSection({ draft, patch }: { draft: PluginBlockDef; patch: (p: Partial<PluginBlockDef>) => void }) {
  const t = useT();
  const project = useProjectStore(s => s.project);
  const allGroups = useMemo(() => flattenGroups(project.variableNodes), [project.variableNodes]);
  const inputCls =
    'bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 outline-none focus:border-indigo-500 transition-colors';

  const updateParam = (i: number, update: Partial<PluginParam>) => {
    const next = draft.params.map((p, idx) => idx === i ? { ...p, ...update } : p);
    patch({ params: next });
  };
  const addParam = () => patch({ params: [...draft.params, makePluginParam('text')] });
  const removeParam = (i: number) => patch({ params: draft.params.filter((_, idx) => idx !== i) });
  const moveParam = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.params.length) return;
    const next = [...draft.params];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ params: next });
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t.pluginEditor.paramsSection}</h3>
        <button
          className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
          onClick={addParam}
        >
          + {t.pluginEditor.addParam}
        </button>
      </div>
      <p className="text-[11px] text-slate-500 italic">{t.pluginEditor.paramsHint}</p>
      {draft.params.length === 0 ? (
        <div className="text-xs text-slate-500 italic px-2 py-3 border border-dashed border-slate-700 rounded text-center">
          {t.pluginEditor.noParams}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {draft.params.map((param, i) => (
            <div key={i} className="flex flex-col gap-1 bg-slate-800/40 rounded border border-slate-700">
              {/* Main param row */}
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <span className="text-[10px] text-slate-500 font-mono shrink-0">_</span>
                <input
                  type="text"
                  value={param.key}
                  onChange={(e) => updateParam(i, { key: e.target.value })}
                  placeholder={t.pluginEditor.paramKey}
                  className={`${inputCls} w-24 font-mono`}
                />
                <input
                  type="text"
                  value={param.label}
                  onChange={(e) => updateParam(i, { label: e.target.value })}
                  placeholder={t.pluginEditor.paramLabel}
                  className={`${inputCls} flex-1 min-w-0`}
                />
                <select
                  value={param.kind}
                  onChange={(e) => {
                    const kind = e.target.value as PluginParamKind;
                    updateParam(i, { kind, default: defaultForKind(kind), typeGroupId: undefined });
                  }}
                  className={`${inputCls} cursor-pointer`}
                >
                  {PARAM_KINDS.map((k) => (
                    <option key={k} value={k}>{t.pluginEditor[`kind_${k}` as keyof typeof t.pluginEditor] as string}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={param.default ?? ''}
                  onChange={(e) => updateParam(i, { default: e.target.value })}
                  placeholder={t.pluginEditor.paramDefault}
                  className={`${inputCls} w-24`}
                />
                <button
                  className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer px-1"
                  title={t.pluginEditor.moveUp}
                  onClick={() => moveParam(i, -1)}
                  disabled={i === 0}
                >▲</button>
                <button
                  className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer px-1"
                  title={t.pluginEditor.moveDown}
                  onClick={() => moveParam(i, 1)}
                  disabled={i === draft.params.length - 1}
                >▼</button>
                <button
                  className="text-xs text-red-400 hover:text-red-300 cursor-pointer px-1"
                  onClick={() => removeParam(i)}
                ><EmojiIcon name="close" size={20} /></button>
              </div>
              {/* Object-kind: pick the project variable group whose fields become navigable */}
              {param.kind === 'object' && (
                <div className="flex items-center gap-2 px-3 pb-1.5 border-t border-slate-700/60 pt-1">
                  <span className="text-[10px] text-slate-500 shrink-0">{t.pluginEditor.objectFields}</span>
                  <select
                    value={param.typeGroupId ?? ''}
                    onChange={(e) => updateParam(i, { typeGroupId: e.target.value || undefined })}
                    className={`${inputCls} flex-1 min-w-0 cursor-pointer`}
                  >
                    <option value="">— {t.pluginEditor.objectFieldsNone} —</option>
                    {allGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.path}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Blocks section — full scene-like block composer ─────────────────────────

function BlocksSection({ draft, patch }: { draft: PluginBlockDef; patch: (p: Partial<PluginBlockDef>) => void }) {
  const t = useT();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const paramKeys = useMemo(
    () => draft.params.map((p) => `_${p.key}`).filter((k) => k !== '_').join(', '),
    [draft.params],
  );

  const blockIds = useMemo(() => draft.blocks.map((b) => b.id), [draft.blocks]);
  const allCollapsed = blockIds.length > 0 && blockIds.every((id) => collapsed.has(id));
  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(blockIds));
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t.pluginEditor.blocksSection}</h3>
        {draft.blocks.length > 0 && (
          <button
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-slate-300 bg-slate-700/50 hover:bg-slate-700 hover:text-white border border-slate-600/60 hover:border-slate-500 transition-colors cursor-pointer"
            title={allCollapsed ? t.scene.expandAll : t.scene.collapseAll}
            onClick={toggleAll}
          >
            {allCollapsed ? (
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 15 5 5 5-5"/>
                <path d="m7 9 5-5 5 5"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 20 5-5 5 5"/>
                <path d="m7 4 5 5 5-5"/>
              </svg>
            )}
            <span>{allCollapsed ? t.scene.expandAll : t.scene.collapseAll}</span>
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 italic">
        {t.pluginEditor.blocksHint}
        {paramKeys && <span className="font-mono ml-1 text-slate-400">{paramKeys}</span>}
      </p>
      <PluginBodyEditor
        blocks={draft.blocks}
        params={draft.params}
        onChange={(blocks: Block[]) => patch({ blocks })}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      />
    </section>
  );
}
