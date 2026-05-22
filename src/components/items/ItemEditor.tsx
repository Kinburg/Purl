import { useState, useEffect, type ReactNode } from 'react';
import { useProjectStore, charToVarPrefix } from '../../store/projectStore';
import { toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { ImageAssetPicker, ImageMappingEditor } from '../shared/ImageMappingEditor';
import { VariablePicker } from '../shared/VariablePicker';
import { AvatarGenModal } from '../characters/AvatarGenModal';
import { TreeLevel } from '../variables/VariableManager';
import type { TreeActions } from '../variables/variableTreeShared';
import type {
  ItemDefinition, ItemCategory, ItemIconConfig, ItemIconMode,
  Variable, VariableGroup, VariableTreeNode, AvatarConfig, AssetTreeNode,
} from '../../types';
import { useT } from '../../i18n';
import { ModalShell, INPUT_CLS } from '../shared/ModalShell';
import { EmojiIcon, type EmojiIconName } from '../shared/EmojiIcons';

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════

function resolveEditorSrc(src: string, projectDir: string | null): string {
  if (!src) return '';
  if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('localfile://')) return src;
  if (projectDir) return toLocalFileUrl(resolveAssetPath(projectDir, src));
  return '';
}

function iconToAvatarConfig(iconCfg: ItemIconConfig): AvatarConfig {
  return {
    mode: iconCfg.mode === 'bound' ? 'bound' : 'static',
    src: iconCfg.src,
    variableId: iconCfg.variableId ?? '',
    mapping: iconCfg.mapping ?? [],
    defaultSrc: iconCfg.defaultSrc ?? '',
    genSettings: iconCfg.genSettings,
  };
}

function avatarConfigToIconCfg(avatar: AvatarConfig, mode: ItemIconMode): ItemIconConfig {
  return {
    mode,
    src: avatar.src,
    variableId: avatar.variableId ?? '',
    mapping: avatar.mapping ?? [],
    defaultSrc: avatar.defaultSrc ?? '',
    genSettings: avatar.genSettings,
  };
}

