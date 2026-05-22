import { useState } from 'react';
import { useProjectStore, charToVarPrefix } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { ContainerDefinition, ContainerMode } from '../../types';
import { useT } from '../../i18n';
import { ContainerEditor } from './ContainerEditor';
import { useConfirm } from '../shared/ConfirmModal';
import { EmojiIcon, type EmojiIconName } from '../shared/EmojiIcons';

const MODE_ICON_NAMES: Record<ContainerMode, EmojiIconName> = {
  shop:  'shop',
  chest: 'box',
  loot:  'gift',
};
function ModeIcon({ mode, size = 16 }: { mode: ContainerMode; size?: number }) {
  return <EmojiIcon name={MODE_ICON_NAMES[mode]} size={size} />;
}

function sanitizeVarName(name: string): string {
  return charToVarPrefix(name);
}

type ModalState =
  | { mode: 'create'; draft: Omit<ContainerDefinition, 'id' | 'varIds'> }
  | { mode: 'edit';   container: ContainerDefinition }
  | null;

export function ContainerManager() {
  const t = useT();
  const project         = useProjectStore(s => s.project);
  const addContainer    = useProjectStore(s => s.addContainer);
  const updateContainer = useProjectStore(s => s.updateContainer);
  const deleteContainer = useProjectStore(s => s.deleteContainer);
  const containers = project.containers ?? [];
  const [modalState, setModalState] = useState<ModalState>(null);
  const confirmDeleteCharacter = useEditorPrefsStore(s => s.confirmDeleteCharacter);
  const { ask, modal: confirmModal } = useConfirm();

  const openCreate = () => {
    const baseName = t.containers.defaultName;
    const existingNames = containers.map(c => c.name);
    let name = baseName;
    let idx = 2;
    while (existingNames.includes(name)) { name = `${baseName}${idx}`; idx++; }
    const draft: Omit<ContainerDefinition, 'id' | 'varIds'> = {
      name,
      varName: sanitizeVarName(name),
      mode: 'shop',
      initialItems: [],
    };
    setModalState({ mode: 'create', draft });
  };

  return (
    <div className="p-2 flex flex-col gap-1">
      {/* Toolbar */}
      <div className="flex gap-1 pb-1 border-b border-slate-800 mb-1">
        <button
          className="flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          onClick={openCreate}
        >
          {t.containers.add}
        </button>
      </div>

      {/* List */}
      {containers.map(container => (
        <ContainerRow
          key={container.id}
          container={container}
          onEdit={() => setModalState({ mode: 'edit', container })}
          onDelete={() => {
            if (confirmDeleteCharacter) {
              ask({ message: t.containers.confirmDelete(container.name), variant: 'danger' }, () => deleteContainer(container.id));
            } else {
              deleteContainer(container.id);
            }
          }}
        />
      ))}

      {containers.length === 0 && (
        <p className="text-xs text-slate-600 italic px-2 py-1">{t.containers.empty}</p>
      )}

      {confirmModal}

      {modalState && (
        <ContainerEditor
          mode={modalState.mode}
          containerId={modalState.mode === 'edit' ? modalState.container.id : undefined}
          initial={modalState.mode === 'create' ? modalState.draft : modalState.container}
          takenNames={containers
            .filter(c => modalState.mode !== 'edit' || c.id !== (modalState as { container: ContainerDefinition }).container.id)
            .map(c => c.name)}
          takenVarNames={containers
            .filter(c => modalState.mode !== 'edit' || c.id !== (modalState as { container: ContainerDefinition }).container.id)
            .map(c => c.varName)}
          onSave={(data) => {
            if (modalState.mode === 'create') {
              addContainer(data);
            } else {
              updateContainer(modalState.container.id, data);
            }
          }}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  );
}

// ─── Container row ─────────────────────────────────────────────────────────────

function ContainerRow({
  container,
  onEdit,
  onDelete,
}: {
  container: ContainerDefinition;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <div
      className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 cursor-pointer transition-colors"
      onClick={onEdit}
    >
      <span className="inline-flex shrink-0"><ModeIcon mode={container.mode} size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-200 truncate">
          {container.name || t.containers.noName}
        </div>
        <div className="text-[10px] text-slate-500 font-mono truncate">
          $containers.{container.varName} · {container.initialItems.length} items
        </div>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all cursor-pointer text-xs shrink-0"
        onClick={e => { e.stopPropagation(); onDelete(); }}
        title={t.common.delete}
      >
        <EmojiIcon name="close" size={20} />
      </button>
    </div>
  );
}
