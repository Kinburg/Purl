import { useState, useEffect, type ReactNode } from 'react';
import { useProjectStore, charToVarPrefix, pregenCharVarIds } from '../../store/projectStore';
import { toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { VariablePicker } from '../shared/VariablePicker';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import { DIALOGUE_FIELD_SCHEMA, DIALOGUE_RAW_CSS_HELP } from '../../utils/styleCascade';
import { TreeLevel } from '../variables/VariableManager';
import type { TreeActions } from '../variables/variableTreeShared';
import type {
  Character, AvatarConfig, Variable, AssetTreeNode, VariableTreeNode,
  VariableGroup, CharacterVarIds, CharacterInventorySlot, ItemDefinition,
  PaperdollConfig, PaperdollSlot, SlotPlaceholderConfig,
  BlockStyleOverride,
} from '../../types';
import { buildDialogueLivePreviewCss } from '../../utils/styleCascade';
import { useT } from '../../i18n';
import { AvatarGenModal } from './AvatarGenModal';
import { ImageMappingEditor, ImageAssetPicker } from '../shared/ImageMappingEditor';
import {
  ModalShell, Toggle, INPUT_CLS,
} from '../shared/ModalShell';
import { EmojiIcon } from '../shared/EmojiIcons';

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════

function resolveEditorSrc(src: string, projectDir: string | null): string {
  if (!src) return '';
  if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('localfile://')) return src;
  if (projectDir) return toLocalFileUrl(resolveAssetPath(projectDir, src));
  return '';
}

function defaultAvatarConfig(): AvatarConfig {
  return { mode: 'static', src: '', variableId: '', mapping: [], defaultSrc: '' };
}

function emptyPaperdoll(): PaperdollConfig {
  return { gridCols: 3, gridRows: 4, cellSize: 64, slots: [] };
}

function placeholderToAvatarConfig(ph: SlotPlaceholderConfig): AvatarConfig {
  return { mode: ph.mode, src: ph.src, variableId: ph.variableId, mapping: ph.mapping, defaultSrc: ph.defaultSrc, genSettings: ph.genSettings };
}

function avatarConfigToPlaceholder(cfg: AvatarConfig, ph: SlotPlaceholderConfig): SlotPlaceholderConfig {
  return { ...ph, mode: cfg.mode as 'static' | 'bound', src: cfg.src, variableId: cfg.variableId, mapping: cfg.mapping, defaultSrc: cfg.defaultSrc, genSettings: cfg.genSettings };
}