function findVarById(nodes: VariableTreeNode[], id: string): Variable | null {
  for (const n of nodes) {
    if (n.kind === 'variable' && n.id === id) return n;
    if (n.kind === 'group') {
      const found = findVarById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findGroupById(nodes: VariableTreeNode[], groupId: string): VariableGroup | null {
  for (const n of nodes) {
    if (n.kind === 'group' && n.id === groupId) return n;
    if (n.kind === 'group') {
      const found = findGroupById(n.children, groupId);
      if (found) return found;
    }
  }
  return null;
}

const SYSTEM_VAR_NAMES = new Set(['name', 'icon', 'price', 'description', 'stackable', 'slot']);

function getItemUserNodes(nodes: VariableTreeNode[], groupId: string): VariableTreeNode[] {
  const group = findGroupById(nodes, groupId);
  if (!group) return [];
  return group.children.filter(n => n.kind !== 'variable' || !SYSTEM_VAR_NAMES.has(n.name));
}

function localAddNode(nodes: VariableTreeNode[], parentId: string | null, node: VariableTreeNode): VariableTreeNode[] {
  if (parentId === null) return [...nodes, node];
  return nodes.map(n => {
    if (n.kind === 'group' && n.id === parentId) return { ...n, children: [...n.children, node] };
    if (n.kind === 'group') return { ...n, children: localAddNode(n.children, parentId, node) };
    return n;
  });
}

function localRemoveNode(nodes: VariableTreeNode[], id: string): VariableTreeNode[] {
  return nodes
    .filter(n => n.id !== id)
    .map(n => n.kind === 'group' ? { ...n, children: localRemoveNode(n.children, id) } : n);
}

function localUpdateVar(nodes: VariableTreeNode[], id: string, patch: Partial<Variable>): VariableTreeNode[] {
  return nodes.map(n => {
    if (n.kind === 'variable' && n.id === id) return { ...n, ...patch };
    if (n.kind === 'group') return { ...n, children: localUpdateVar(n.children, id, patch) };
    return n;
  });
}

const CATEGORY_ICONS: Record<ItemCategory, EmojiIconName> = {
  wearable:   'shirt',
  consumable: 'potion',
  misc:       'box',
};

// ═══════════════════════════════════════════════════════════════════════════
//  Props & main component
// ═══════════════════════════════════════════════════════════════════════════

type TabId = 'basics' | 'icon' | 'usage' | 'props';

interface Props {
  mode: 'create' | 'edit';
  itemId?: string;
  initial: Omit<ItemDefinition, 'id' | 'varIds'>;
  takenNames: string[];
  takenVarNames: string[];
  onSave: (data: Omit<ItemDefinition, 'id' | 'varIds'>) => void;
  onClose: () => void;
}

export function ItemEditor({ mode, itemId, initial, takenNames, takenVarNames, onSave, onClose }: Props) {
  const t = useT();
  const project            = useProjectStore(s => s.project);
  const projectDir         = useProjectStore(s => s.projectDir);
  const addVariable        = useProjectStore(s => s.addVariable);
  const addVariableGroup   = useProjectStore(s => s.addVariableGroup);
  const updateVariable     = useProjectStore(s => s.updateVariable);
  const deleteVariableNode = useProjectStore(s => s.deleteVariableNode);

  const liveItem = mode === 'edit' && itemId
    ? (project.items ?? []).find(i => i.id === itemId)
    : null;

  const [tab, setTab] = useState<TabId>('basics');
  const [name, setName]           = useState(initial.name);
  const [varName, setVarName]     = useState(initial.varName);
  const [varNameTouched, setVarNameTouched] = useState(mode === 'edit');
  const [description, setDescription] = useState(() => {
    if (liveItem?.varIds?.descVarId) {
      return findVarById(project.variableNodes, liveItem.varIds.descVarId)?.defaultValue ?? '';
    }
    return initial.description ?? '';
  });
  const [category, setCategory]   = useState<ItemCategory>(initial.category);
  const [stackable, setStackable] = useState(initial.stackable);
  const [targetSlot, setTargetSlot] = useState(initial.targetSlot ?? '');
  const [iconCfg, setIconCfg]     = useState<ItemIconConfig>(
    initial.iconConfig ?? { mode: 'static', src: '' },
  );
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [pendingNodes, setPendingNodes] = useState<VariableTreeNode[]>([]);

  const itemUserNodes = liveItem?.varIds
    ? getItemUserNodes(project.variableNodes, liveItem.varIds.groupId)
    : [];

  const useFuncSceneId = liveItem?.useFuncSceneId;
  const funcScene = useFuncSceneId ? project.scenes.find(s => s.id === useFuncSceneId) : undefined;

  const handleNameChange = (v: string) => {
    setName(v);
    if (!varNameTouched) setVarName(charToVarPrefix(v));
  };
  const handleVarNameChange = (v: string) => {
    setVarNameTouched(true);
    setVarName(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  };

  const trimmedName    = name.trim();
  const trimmedVarName = varName.trim().replace(/^[\d_]+/, '').replace(/_+$/g, '');

  const nameError = trimmedName === '' ? t.items.nameEmpty
    : takenNames.includes(trimmedName) ? t.items.nameTaken : null;
  const varNameError = trimmedVarName === '' ? t.items.varNameEmpty
    : !/^[a-z][a-z0-9_]*$/.test(trimmedVarName) ? t.items.varNameInvalid
    : takenVarNames.includes(trimmedVarName) ? t.items.varNameTaken : null;

  const handleSave = () => {
    if (nameError || varNameError) return;
    onSave({
      name: trimmedName,
      varName: trimmedVarName,
      description,
      category,
      stackable,
      targetSlot: category === 'wearable' ? targetSlot.trim() : undefined,
      iconConfig: iconCfg,
      customProps: (mode === 'edit' ? itemUserNodes : pendingNodes)
        .filter(n => n.kind === 'variable')
        .map(n => ({
          id: n.id,
          name: (n as Variable).name,
          varType: (n as Variable).varType as 'number' | 'string' | 'boolean',
          defaultValue: (n as Variable).defaultValue,
        })),
      ...(useFuncSceneId ? { useFuncSceneId } : {}),
    });
    onClose();
  };

  const editActions: TreeActions = {
    onAddVariable:    (parentId, data) => addVariable(parentId, data),
    onAddGroup:       (parentId, name) => addVariableGroup(parentId, name),
    onUpdateVariable: (id, patch)      => updateVariable(id, patch),
    onDeleteNode:     (id)             => deleteVariableNode(id),
  };
  const createActions: TreeActions = {
    onAddVariable: (parentId, data) => {
      const newVar: Variable = {
        kind: 'variable', id: crypto.randomUUID(),
        name: data.name, varType: data.varType,
        defaultValue: data.defaultValue, description: data.description,
      };
      setPendingNodes(prev => localAddNode(prev, parentId, newVar));
    },
    onAddGroup: (parentId, name) => {
      const newGroup: VariableGroup = { kind: 'group', id: crypto.randomUUID(), name, children: [] };
      setPendingNodes(prev => localAddNode(prev, parentId, newGroup));
    },
    onUpdateVariable: (id, patch) => setPendingNodes(prev => localUpdateVar(prev, id, patch)),
    onDeleteNode:     (id)        => setPendingNodes(prev => localRemoveNode(prev, id)),
  };

  const activeNodes = mode === 'edit' ? itemUserNodes : pendingNodes;
  const propCount = activeNodes.length || undefined;

  const tabs: { id: TabId; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'basics', label: t.items.tabBasics, icon: <IconSliders /> },
    { id: 'icon',   label: t.items.tabIcon,   icon: <IconImage /> },
    { id: 'usage',  label: t.items.tabUsage,  icon: <IconBolt /> },
    { id: 'props',  label: t.items.tabProps,  icon: <IconVar />, badge: propCount },
  ];

  const iconPreviewRaw = iconCfg.mode === 'bound'
    ? (iconCfg.defaultSrc || iconCfg.mapping?.[0]?.src || '')
    : iconCfg.src;
  const iconPreviewSrc = resolveEditorSrc(iconPreviewRaw, projectDir);

  return (
    <ModalShell onClose={onClose} width={1060} height={600}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-700 shrink-0">
        <div className="w-9 h-9 rounded-lg border border-slate-600 bg-slate-700/80 flex items-center justify-center shrink-0 overflow-hidden text-xl">
          {iconPreviewSrc
            ? <img src={iconPreviewSrc} className="w-full h-full object-cover" alt="" />
            : <span className="inline-flex"><EmojiIcon name={CATEGORY_ICONS[category]} size={16} /></span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-100 leading-tight truncate">
            {mode === 'create' ? t.items.createTitle : t.items.editTitle}
            {trimmedName && <span className="text-slate-400 font-normal ml-2">— {trimmedName}</span>}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t.items.modalSubtitle}</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 transition-colors p-1 -m-1 cursor-pointer"
          aria-label="Close"
        >
          <IconX />
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-52 shrink-0 border-r border-slate-700 py-3 flex flex-col gap-0.5">
          {tabs.map(item => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors cursor-pointer border-l-2 ${
                  active
                    ? 'bg-indigo-600/10 border-indigo-500 text-indigo-200'
                    : 'border-transparent text-slate-300 hover:bg-slate-700/40 hover:text-slate-100'
                }`}
              >
                <span className={active ? 'text-indigo-300' : 'text-slate-400'}>{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-700/60 rounded px-1">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {tab === 'basics' && (
            <BasicsTab
              name={name} varName={varName} description={description}
              nameError={nameError} varNameError={varNameError}
              mode={mode} category={category} stackable={stackable} targetSlot={targetSlot}
              trimmedVarName={trimmedVarName}
              onNameChange={handleNameChange} onVarNameChange={handleVarNameChange}
              onDescriptionChange={setDescription}
              onCategoryChange={setCategory} onStackableChange={setStackable}
              onTargetSlotChange={setTargetSlot}
              onEnterSave={handleSave}
            />
          )}
          {tab === 'icon' && (
            <IconTab
              iconCfg={iconCfg} onChange={setIconCfg}
              itemOwnNodes={activeNodes}
              assetNodes={project.assetNodes}
              onGenerate={() => setGenModalOpen(true)}
            />
          )}
          {tab === 'usage' && (
            <UsageTab
              mode={mode} category={category}
              funcScene={funcScene}
              trimmedVarName={trimmedVarName}
            />
          )}
          {tab === 'props' && (
            <PropsTab
              nodes={activeNodes}
              actions={mode === 'edit' ? editActions : createActions}
              parentId={mode === 'edit' ? (liveItem?.varIds?.groupId ?? null) : null}
            />
          )}
        </div>

        {/* Preview */}
        <aside className="w-72 shrink-0 border-l border-slate-700 p-5 flex flex-col gap-4 bg-slate-900/30 overflow-y-auto">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            {t.items.previewLabel}
          </h3>
          <ItemPreview
            name={trimmedName || name}
            varName={trimmedVarName || varName}
            description={description}
            category={category}
            targetSlot={targetSlot}
            stackable={stackable}
            iconPreviewSrc={iconPreviewSrc}
            customNodes={activeNodes}
          />
        </aside>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-700 shrink-0">
        <div className="text-[11px] text-red-400 min-w-0 truncate">
          {nameError || varNameError || ''}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-700/60 cursor-pointer transition-colors"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={!!nameError || !!varNameError}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium cursor-pointer transition-colors"
          >
            {t.items.save}
          </button>
        </div>
      </div>

      {/* Gen modal */}
      {genModalOpen && (
        <AvatarGenModal
          cfg={iconToAvatarConfig(iconCfg)}
          charVarName={trimmedVarName || 'item'}
          charName={name}
          charLlmDescr={description}
          assetSubfolder="items"
          modalTitle={iconCfg.mode === 'bound' ? `${name} — ${t.items.iconGenerated}` : t.items.iconGenerated}
          slotLabelStatic={t.items.fieldIcon}
          slotLabelDefault={t.items.fieldIcon}
          entityKind="item"
          onSave={avatar => setIconCfg(avatarConfigToIconCfg(avatar, iconCfg.mode === 'bound' ? 'bound' : 'generated'))}
          onClose={() => setGenModalOpen(false)}
        />
      )}
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Preview panel
// ═══════════════════════════════════════════════════════════════════════════

function ItemPreview({
  name, varName, description, category, targetSlot, stackable, iconPreviewSrc, customNodes,
}: {
  name: string;
  varName: string;
  description: string;
  category: ItemCategory;
  targetSlot: string;
  stackable: boolean;
  iconPreviewSrc: string;
  customNodes: VariableTreeNode[];
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [iconPreviewSrc]);
  const showImg = Boolean(iconPreviewSrc) && !imgFailed;

  const tags: string[] = [category];
  if (category === 'wearable' && targetSlot) tags.push(targetSlot);
  if (stackable) tags.push('stackable');

  const propVars = customNodes.filter(n => n.kind === 'variable') as Variable[];

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 flex flex-col gap-3">
      {/* Icon */}
      <div className="w-full aspect-square rounded-lg border border-slate-600 bg-slate-700/60 flex items-center justify-center overflow-hidden max-h-40">
        {showImg
          ? <img src={iconPreviewSrc} className="w-full h-full object-contain" alt="" onError={() => setImgFailed(true)} />
          : <span className="inline-flex"><EmojiIcon name={CATEGORY_ICONS[category]} size={56} /></span>
        }
      </div>

      {/* Name */}
      <div>
        <p className="text-sm font-semibold text-slate-100 leading-tight">
          {name || <span className="text-slate-600 italic">—</span>}
        </p>
        {varName && (
          <p className="text-[11px] font-mono text-slate-500 mt-0.5">$items.{varName}</p>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map(tag => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 bg-slate-700/50 text-slate-400 font-mono"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="text-xs text-slate-400 leading-snug line-clamp-3">{description}</p>
      )}

      {/* Custom props */}
      {propVars.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-slate-700/60 pt-2">
          {propVars.slice(0, 5).map(v => (
            <div key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-500 font-mono">{v.name}</span>
              <span className="text-slate-300">{v.defaultValue || '—'}</span>
            </div>
          ))}
          {propVars.length > 5 && (
            <p className="text-[10px] text-slate-600 italic">+{propVars.length - 5} more…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  BASICS TAB
// ═══════════════════════════════════════════════════════════════════════════

function BasicsTab({
  name, varName, description, nameError, varNameError,
  mode, category, stackable, targetSlot, trimmedVarName,
  onNameChange, onVarNameChange, onDescriptionChange,
  onCategoryChange, onStackableChange, onTargetSlotChange,
  onEnterSave,
}: {
  name: string; varName: string; description: string;
  nameError: string | null; varNameError: string | null;
  mode: 'create' | 'edit'; category: ItemCategory;
  stackable: boolean; targetSlot: string; trimmedVarName: string;
  onNameChange: (v: string) => void;
  onVarNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onCategoryChange: (v: ItemCategory) => void;
  onStackableChange: (v: boolean) => void;
  onTargetSlotChange: (v: string) => void;
  onEnterSave: () => void;
}) {
  const t = useT();

  const CATEGORY_DEFS: { id: ItemCategory; iconName: EmojiIconName; label: string; subtitle: string }[] = [
    { id: 'wearable',   iconName: 'shirt',  label: t.items.categoryWearable,   subtitle: t.items.categoryWearableSubtitle },
    { id: 'consumable', iconName: 'potion', label: t.items.categoryConsumable, subtitle: t.items.categoryConsumableSubtitle },
    { id: 'misc',       iconName: 'box',    label: t.items.categoryMisc,       subtitle: t.items.categoryMiscSubtitle },
  ];

  return (
    <>
      <Section title={t.items.sectionIdentity}>
        <TwoCol>
          <Field label={t.items.fieldName} error={nameError}>
            <input
              autoFocus
              className={`${INPUT_CLS} ${nameError ? '!border-red-500' : ''}`}
              value={name}
              onChange={e => onNameChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEnterSave(); }}
            />
          </Field>
          <Field
            label={t.items.fieldVarName}
            hint={mode !== 'edit' && !varNameError ? `$items.${trimmedVarName || '…'}.name` : undefined}
            error={mode !== 'edit' ? varNameError : null}
          >
            <input
              className={`${INPUT_CLS} font-mono ${
                mode === 'edit' ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : ''
              } ${varNameError && mode !== 'edit' ? '!border-red-500' : ''}`}
              value={varName}
              readOnly={mode === 'edit'}
              onChange={e => onVarNameChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEnterSave(); }}
              placeholder="sword, potion_hp..."
            />
          </Field>
        </TwoCol>

        <Field label={t.items.fieldDescription}>
          <textarea
            className={`${INPUT_CLS} resize-none`}
            rows={3}
            placeholder={t.items.descriptionPlaceholder}
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
          />
        </Field>
      </Section>

      <Section title={t.items.sectionCategory}>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORY_DEFS.map(cat => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors cursor-pointer text-center ${
                  active
                    ? 'bg-indigo-600/15 border-indigo-500 text-indigo-100'
                    : 'bg-slate-700/30 border-slate-600 text-slate-300 hover:border-slate-500 hover:bg-slate-700/50'
                }`}
              >
                <span className="inline-flex"><EmojiIcon name={cat.iconName} size={28} /></span>
                <span className="text-xs font-medium leading-tight">{cat.label}</span>
                <span className={`text-[10px] leading-tight ${active ? 'text-indigo-300' : 'text-slate-500'}`}>
                  {cat.subtitle}
                </span>
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none mt-1">
          <button
            type="button"
            onClick={() => onStackableChange(!stackable)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
              stackable ? 'bg-indigo-600' : 'bg-slate-600'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              stackable ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
          <div className="flex flex-col">
            <span className="text-xs text-slate-300">{t.items.stackableLabel}</span>
            <span className="text-[10px] text-slate-500">{t.items.stackableHint}</span>
          </div>
        </label>
      </Section>

      {category === 'wearable' && (
        <Section title={t.items.sectionSlot}>
          <Field label={t.items.fieldTargetSlot} hint={t.items.targetSlotHint}>
            <input
              className={`${INPUT_CLS} font-mono`}
              value={targetSlot}
              onChange={e => onTargetSlotChange(e.target.value)}
              placeholder="head, chest, rightHand..."
            />
          </Field>
        </Section>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ICON TAB
// ═══════════════════════════════════════════════════════════════════════════

function IconTab({
  iconCfg, onChange, itemOwnNodes, assetNodes, onGenerate,
}: {
  iconCfg: ItemIconConfig;
  onChange: (cfg: ItemIconConfig) => void;
  itemOwnNodes: VariableTreeNode[];
  assetNodes: AssetTreeNode[];
  onGenerate: () => void;
}) {
  const t = useT();

  return (
    <>
      <Section title={t.items.fieldIcon}>
        <p className="text-xs text-slate-500">{t.items.modalSubtitle && ''}</p>
        <div className="flex gap-2 flex-wrap">
          <ModeBtn active={iconCfg.mode === 'static'} onClick={() => onChange({ ...iconCfg, mode: 'static' })}>
            {t.items.iconStatic}
          </ModeBtn>
          <ModeBtn active={iconCfg.mode === 'bound'} onClick={() => onChange({ ...iconCfg, mode: 'bound' })}>
            {t.items.iconBound}
          </ModeBtn>
          <button
            onClick={onGenerate}
            className="text-xs px-3 py-1.5 rounded border transition-colors cursor-pointer bg-slate-700 border-slate-600 text-slate-300 hover:border-indigo-500 hover:text-indigo-200 flex items-center gap-1.5"
          >
            <IconSparkle /> {t.items.iconGenerated}
          </button>
        </div>
      </Section>

      {iconCfg.mode === 'static' && (
        <Section title="File">
          <ImageAssetPicker
            assetNodes={assetNodes}
            value={iconCfg.src}
            onChange={src => onChange({ ...iconCfg, src })}
          />
        </Section>
      )}

      {iconCfg.mode === 'generated' && iconCfg.src && (
        <Section title="File">
          <div className="flex gap-2 items-center">
            <span className="text-[11px] text-slate-400 font-mono truncate flex-1">{iconCfg.src}</span>
            <button
              className="text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer shrink-0"
              onClick={onGenerate}
            >
              {t.items.iconGenerated}
            </button>
          </div>
        </Section>
      )}

      {iconCfg.mode === 'bound' && (
        <>
          <Section title="Variable">
            {itemOwnNodes.length === 0 ? (
              <p className="text-xs text-slate-500 italic">{t.items.customVarsEmpty}</p>
            ) : (
              <VariablePicker
                value={iconCfg.variableId ?? ''}
                onChange={id => onChange({ ...iconCfg, variableId: id })}
                nodes={itemOwnNodes}
                placeholder={t.items.iconBoundSelectVar}
              />
            )}
          </Section>
          <Section title="Value → image mapping">
            <ImageMappingEditor
              mapping={iconCfg.mapping ?? []}
              onChange={mapping => onChange({ ...iconCfg, mapping })}
              defaultSrc={iconCfg.defaultSrc ?? ''}
              onDefaultSrcChange={defaultSrc => onChange({ ...iconCfg, defaultSrc })}
              assetNodes={assetNodes}
              hideDefault
            />
          </Section>
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  USAGE TAB
// ═══════════════════════════════════════════════════════════════════════════

function UsageTab({
  mode, category, funcScene, trimmedVarName,
}: {
  mode: 'create' | 'edit';
  category: ItemCategory;
  funcScene?: { id: string; name: string };
  trimmedVarName: string;
}) {
  const t = useT();

  return (
    <Section title={t.items.usageSection}>
      <p className="text-xs text-slate-500">{t.items.usageSectionDesc}</p>

      {category !== 'consumable' ? (
        <div className="rounded border border-slate-700 bg-slate-800/40 px-4 py-3">
          <p className="text-xs text-slate-500 italic">{t.items.usageNotApplicable}</p>
        </div>
      ) : funcScene ? (
        <div className="rounded border border-slate-700 bg-slate-800/40 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Function scene:</p>
            <code className="text-sm text-indigo-300 font-mono">{funcScene.name}</code>
          </div>
        </div>
      ) : (
        <div className="rounded border border-slate-700 border-dashed bg-slate-800/20 px-4 py-3">
          <p className="text-xs text-slate-500">
            {t.items.usageFuncCreatedOnSave}{' '}
            {mode === 'create' && trimmedVarName && (
              <code className="font-mono text-indigo-400">tg_use_{trimmedVarName}</code>
            )}
          </p>
        </div>
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROPS TAB
// ═══════════════════════════════════════════════════════════════════════════

function PropsTab({
  nodes, actions, parentId,
}: {
  nodes: VariableTreeNode[];
  actions: TreeActions;
  parentId: string | null;
}) {
  const t = useT();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingVarId, setEditingVarId] = useState<string | null>(null);

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => { const s = new Set(prev); if (s.has(id)) { s.delete(id); } else { s.add(id); } return s; });

  return (
    <Section title={t.items.customVarsSection}>
      {nodes.length === 0 && (
        <p className="text-xs text-slate-500 italic">{t.items.customVarsEmpty}</p>
      )}
      <TreeLevel
        nodes={nodes}
        depth={0}
        expandedIds={expandedIds}
        editingVarId={editingVarId}
        onToggleExpand={toggleExpand}
        onEditVar={setEditingVarId}
        parentId={parentId}
        allNodes={nodes}
        pathPrefix=""
        actions={actions}
        showAddAtRoot
      />
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Primitives
// ═══════════════════════════════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function TwoCol({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label, children, hint, error,
}: {
  label: string; children: ReactNode; hint?: string; error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{label}</label>
      {children}
      {error
        ? <span className="text-[10px] text-red-400">{error}</span>
        : hint ? <span className="text-[10px] text-slate-500">{hint}</span> : null
      }
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded border transition-colors cursor-pointer ${
        active
          ? 'bg-indigo-600 border-indigo-500 text-white'
          : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-400 hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Icons
// ═══════════════════════════════════════════════════════════════════════════

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconSliders = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
    <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="2" fill="currentColor" stroke="none" />
  </svg>
);
const IconImage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="M21 15l-5-5-10 10" />
  </svg>
);
const IconBolt = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);
const IconVar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4c-2 4-2 12 0 16M17 4c2 4 2 12 0 16" /><path d="M9 12h6" />
  </svg>
);
const IconSparkle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM19 14l.9 2.7 2.6.9-2.6.9-.9 2.5-.9-2.5-2.6-.9 2.6-.9.9-2.7z" />
  </svg>
);