function findGroup(nodes: VariableTreeNode[], id: string): VariableGroup | null {
  for (const n of nodes) {
    if (n.kind === 'group' && n.id === id) return n;
    if (n.kind === 'group') {
      const found = findGroup(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getCharUserNodes(nodes: VariableTreeNode[], groupId: string, nameVarId: string, stylesGroupId: string): VariableTreeNode[] {
  const group = findGroup(nodes, groupId);
  if (!group) return [];
  return group.children.filter(n => n.id !== nameVarId && n.id !== stylesGroupId);
}

function buildSyntheticCharGroup(
  varName: string,
  ids: CharacterVarIds,
  pendingNodes: VariableTreeNode[],
): VariableGroup {
  return {
    kind: 'group', id: ids.groupId,
    name: varName || 'char',
    children: [
      { kind: 'variable', id: ids.nameVarId, name: 'name', varType: 'string', defaultValue: '', description: '' },
      {
        kind: 'group', id: ids.stylesGroupId, name: 'styles',
        children: [
          { kind: 'variable', id: ids.bgColorVarId, name: 'bgColor', varType: 'string', defaultValue: '', description: '' },
          { kind: 'variable', id: ids.borderColorVarId, name: 'borderColor', varType: 'string', defaultValue: '', description: '' },
          { kind: 'variable', id: ids.nameColorVarId, name: 'nameColor', varType: 'string', defaultValue: '', description: '' },
          { kind: 'variable', id: ids.textColorVarId!, name: 'textColor', varType: 'string', defaultValue: '', description: '' },
          { kind: 'variable', id: ids.avatarVarId, name: 'avatar', varType: 'string', defaultValue: '', description: '' },
          { kind: 'variable', id: ids.llmDescrVarId!, name: 'llm_descr', varType: 'string', defaultValue: '', description: '' },
          { kind: 'variable', id: ids.llmTemperatureVarId!, name: 'llm_temperature', varType: 'number', defaultValue: '', description: '' },
        ],
      },
      ...pendingNodes,
    ],
  };
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

// emoji prefixes inside <option> can't be replaced with inline SVG (browsers
// strip non-text from option content), so the category icon column was
// dropped during the SVG migration. Kept as a comment for future redesign.

// ═══════════════════════════════════════════════════════════════════════════
//  Main CharacterModal
// ═══════════════════════════════════════════════════════════════════════════

type TabId = 'basics' | 'avatar' | 'inventory' | 'variables';

interface Props {
  mode: 'create' | 'edit';
  charId?: string;
  initial: Omit<Character, 'id'>;
  takenNames: string[];
  takenVarNames: string[];
  onSave: (data: Omit<Character, 'id'>, pendingNodes: VariableTreeNode[], pregenVarIds: CharacterVarIds | null) => void;
  onClose: () => void;
}

export function CharacterModal({ mode, charId, initial, takenNames, takenVarNames, onSave, onClose }: Props) {
  const t = useT();
  const {
    project,
    addVariable, addVariableGroup, updateVariable, deleteVariableNode,
    addPaperdollSlot, updatePaperdollSlot, deletePaperdollSlot, setPaperdollConfig,
  } = useProjectStore();
  const assetNodes = project.assetNodes;

  // ─── State ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<TabId>('basics');

  const [name, setName] = useState(initial.name);
  const initialVarName = (() => {
    if (initial.varName) return initial.varName;
    if (mode === 'edit' && (initial as Character).varIds?.groupId) {
      const grp = findGroup(project.variableNodes, (initial as Character).varIds!.groupId);
      if (grp) return grp.name;
    }
    return charToVarPrefix(initial.name);
  })();
  const [varName, setVarName] = useState(initialVarName);
  const [varNameTouched, setVarNameTouched] = useState(mode === 'edit');
  const [nameColor, setNameColor]     = useState(initial.nameColor);
  const [textColor, setTextColor]     = useState(initial.textColor ?? '#e2e8f0');
  const [bgColor, setBgColor]         = useState(initial.bgColor);
  const [borderColor, setBorderColor] = useState(initial.borderColor);
  const [avatarCfg, setAvatarCfg]     = useState<AvatarConfig>(initial.avatarConfig ?? defaultAvatarConfig());
  const [llmDescr, setLlmDescr]       = useState(initial.llm_descr ?? '');
  const [llmTemperature, setLlmTemperature] = useState<string>(
    initial.llm_temperature !== undefined ? String(initial.llm_temperature) : ''
  );
  const [initialInventory, setInitialInventory] = useState<CharacterInventorySlot[]>(initial.initialInventory ?? []);
  const [localPaperdoll, setLocalPaperdoll] = useState<PaperdollConfig | undefined>(initial.paperdoll);
  const [isHero, setIsHero] = useState(initial.isHero ?? false);
  const [customDialogueStyle, setCustomDialogueStyle] = useState<BlockStyleOverride | undefined>(
    initial.customDialogueStyle,
  );

  const handleNameChange = (v: string) => {
    setName(v);
    if (!varNameTouched) setVarName(charToVarPrefix(v));
  };
  const handleVarNameChange = (v: string) => {
    setVarNameTouched(true);
    setVarName(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  };

  // ─── Derived ────────────────────────────────────────────────────────────
  const liveChar = mode === 'edit' && charId
    ? project.characters.find(c => c.id === charId)
    : null;
  const charUserNodes = liveChar?.varIds
    ? getCharUserNodes(project.variableNodes, liveChar.varIds.groupId, liveChar.varIds.nameVarId, liveChar.varIds.stylesGroupId)
    : [];
  const [pendingNodes, setPendingNodes] = useState<VariableTreeNode[]>([]);
  const [pregenVarIds] = useState<CharacterVarIds | null>(() => mode === 'create' ? pregenCharVarIds() : null);

  const parsedTemp = llmTemperature !== '' ? parseFloat(llmTemperature) : undefined;
  const draft: Omit<Character, 'id'> = {
    name, varName, nameColor, textColor, bgColor, borderColor,
    avatarConfig: avatarCfg, llm_descr: llmDescr, llm_temperature: parsedTemp,
    initialInventory, isHero,
    customDialogueStyle,
    ...(mode === 'create' ? { paperdoll: localPaperdoll } : {}),
  };

  const trimmedName    = name.trim();
  const trimmedVarName = varName.trim().replace(/^[\d_]+/, '').replace(/_+$/g, '');
  const nameError    = trimmedName === '' ? t.characters.nameEmpty
    : takenNames.includes(trimmedName) ? t.characters.nameTaken : null;
  const varNameError = trimmedVarName === '' ? t.characters.varNameEmpty
    : !/^[a-z][a-z0-9_]*$/.test(trimmedVarName) ? t.characters.varNameInvalid
    : takenVarNames.includes(trimmedVarName) ? t.characters.varNameTaken : null;

  const selfVarNodes: VariableTreeNode[] = (mode === 'create' && pregenVarIds)
    ? [buildSyntheticCharGroup(trimmedVarName || varName, pregenVarIds, pendingNodes)]
    : [];
  const avatarPickerNodes: VariableTreeNode[] = mode === 'create'
    ? selfVarNodes
    : (() => { const g = findGroup(project.variableNodes, liveChar?.varIds?.groupId ?? ''); return g ? [g] : project.variableNodes; })();

  const handleSave = () => {
    if (nameError || varNameError) return;
    onSave({ ...draft, name: trimmedName, varName: trimmedVarName }, pendingNodes, pregenVarIds);
    onClose();
  };

  // Tree actions
  const editActions: TreeActions = {
    onAddVariable: (parentId, data) => addVariable(parentId, data),
    onAddGroup: (parentId, name) => addVariableGroup(parentId, name),
    onUpdateVariable: (id, patch) => updateVariable(id, patch),
    onDeleteNode: (id) => deleteVariableNode(id),
  };
  const createActions: TreeActions = {
    onAddVariable: (parentId, data) => {
      const newVar: Variable = { kind: 'variable', id: crypto.randomUUID(), name: data.name, varType: data.varType, defaultValue: data.defaultValue, description: data.description };
      const effectiveParentId = parentId === pregenVarIds?.groupId ? null : parentId;
      setPendingNodes(prev => localAddNode(prev, effectiveParentId, newVar));
    },
    onAddGroup: (parentId, name) => {
      const newGroup: VariableGroup = { kind: 'group', id: crypto.randomUUID(), name, children: [] };
      const effectiveParentId = parentId === pregenVarIds?.groupId ? null : parentId;
      setPendingNodes(prev => localAddNode(prev, effectiveParentId, newGroup));
    },
    onUpdateVariable: (id, patch) => setPendingNodes(prev => localUpdateVar(prev, id, patch)),
    onDeleteNode:     (id)        => setPendingNodes(prev => localRemoveNode(prev, id)),
  };

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: 'basics',    label: (t.characters as any).tabBasics    ?? 'Basics',              icon: <IconUser /> },
    { id: 'avatar',    label: (t.characters as any).tabAvatar    ?? 'Avatar',              icon: <IconImage /> },
    { id: 'inventory', label: (t.characters as any).tabInventory ?? 'Inventory & Paperdoll', icon: <IconBag /> },
    { id: 'variables', label: (t.characters as any).tabVariables ?? 'Variables',           icon: <IconVar /> },
  ];

  return (
    <ModalShell onClose={onClose} width={1060}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-700">
        <div
          className="w-9 h-9 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0"
          style={{
            background: bgColor,
            borderColor: borderColor,
            color: nameColor,
          }}
        >
          {(trimmedName || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-100 leading-tight truncate">
            {mode === 'create' ? t.characters.createTitle : t.characters.editTitle}
            {trimmedName && <span className="text-slate-400 font-normal ml-2">— {trimmedName}</span>}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {(t.characters as any).modalSubtitle ?? 'Identity, appearance, inventory and variables'}
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors p-1 -m-1 cursor-pointer" aria-label="Close">
          <IconX />
        </button>
      </div>

      {/* ── Body: sidebar + content + preview ──────────────────────────── */}
      <div className="flex min-h-0 flex-1">
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
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {tab === 'basics' && (
            <BasicsTab
              name={name} varName={varName}
              nameError={nameError} varNameError={varNameError}
              mode={mode} isHero={isHero} llmDescr={llmDescr} llmTemperature={llmTemperature}
              nameColor={nameColor} textColor={textColor} bgColor={bgColor} borderColor={borderColor}
              onNameChange={handleNameChange} onVarNameChange={handleVarNameChange}
              onIsHeroChange={setIsHero} onLlmDescrChange={setLlmDescr} onLlmTemperatureChange={setLlmTemperature}
              onNameColorChange={setNameColor} onTextColorChange={setTextColor}
              onBgColorChange={setBgColor} onBorderColorChange={setBorderColor}
              onEnterSave={handleSave}
              customDialogueStyle={customDialogueStyle}
              onCustomDialogueStyleChange={setCustomDialogueStyle}
              variableNodes={mode === 'create' ? selfVarNodes : project.variableNodes}
            />
          )}
          {tab === 'avatar' && (
            <AvatarTab
              cfg={avatarCfg} onChange={setAvatarCfg}
              assetNodes={assetNodes} charNodes={avatarPickerNodes}
              charVarName={varName} charName={name} charLlmDescr={llmDescr}
            />
          )}
          {tab === 'inventory' && (
            <InventoryPaperdollTab
              initialInventory={initialInventory} setInitialInventory={setInitialInventory}
              items={project.items ?? []}
              mode={mode} charId={charId}
              liveChar={liveChar ?? undefined}
              localPaperdoll={localPaperdoll} setLocalPaperdoll={setLocalPaperdoll}
              addPaperdollSlot={addPaperdollSlot} updatePaperdollSlot={updatePaperdollSlot}
              deletePaperdollSlot={deletePaperdollSlot} setPaperdollConfig={setPaperdollConfig}
              charNodes={avatarPickerNodes} charName={name} charLlmDescr={llmDescr} charVarName={varName}
            />
          )}
          {tab === 'variables' && (
            <VariablesTab
              nodes={mode === 'edit' ? charUserNodes : pendingNodes}
              actions={mode === 'edit' ? editActions : createActions}
              parentId={mode === 'edit' ? (liveChar?.varIds?.groupId ?? null) : (pregenVarIds?.groupId ?? null)}
            />
          )}
        </div>

        {/* Sticky preview */}
        <aside className="w-72 shrink-0 border-l border-slate-700 p-5 flex flex-col gap-4 bg-slate-900/30 overflow-y-auto">
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
              {(t.characters as any).previewLabel ?? 'Preview'}
            </h3>
            <CharacterPreview char={draft} avatarCfg={avatarCfg} charId={charId} />
          </div>
          <PreviewMeta
            varName={trimmedVarName} isHero={isHero}
            nameColor={nameColor} textColor={textColor} bgColor={bgColor} borderColor={borderColor}
            charId={charId}
          />
        </aside>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-700">
        <div className="text-[11px] text-red-400 min-w-0 truncate">
          {nameError || varNameError || ''}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-700/60 cursor-pointer transition-colors"
          >
            {(t.common as any).cancel ?? 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={!!nameError || !!varNameError}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium cursor-pointer transition-colors"
          >
            {t.characters.save}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Preview (sticky right panel)
// ═══════════════════════════════════════════════════════════════════════════

/** Stable scope class used only inside the modal preview — never appears in the export. */
const MODAL_PREVIEW_SCOPE = 'purl-modal-dlg-preview';

function CharacterPreview({ char, avatarCfg, charId: _charId }: { char: Omit<Character, 'id'>; avatarCfg: AvatarConfig; charId?: string }) {
  const t = useT();
  const { projectDir } = useProjectStore();

  // Avatar cycling (unchanged)
  const boundSrcs = avatarCfg.mode === 'bound'
    ? [...avatarCfg.mapping.map(m => m.src), avatarCfg.defaultSrc].filter(Boolean)
    : [];
  const [cycleIdx, setCycleIdx] = useState(0);
  useEffect(() => { setCycleIdx(0); }, [avatarCfg.mode, avatarCfg.variableId]);
  useEffect(() => {
    if (avatarCfg.mode !== 'bound' || boundSrcs.length <= 1) return;
    const id = setInterval(() => setCycleIdx(i => (i + 1) % boundSrcs.length), 2000);
    return () => clearInterval(id);
  });

  let rawSrc = '';
  if (avatarCfg.mode === 'static' && avatarCfg.src) rawSrc = avatarCfg.src;
  else if (avatarCfg.mode === 'bound' && boundSrcs.length > 0) rawSrc = boundSrcs[cycleIdx % boundSrcs.length];
  const avatarSrc = resolveEditorSrc(rawSrc, projectDir);

  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [avatarSrc]);
  const showAvatar = Boolean(avatarSrc) && !imgFailed;

  // ── Style cascade preview (std + common custom incl. raw CSS) ──────────
  // Generate scoped CSS using the same emitter as the export → preview matches
  // story.css exactly, including any rawCss the user typed.
  const cs = char.customDialogueStyle;
  const isBoundStyle = !!cs?.enabled && (cs?.mode ?? 'static') === 'bound';

  // For bound mode, build the list of variant labels + their `variantIdx`
  // (0..N-1 for mapping entries, -1 for default fallback).
  const variantList = isBoundStyle ? [
    ...(cs!.mapping ?? []).map((m, idx) => ({
      label: m.matchType === 'range'
        ? `${m.rangeMin ?? '?'}…${m.rangeMax ?? '?'}`
        : `= ${m.value ?? '?'}`,
      idx,
    })),
    { label: t.styleOverride.variantDefault, idx: -1 },
  ] : [];

  const [styleCycleIdx, setStyleCycleIdx] = useState(0);
  useEffect(() => { setStyleCycleIdx(0); }, [isBoundStyle, cs?.variableId, cs?.mapping?.length]);
  useEffect(() => {
    if (!isBoundStyle || variantList.length <= 1) return;
    const id = setInterval(() => setStyleCycleIdx(i => (i + 1) % variantList.length), 2000);
    return () => clearInterval(id);
  });

  // Compute the synthetic Character for CSS generation — we don't have an `id`
  // in create mode, but `buildDialogueLivePreviewCss` uses only the cascade
  // fields, not the id.
  const previewChar = { ...char, id: 'preview' } as Character;
  const variantIdxForCss = isBoundStyle && variantList.length > 0
    ? variantList[styleCycleIdx % variantList.length].idx
    : undefined;
  const previewCss = buildDialogueLivePreviewCss(MODAL_PREVIEW_SCOPE, previewChar, variantIdxForCss);

  // Fallback fields for the big avatar square (which is rendered outside the
  // dialogue scope — avatar bg/border don't pick up scoped CSS rules).
  const stdAvatarBg     = char.bgColor;
  const stdAvatarBorder = char.borderColor;
  const stdAvatarName   = char.nameColor;
  const avatarFields = { bg: stdAvatarBg, border: stdAvatarBorder, name: stdAvatarName };
  if (cs?.enabled) {
    let src: Record<string, string | number | boolean> | undefined;
    if ((cs.mode ?? 'static') === 'static') {
      src = cs.fields;
    } else if (variantIdxForCss === -1) {
      src = cs.defaultFields;
    } else if (variantIdxForCss !== undefined) {
      src = cs.mapping?.[variantIdxForCss]?.fields;
    }
    if (src) {
      if (typeof src.bgColor     === 'string' && src.bgColor)     avatarFields.bg     = src.bgColor;
      if (typeof src.borderColor === 'string' && src.borderColor) avatarFields.border = src.borderColor;
      if (typeof src.nameColor   === 'string' && src.nameColor)   avatarFields.name   = src.nameColor;
    }
  }

  const variantLabel = isBoundStyle && variantList.length > 0
    ? variantList[styleCycleIdx % variantList.length].label
    : '';

  return (
    <div className="flex flex-col gap-3">
      {/* Scoped CSS for this preview — same emitter as story.css. */}
      <style dangerouslySetInnerHTML={{ __html: previewCss }} />

      {/* Big avatar square */}
      <div
        className="w-full aspect-square rounded-lg border-2 overflow-hidden flex items-center justify-center"
        style={{ borderColor: avatarFields.border, background: avatarFields.bg }}
      >
        {showAvatar ? (
          <img src={avatarSrc} className="w-full h-full object-cover" alt="" onError={() => setImgFailed(true)} />
        ) : (
          <span className="text-4xl font-bold" style={{ color: avatarFields.name }}>
            {(char.name || '?').slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>

      {/* Dialog example — scoped CSS class applies all merged fields + rawCss.
          Includes a small .char-avatar so rules targeting it become testable. */}
      <div className={`dialogue ${MODAL_PREVIEW_SCOPE}`}>
        {showAvatar ? (
          <img
            src={avatarSrc}
            className="char-avatar object-cover"
            style={{ width: 48, height: 48 }}
            alt=""
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="char-avatar flex items-center justify-center font-bold"
            style={{
              width: 48, height: 48,
              background: avatarFields.bg,
              color: avatarFields.name,
              borderRadius: 4,
            }}
          >
            {(char.name || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="char-body flex-1 min-w-0">
          <span className="char-name text-xs">
            {char.name || t.characters.fieldName}
          </span>
          <p className="char-text text-xs italic m-0 mt-0.5">
            {t.characters.exampleLine}
          </p>
        </div>
      </div>

      {isBoundStyle && variantLabel && (
        <div className="text-[10px] text-slate-500 text-center font-mono">{variantLabel}</div>
      )}
    </div>
  );
}

function PreviewMeta({
  varName, isHero, nameColor, textColor, bgColor, borderColor, charId,
}: {
  varName: string; isHero: boolean;
  nameColor: string; textColor: string; bgColor: string; borderColor: string;
  charId?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const cssClass = charId ? `char-${charId}` : null;

  const handleCopy = () => {
    if (!cssClass) return;
    navigator.clipboard.writeText(cssClass).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const rows: [string, ReactNode][] = [
    [t.characters.fieldVarName, varName ? <code className="text-slate-300 font-mono text-[11px]">{varName}</code> : <span className="text-slate-600">—</span>],
    [t.characters.isHero, isHero
      ? <span className="text-amber-300 text-[11px] inline-flex items-center gap-1"><EmojiIcon name="star" size={20} /> {(t.common as any).yes ?? 'Yes'}</span>
      : <span className="text-slate-500 text-[11px]">{(t.common as any).no ?? 'No'}</span>
    ],
  ];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
          {(t.characters as any).previewMeta ?? 'Details'}
        </h3>
        <dl className="flex flex-col gap-1.5 text-[11px]">
          {rows.map(([k, v], i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-200 truncate">{v}</dd>
            </div>
          ))}
          {cssClass && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500 shrink-0">CSS class</dt>
              <dd className="flex items-center gap-1 min-w-0">
                <code className="text-indigo-300 font-mono text-[10px] truncate">{cssClass}</code>
                <button
                  type="button"
                  onClick={handleCopy}
                  title={copied ? 'Copied!' : 'Copy class name'}
                  className="shrink-0 text-slate-500 hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  )}
                </button>
              </dd>
            </div>
          )}
        </dl>
      </div>
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
          {(t.characters as any).previewColors ?? 'Colors'}
        </h3>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { c: nameColor,   l: 'N' },
            { c: textColor,   l: 'T' },
            { c: bgColor,     l: 'B' },
            { c: borderColor, l: 'A' },
          ].map(({ c, l }, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-full aspect-square rounded border border-slate-600" style={{ background: c }} />
              <span className="text-[9px] text-slate-500 font-mono">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  BASICS TAB
// ═══════════════════════════════════════════════════════════════════════════

function BasicsTab({
  name, varName, nameError, varNameError, mode, isHero, llmDescr, llmTemperature,
  nameColor, textColor, bgColor, borderColor,
  onNameChange, onVarNameChange, onIsHeroChange, onLlmDescrChange, onLlmTemperatureChange,
  onNameColorChange, onTextColorChange, onBgColorChange, onBorderColorChange,
  onEnterSave,
  customDialogueStyle, onCustomDialogueStyleChange, variableNodes,
}: {
  name: string; varName: string;
  nameError: string | null; varNameError: string | null;
  mode: 'create' | 'edit'; isHero: boolean; llmDescr: string; llmTemperature: string;
  nameColor: string; textColor: string; bgColor: string; borderColor: string;
  onNameChange: (v: string) => void;
  onVarNameChange: (v: string) => void;
  onIsHeroChange: (v: boolean) => void;
  onLlmDescrChange: (v: string) => void;
  onLlmTemperatureChange: (v: string) => void;
  onNameColorChange: (v: string) => void;
  onTextColorChange: (v: string) => void;
  onBgColorChange: (v: string) => void;
  onBorderColorChange: (v: string) => void;
  onEnterSave: () => void;
  customDialogueStyle: BlockStyleOverride | undefined;
  onCustomDialogueStyleChange: (v: BlockStyleOverride | undefined) => void;
  variableNodes: VariableTreeNode[];
}) {
  const t = useT();

  return (
    <>
      <Section title={(t.characters as any).sectionIdentity ?? 'Identity'}>
        <TwoCol>
          <Field label={t.characters.fieldName} error={nameError}>
            <input
              autoFocus
              className={`${INPUT_CLS} ${nameError ? '!border-red-500' : ''}`}
              value={name}
              onChange={e => onNameChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEnterSave(); }}
            />
          </Field>
          <Field
            label={t.characters.fieldVarName}
            hint={mode !== 'edit' && !varNameError ? t.characters.varNameHint : undefined}
            error={mode !== 'edit' ? varNameError : null}
          >
            <input
              className={`${INPUT_CLS} font-mono ${
                mode === 'edit' ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : ''
              } ${varNameError && mode !== 'edit' ? '!border-red-500' : ''}`}
              value={varName}
              onChange={e => onVarNameChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEnterSave(); }}
              placeholder="gg, wife, npc_01..."
              readOnly={mode === 'edit'}
            />
          </Field>
        </TwoCol>

        <label className="flex items-center gap-2 cursor-pointer select-none mt-1">
          <input type="checkbox" className="accent-amber-400" checked={isHero} onChange={e => onIsHeroChange(e.target.checked)} />
          <span className="text-xs text-slate-300">{t.characters.isHero}</span>
          <span className="text-xs text-slate-500 cursor-help inline-flex" title={t.characters.heroTooltip}><EmojiIcon name="info" size={20} /></span>
        </label>
      </Section>

      <Section title={(t.characters as any).sectionColors ?? 'Colors'}>
        <div className="grid grid-cols-2 gap-3">
          <ColorSwatch label={t.characters.fieldNameColor}  value={nameColor}   onChange={onNameColorChange} />
          <ColorSwatch label={t.characters.fieldTextColor}  value={textColor}   onChange={onTextColorChange} />
          <ColorSwatch label={t.characters.fieldDialogBg}   value={bgColor}     onChange={onBgColorChange} />
          <ColorSwatch label={t.characters.fieldAccent}     value={borderColor} onChange={onBorderColorChange} />
        </div>
      </Section>

      <Section title={t.styleOverride.sectionTitle}>
        <StyleOverrideEditor
          value={customDialogueStyle}
          onChange={onCustomDialogueStyleChange}
          variableNodes={variableNodes}
          allowBound={true}
          fieldsSchema={DIALOGUE_FIELD_SCHEMA}
          rawCssHelp={DIALOGUE_RAW_CSS_HELP}
        />
      </Section>

      <Section title={(t.characters as any).sectionLlm ?? 'LLM'}>
        <Field label={(t.characters as any).llmDescrLabel ?? 'LLM Description'}>
          <textarea
            className={INPUT_CLS + ' resize-none'}
            rows={3}
            placeholder="Personality, speech patterns, appearance..."
            value={llmDescr}
            onChange={e => onLlmDescrChange(e.target.value)}
          />
        </Field>
        <Field label={(t.characters as any).llmTempLabel ?? 'LLM Temperature'}>
          <input
            type="number" step="0.1" min="0" max="2"
            className={INPUT_CLS}
            placeholder="Use global setting"
            value={llmTemperature}
            onChange={e => onLlmTemperatureChange(e.target.value)}
          />
        </Field>
      </Section>
    </>
  );
}

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2.5 p-2 rounded border border-slate-600 bg-slate-700/40 cursor-pointer hover:border-slate-500 transition-colors">
      <div className="relative w-8 h-8 rounded border border-slate-500 overflow-hidden shrink-0" style={{ background: value }}>
        <input
          type="color" value={value} onChange={e => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-slate-300">{label}</span>
        <span className="text-[10px] font-mono text-slate-500 uppercase">{value}</span>
      </div>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  AVATAR TAB
// ═══════════════════════════════════════════════════════════════════════════

function AvatarTab({
  cfg, onChange, assetNodes, charNodes, charVarName, charName, charLlmDescr,
}: {
  cfg: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  assetNodes: AssetTreeNode[];
  charNodes: VariableTreeNode[];
  charVarName: string; charName: string; charLlmDescr?: string;
}) {
  const t = useT();
  const { project } = useProjectStore();
  const [genModalOpen, setGenModalOpen] = useState(false);

  return (
    <>
      <Section title={(t.characters as any).sectionAvatarMode ?? 'Avatar source'}>
        <div className="flex gap-2 flex-wrap">
          <ModeBtn active={cfg.mode === 'static'} onClick={() => onChange({ ...cfg, mode: 'static' })}>
            {t.characters.avatarStatic}
          </ModeBtn>
          <ModeBtn active={cfg.mode === 'bound'} onClick={() => onChange({ ...cfg, mode: 'bound' })}>
            {t.characters.avatarDynamic}
          </ModeBtn>
          <button
            onClick={() => setGenModalOpen(true)}
            className="text-xs px-3 py-1.5 rounded border transition-colors cursor-pointer bg-slate-700 border-slate-600 text-slate-300 hover:border-indigo-500 hover:text-indigo-200 flex items-center gap-1.5"
          >
            <IconSparkle /> {t.avatarGen.generateBtn}
          </button>
        </div>
      </Section>

      {cfg.mode === 'static' && (
        <Section title={t.characters.fieldImage}>
          <ImageAssetPicker
            assetNodes={assetNodes}
            value={cfg.src}
            onChange={src => onChange({ ...cfg, src })}
          />
        </Section>
      )}

      {cfg.mode === 'bound' && (
        <>
          <Section title={t.characters.fieldVariable}>
            <VariablePicker
              value={cfg.variableId}
              onChange={id => onChange({ ...cfg, variableId: id })}
              nodes={charNodes?.length ? charNodes : project.variableNodes}
              placeholder={t.characters.selectVariable}
            />
          </Section>
          <Section title={(t.characters as any).sectionAvatarMapping ?? 'Value → image mapping'}>
            <ImageMappingEditor
              mapping={cfg.mapping}
              onChange={mapping => onChange({ ...cfg, mapping })}
              defaultSrc={cfg.defaultSrc}
              onDefaultSrcChange={defaultSrc => onChange({ ...cfg, defaultSrc })}
              assetNodes={assetNodes}
              hideDefault
            />
          </Section>
        </>
      )}

      {genModalOpen && (
        <AvatarGenModal
          cfg={cfg}
          charVarName={charVarName || 'char'}
          charName={charName}
          charLlmDescr={charLlmDescr}
          onSave={onChange}
          onClose={() => setGenModalOpen(false)}
        />
      )}
    </>
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
//  INVENTORY + PAPERDOLL TAB
// ═══════════════════════════════════════════════════════════════════════════

function InventoryPaperdollTab({
  initialInventory, setInitialInventory, items,
  mode, charId, liveChar,
  localPaperdoll, setLocalPaperdoll,
  addPaperdollSlot, updatePaperdollSlot, deletePaperdollSlot, setPaperdollConfig,
  charNodes, charName, charLlmDescr, charVarName,
}: {
  initialInventory: CharacterInventorySlot[];
  setInitialInventory: (s: CharacterInventorySlot[]) => void;
  items: ItemDefinition[];
  mode: 'create' | 'edit';
  charId?: string;
  liveChar?: Character;
  localPaperdoll: PaperdollConfig | undefined;
  setLocalPaperdoll: (c: PaperdollConfig | undefined) => void;
  addPaperdollSlot: (charId: string, slot: Omit<PaperdollSlot, 'id'>) => void;
  updatePaperdollSlot: (charId: string, slotId: string, patch: Partial<Omit<PaperdollSlot, 'id'>>) => void;
  deletePaperdollSlot: (charId: string, slotId: string) => void;
  setPaperdollConfig: (charId: string, config: PaperdollConfig | undefined) => void;
  charNodes: VariableTreeNode[];
  charName: string; charLlmDescr?: string; charVarName: string;
}) {
  const t = useT();

  return (
    <>
      <Section title={(t.characters as any).initialInventorySection ?? t.characters.initialInventorySection}>
        <InitialInventory slots={initialInventory} items={items} onChange={setInitialInventory} />
      </Section>

      <Section title={t.characters.paperdollSection}>
        <PaperdollEditor
          mode={mode} charId={charId} liveChar={liveChar}
          localConfig={localPaperdoll} onLocalChange={setLocalPaperdoll}
          items={items} charNodes={charNodes}
          charName={charName} charLlmDescr={charLlmDescr} charVarName={charVarName}
          addPaperdollSlot={addPaperdollSlot}
          updatePaperdollSlot={updatePaperdollSlot}
          deletePaperdollSlot={deletePaperdollSlot}
          setPaperdollConfig={setPaperdollConfig}
        />
      </Section>
    </>
  );
}

// ─── Initial Inventory (flat, always expanded) ─────────────────────────────

function InitialInventory({
  slots, items, onChange,
}: {
  slots: CharacterInventorySlot[]; items: ItemDefinition[];
  onChange: (s: CharacterInventorySlot[]) => void;
}) {
  const t = useT();

  const addSlot = () => {
    if (items.length === 0) return;
    const first = items[0];
    onChange([...slots, { id: crypto.randomUUID(), itemVarName: first.varName, quantity: 1, equipped: false }]);
  };
  const updateSlot = (id: string, patch: Partial<CharacterInventorySlot>) =>
    onChange(slots.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeSlot = (id: string) => onChange(slots.filter(s => s.id !== id));

  if (items.length === 0) {
    return <p className="text-xs text-slate-500 italic">{t.characters.initialInventoryNoItems}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {slots.length === 0 ? (
        <p className="text-xs text-slate-500 italic">{t.characters.initialInventoryEmpty}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {slots.map(slot => (
            <div key={slot.id} className="flex items-center gap-2 p-1.5 rounded border border-slate-700 bg-slate-800/40">
              <select
                className="flex-1 min-w-0 bg-slate-700 text-xs text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
                value={slot.itemVarName}
                onChange={e => updateSlot(slot.id, { itemVarName: e.target.value, equipped: false })}
              >
                {items.map(it => (
                  <option key={it.id} value={it.varName}>
                    {it.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-slate-500">{t.characters.initialInventoryQty}</span>
                <input
                  type="number" min={1}
                  className="w-14 bg-slate-700 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                  value={slot.quantity}
                  onChange={e => updateSlot(slot.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>
              <button
                onClick={() => removeSlot(slot.id)}
                className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer text-xs shrink-0 px-1"
              >
                <EmojiIcon name="close" size={20} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={addSlot}
        className="text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600 self-start"
      >
        {t.characters.initialInventoryAdd}
      </button>
    </div>
  );
}

// ─── Paperdoll (grid + slot detail side-by-side) ───────────────────────────

function PaperdollEditor({
  mode, charId, liveChar,
  localConfig, onLocalChange,
  items, charNodes, charName, charLlmDescr, charVarName,
  addPaperdollSlot, updatePaperdollSlot, deletePaperdollSlot, setPaperdollConfig,
}: {
  mode: 'create' | 'edit';
  charId?: string;
  liveChar?: Character;
  localConfig: PaperdollConfig | undefined;
  onLocalChange: (c: PaperdollConfig | undefined) => void;
  items: ItemDefinition[];
  charNodes: VariableTreeNode[];
  charName: string; charLlmDescr?: string; charVarName: string;
  addPaperdollSlot: (charId: string, slot: Omit<PaperdollSlot, 'id'>) => void;
  updatePaperdollSlot: (charId: string, slotId: string, patch: Partial<Omit<PaperdollSlot, 'id'>>) => void;
  deletePaperdollSlot: (charId: string, slotId: string) => void;
  setPaperdollConfig: (charId: string, config: PaperdollConfig | undefined) => void;
}) {
  const t = useT();
  const { project } = useProjectStore();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [genModalOpen, setGenModalOpen] = useState(false);

  const config = mode === 'edit' ? liveChar?.paperdoll : localConfig;
  const slots  = config?.slots ?? [];
  const selectedSlot = slots.find(s => s.id === selectedSlotId) ?? null;

  const [pendingSelectPos, setPendingSelectPos] = useState<{ row: number; col: number } | null>(null);
  if (pendingSelectPos) {
    const found = slots.find(s => s.row === pendingSelectPos.row && s.col === pendingSelectPos.col);
    if (found) { setSelectedSlotId(found.id); setPendingSelectPos(null); }
  }

  const handleAddSlotAt = (row: number, col: number) => {
    const label = `Slot ${row}:${col}`;
    const slotData: Omit<PaperdollSlot, 'id'> = { label, row, col };
    if (mode === 'edit' && charId) {
      addPaperdollSlot(charId, slotData);
      setPendingSelectPos({ row, col });
    } else {
      const cur = localConfig ?? emptyPaperdoll();
      const base = `slot_${row}_${col}`;
      let id = base; let n = 2;
      while (cur.slots.some(s => s.id === id)) { id = `${base}_${n++}`; }
      onLocalChange({ ...cur, slots: [...cur.slots, { ...slotData, id }] });
      setSelectedSlotId(id);
    }
  };

  const handleDeleteSlot = (slotId: string) => {
    if (mode === 'edit' && charId) deletePaperdollSlot(charId, slotId);
    else {
      const cur = localConfig ?? emptyPaperdoll();
      onLocalChange({ ...cur, slots: cur.slots.filter(s => s.id !== slotId) });
    }
    setSelectedSlotId(null);
  };

  const handleUpdateSlot = (slotId: string, patch: Partial<Omit<PaperdollSlot, 'id'>>) => {
    if (mode === 'edit' && charId) updatePaperdollSlot(charId, slotId, patch);
    else {
      const cur = localConfig ?? emptyPaperdoll();
      onLocalChange({ ...cur, slots: cur.slots.map(s => s.id === slotId ? { ...s, ...patch } : s) });
    }
  };

  const handleMoveSlot = (draggedId: string, toRow: number, toCol: number) => {
    const cur = config ?? emptyPaperdoll();
    const target  = cur.slots.find(s => s.row === toRow && s.col === toCol);
    const dragged = cur.slots.find(s => s.id === draggedId);
    if (!dragged) return;

    const updated: PaperdollSlot[] = target
      ? cur.slots.map(s => {
          if (s.id === draggedId)  return { ...s, row: target.row, col: target.col };
          if (s.id === target.id)  return { ...s, row: dragged.row, col: dragged.col };
          return s;
        })
      : cur.slots.map(s => s.id === draggedId ? { ...s, row: toRow, col: toCol } : s);

    if (mode === 'edit' && charId) {
      updated.forEach(s => {
        const orig = cur.slots.find(o => o.id === s.id);
        if (orig && (orig.row !== s.row || orig.col !== s.col)) {
          updatePaperdollSlot(charId, s.id, { row: s.row, col: s.col });
        }
      });
    } else {
      onLocalChange({ ...cur, slots: updated });
    }
  };

  const handleGridChange = (patch: Partial<Pick<PaperdollConfig, 'gridCols' | 'gridRows' | 'cellSize'>>) => {
    const cur = config ?? emptyPaperdoll();
    const next: PaperdollConfig = { ...cur, ...patch };
    if (mode === 'edit' && charId) setPaperdollConfig(charId, next);
    else onLocalChange(next);
  };

  const genSlot = genModalOpen ? selectedSlot : null;
  const genPh: SlotPlaceholderConfig | null = genSlot
    ? (genSlot.placeholder ?? { mode: 'static', src: genSlot.placeholderIcon ?? '', variableId: '', mapping: [], defaultSrc: '' })
    : null;

  return (
    <div className="flex gap-4">
      {/* Grid + grid config */}
      <div className="shrink-0 flex flex-col gap-3">
        <PaperdollGrid
          config={config}
          selectedSlotId={selectedSlotId}
          onSelectSlot={setSelectedSlotId}
          onAddSlotAt={handleAddSlotAt}
          onMoveSlot={handleMoveSlot}
        />
        <div className="flex flex-col gap-1.5">
          {([
            { key: 'gridCols' as const, label: t.characters.paperdollGridCols, def: 3 },
            { key: 'gridRows' as const, label: t.characters.paperdollGridRows, def: 4 },
            { key: 'cellSize' as const, label: t.characters.paperdollCellSize, def: 64 },
          ]).map(({ key, label, def }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-14">{label}</span>
              <input
                type="number" min={1}
                className="w-14 bg-slate-700 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500"
                value={config?.[key] ?? def}
                onChange={e => handleGridChange({ [key]: Math.max(1, parseInt(e.target.value) || 1) })}
              />
            </div>
          ))}
        </div>
        {slots.length > 0 && (
          <p className="text-[10px] text-slate-500">
            {slots.length} slot{slots.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Slot detail */}
      <div className="flex-1 min-w-0 rounded border border-slate-700 bg-slate-800/40 p-3">
        {selectedSlot ? (
          <>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2.5">
              Slot — <span className="text-slate-300 normal-case">{selectedSlot.label}</span>
            </p>
            <SlotDetail
              slot={selectedSlot}
              items={items}
              charNodes={charNodes}
              assetNodes={project.assetNodes}
              onUpdate={patch => handleUpdateSlot(selectedSlot.id, patch)}
              onDelete={() => handleDeleteSlot(selectedSlot.id)}
              onGenerate={() => setGenModalOpen(true)}
            />
          </>
        ) : (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center gap-2 text-slate-600">
            <span className="text-3xl inline-flex"><EmojiIcon name="hamburger" size={20} /></span>
            <p className="text-xs text-center max-w-[220px]">
              {(t.characters as any).paperdollEmptyHint ?? 'Click a slot to edit it, or an empty cell to add one.'}
            </p>
          </div>
        )}
      </div>

      {/* Gen modal */}
      {genSlot && genPh && (
        <AvatarGenModal
          cfg={placeholderToAvatarConfig(genPh)}
          charVarName={`${charVarName || 'char'}_${genSlot.id}`}
          charName={charName}
          charLlmDescr={charLlmDescr}
          assetSubfolder={`paperdoll/${charVarName || 'char'}`}
          modalTitle={genSlot.label}
          slotLabelStatic={genSlot.label}
          slotLabelDefault={genSlot.label}
          entityKind="paperdoll-slot"
          onSave={updatedCfg => {
            handleUpdateSlot(genSlot.id, { placeholder: avatarConfigToPlaceholder(updatedCfg, genPh) });
            setGenModalOpen(false);
          }}
          onClose={() => setGenModalOpen(false)}
        />
      )}
    </div>
  );
}

function PaperdollGrid({
  config, selectedSlotId, onSelectSlot, onAddSlotAt, onMoveSlot,
}: {
  config: PaperdollConfig | undefined;
  selectedSlotId: string | null;
  onSelectSlot: (id: string) => void;
  onAddSlotAt: (row: number, col: number) => void;
  onMoveSlot: (draggedId: string, toRow: number, toCol: number) => void;
}) {
  const cfg = config ?? emptyPaperdoll();
  const { gridCols, gridRows, slots } = cfg;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, slotId: string) => { setDraggingId(slotId); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver  = (e: React.DragEvent, key: string) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(key); };
  const handleDrop      = (e: React.DragEvent, row: number, col: number) => {
    e.preventDefault();
    setDragOverKey(null);
    if (!draggingId) return;
    const self = slots.find(s => s.id === draggingId);
    if (self && self.row === row && self.col === col) return;
    onMoveSlot(draggingId, row, col);
    setDraggingId(null);
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverKey(null); };

  return (
    <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${gridCols}, 2.5rem)` }}>
      {Array.from({ length: gridRows }, (_, r) =>
        Array.from({ length: gridCols }, (_, c) => {
          const row = r + 1, col = c + 1, key = `${row}_${col}`;
          const slot = slots.find(s => s.row === row && s.col === col);
          const selected = slot ? slot.id === selectedSlotId : false;
          const isDragging = slot ? slot.id === draggingId : false;
          const isOver = dragOverKey === key && draggingId !== null;

          if (slot) {
            return (
              <button
                key={key} type="button" title={slot.label} draggable
                onClick={() => !isDragging && onSelectSlot(slot.id)}
                onDragStart={e => handleDragStart(e, slot.id)}
                onDragEnd={handleDragEnd}
                onDragOver={e => handleDragOver(e, key)}
                onDrop={e => handleDrop(e, row, col)}
                className={`w-10 h-10 rounded flex items-center justify-center text-[9px] text-center leading-tight p-0.5 border transition-colors cursor-grab active:cursor-grabbing select-none ${
                  isDragging
                    ? 'opacity-40 border-dashed border-indigo-500 bg-indigo-900/30'
                    : isOver
                      ? 'bg-indigo-500/40 border-indigo-400 text-white scale-105'
                      : selected
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-indigo-900/50 border-indigo-600/50 text-indigo-300 hover:bg-indigo-700/60 hover:border-indigo-400'
                }`}
              >
                <span className="truncate w-full text-center">{slot.label}</span>
              </button>
            );
          }

          return (
            <button
              key={key} type="button"
              title={draggingId ? `Move here (${row}:${col})` : `Add slot at ${row}:${col}`}
              onClick={() => !draggingId && onAddSlotAt(row, col)}
              onDragOver={e => handleDragOver(e, key)}
              onDrop={e => handleDrop(e, row, col)}
              onDragLeave={() => setDragOverKey(null)}
              className={`w-10 h-10 rounded flex items-center justify-center border transition-colors cursor-pointer text-base ${
                isOver
                  ? 'border-indigo-500 bg-indigo-900/40 text-indigo-400'
                  : 'border-dashed border-slate-700 text-slate-700 hover:border-indigo-600 hover:text-indigo-500'
              }`}
            >
              {isOver ? '↓' : '+'}
            </button>
          );
        })
      )}
    </div>
  );
}

function SlotDetail({
  slot, items, charNodes, assetNodes, onUpdate, onDelete, onGenerate,
}: {
  slot: PaperdollSlot;
  items: ItemDefinition[];
  charNodes: VariableTreeNode[];
  assetNodes: AssetTreeNode[];
  onUpdate: (patch: Partial<Omit<PaperdollSlot, 'id'>>) => void;
  onDelete: () => void;
  onGenerate: () => void;
}) {
  const t = useT();
  const ph: SlotPlaceholderConfig = slot.placeholder ?? {
    mode: 'static', src: slot.placeholderIcon ?? '', variableId: '', mapping: [], defaultSrc: '',
  };
  const setPh = (patch: Partial<SlotPlaceholderConfig>) =>
    onUpdate({ placeholder: { ...ph, ...patch } });

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Label */}
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <label className="text-[10px] text-slate-500">Label</label>
        <input
          type="text"
          placeholder={t.characters.paperdollSlotLabel}
          className={INPUT_CLS}
          value={slot.label}
          onChange={e => onUpdate({ label: e.target.value })}
        />
      </div>

      {/* Position row/col */}
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <label className="text-[10px] text-slate-500">Position</label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{t.characters.paperdollRowLabel}</span>
          <input
            type="number" min={1}
            className={INPUT_CLS + ' w-14'}
            value={slot.row}
            onChange={e => onUpdate({ row: Math.max(1, parseInt(e.target.value) || 1) })}
          />
          <span className="text-[10px] text-slate-500">{t.characters.paperdollColLabel}</span>
          <input
            type="number" min={1}
            className={INPUT_CLS + ' w-14'}
            value={slot.col}
            onChange={e => onUpdate({ col: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </div>
      </div>

      {/* ID */}
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <label className="text-[10px] text-slate-500">ID</label>
        <code className="text-[10px] text-slate-500 font-mono">{slot.id}</code>
      </div>

      <div className="h-px bg-slate-700/70" />

      {/* Default item */}
      <div className="grid grid-cols-[64px_1fr] items-center gap-2">
        <label className="text-[10px] text-slate-500">{t.characters.paperdollDefaultItem}</label>
        <select
          className={INPUT_CLS + ' cursor-pointer'}
          value={slot.defaultItemVarName ?? ''}
          onChange={e => onUpdate({ defaultItemVarName: e.target.value || undefined })}
        >
          <option value="">{t.characters.paperdollDefaultItemNone}</option>
          {items.filter(i => {
            if (i.category !== 'wearable') return false;
            const norm = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            return norm(i.targetSlot ?? '') === slot.id ||
              (i.targetSlot ?? '').toLowerCase() === (slot.label ?? '').toLowerCase();
          }).map(it => (
            <option key={it.id} value={it.varName}>{it.name}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer ml-[72px]">
        <input type="checkbox" className="accent-indigo-500"
          checked={slot.clickable ?? false}
          onChange={e => onUpdate({ clickable: e.target.checked })}
        />
        <span className="text-xs text-slate-400">{t.characters.paperdollSlotClickable}</span>
      </label>

      <div className="h-px bg-slate-700/70" />

      {/* Placeholder */}
      <div className="grid grid-cols-[64px_1fr] items-start gap-2">
        <label className="text-[10px] text-slate-500 pt-1">{t.characters.paperdollPlaceholderIcon}</label>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex gap-1.5 flex-wrap">
            <ModeBtnSmall active={ph.mode === 'static'} onClick={() => setPh({ mode: 'static' })}>
              {t.characters.paperdollPlaceholderStatic}
            </ModeBtnSmall>
            <ModeBtnSmall active={ph.mode === 'bound'}  onClick={() => setPh({ mode: 'bound' })}>
              {t.characters.paperdollPlaceholderBound}
            </ModeBtnSmall>
            <button
              type="button"
              onClick={onGenerate}
              className="text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer bg-slate-700 border-slate-600 text-slate-300 hover:text-indigo-200 hover:border-indigo-500 flex items-center gap-1"
            >
              <IconSparkle size={10} /> {t.avatarGen?.generateBtn ?? 'Generate'}
            </button>
          </div>

          {ph.mode === 'static' && (
            <ImageAssetPicker
              assetNodes={assetNodes}
              value={ph.src}
              onChange={src => setPh({ src })}
            />
          )}
          {ph.mode === 'bound' && (
            <div className="flex flex-col gap-1.5">
              <VariablePicker
                value={ph.variableId}
                onChange={variableId => setPh({ variableId })}
                nodes={charNodes}
                placeholder={t.characters.paperdollPlaceholderSelectVar}
              />
              <ImageMappingEditor
                mapping={ph.mapping}
                onChange={mapping => setPh({ mapping })}
                defaultSrc={ph.defaultSrc}
                onDefaultSrcChange={defaultSrc => setPh({ defaultSrc })}
                assetNodes={assetNodes}
                hideDefault
              />
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-slate-700/70" />

      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-slate-500 hover:text-red-400 transition-colors cursor-pointer text-left self-start"
      >
        <span className="inline-flex items-center gap-1"><EmojiIcon name="close" size={20} /> {(t.characters as any).paperdollDeleteSlot ?? 'Delete slot'}</span>
      </button>
    </div>
  );
}

function ModeBtnSmall({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
        active ? 'bg-indigo-600 border-indigo-500 text-white'
               : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  VARIABLES TAB
// ═══════════════════════════════════════════════════════════════════════════

function VariablesTab({
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
    setExpandedIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  return (
    <Section title={t.characters.customVarsSection}>
      {nodes.length === 0 && (
        <p className="text-xs text-slate-500 italic">{t.characters.customVarsEmpty}</p>
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

// Re-export Toggle for parity (unused in this file but avoids unused-import warning elsewhere)
export const _Toggle = Toggle;

// ═══════════════════════════════════════════════════════════════════════════
//  Icons
// ═══════════════════════════════════════════════════════════════════════════

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
  </svg>
);
const IconImage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="9" r="1.5" />
    <path d="M21 15l-5-5-10 10" />
  </svg>
);
const IconBag = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16l-1.5 13a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8L4 7z" />
    <path d="M9 7V5a3 3 0 0 1 6 0v2" />
  </svg>
);
const IconVar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4c-2 4-2 12 0 16M17 4c2 4 2 12 0 16" />
    <path d="M9 12h6" />
  </svg>
);
const IconSparkle = ({ size = 14 }: { size?: number }) => <EmojiIcon name="sparkle" size={size} />;
