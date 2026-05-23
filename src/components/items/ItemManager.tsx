import { useState } from 'react';
import { useProjectStore, charToVarPrefix } from '../../store/projectStore';
import { toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { ItemDefinition, ItemCategory } from '../../types';
import { useT } from '../../i18n';
import { ItemEditor } from './ItemEditor';
import { useConfirm } from '../shared/ConfirmModal';
import { EmojiIcon, type EmojiIconName } from '../shared/EmojiIcons';

const CATEGORY_ICONS: Record<ItemCategory, EmojiIconName> = {
  wearable:   'shirt',
  consumable: 'potion',
  misc:       'box',
};

function sanitizeVarName(name: string): string {
  // Reuse same logic as charToVarPrefix
  return charToVarPrefix(name);
}

type ModalState =
  | { mode: 'create'; draft: Omit<ItemDefinition, 'id' | 'varIds'> }
  | { mode: 'edit';   item: ItemDefinition }
  | null;

export function ItemManager() {
  const t = useT();
  const project    = useProjectStore(s => s.project);
  const addItem    = useProjectStore(s => s.addItem);
  const updateItem = useProjectStore(s => s.updateItem);
  const deleteItem = useProjectStore(s => s.deleteItem);
  const items = project.items ?? [];
  const [modalState, setModalState] = useState<ModalState>(null);
  const confirmDeleteCharacter = useEditorPrefsStore(s => s.confirmDeleteCharacter);
  const { ask, modal: confirmModal } = useConfirm();

  const openCreate = () => {
    const baseName = t.items.defaultName;
    const existingNames = items.map(i => i.name);
    let name = baseName;
    let idx = 2;
    while (existingNames.includes(name)) { name = `${baseName}${idx}`; idx++; }
    const varName = sanitizeVarName(name);
    const draft: Omit<ItemDefinition, 'id' | 'varIds'> = {
      name,
      varName,
      category: 'misc',
      stackable: false,
      iconConfig: { mode: 'static', src: '' },
      customProps: [],
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
          {t.items.add}
        </button>
      </div>

      {/* List */}
      {items.map(item => (
        <ItemRow
          key={item.id}
          item={item}
          onEdit={() => setModalState({ mode: 'edit', item })}
          onDelete={() => {
            if (confirmDeleteCharacter) {
              ask({ message: t.items.confirmDelete(item.name), variant: 'danger' }, () => deleteItem(item.id));
            } else {
              deleteItem(item.id);
            }
          }}
        />
      ))}

      {items.length === 0 && (
        <p className="text-xs text-slate-600 italic px-2 py-1">{t.items.empty}</p>
      )}

      {/* Modal */}
      {modalState && (
        <ItemEditor
          mode={modalState.mode}
          itemId={modalState.mode === 'edit' ? (modalState as { mode: 'edit'; item: ItemDefinition }).item.id : undefined}
          initial={modalState.mode === 'create' ? modalState.draft : modalState.item}
          takenNames={items
            .filter(i => modalState.mode !== 'edit' || i.id !== (modalState as { mode: 'edit'; item: ItemDefinition }).item.id)
            .map(i => i.name)}
          takenVarNames={items
            .filter(i => modalState.mode !== 'edit' || i.id !== (modalState as { mode: 'edit'; item: ItemDefinition }).item.id)
            .map(i => i.varName)}
          onSave={(data) => {
            if (modalState.mode === 'create') {
              addItem(data);
            } else {
              updateItem((modalState as { mode: 'edit'; item: ItemDefinition }).item.id, data);
            }
          }}
          onClose={() => setModalState(null)}
        />
      )}
      {confirmModal}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: ItemDefinition;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const projectDir = useProjectStore(s => s.projectDir);

  // Resolve local file URL for icon preview
  const rawIconSrc = item.iconConfig?.src ?? '';
  let iconSrc = '';
  if (rawIconSrc) {
    if (rawIconSrc.startsWith('localfile://') || /^https?:\/\//i.test(rawIconSrc)) {
      iconSrc = rawIconSrc;
    } else if (projectDir) {
      iconSrc = toLocalFileUrl(resolveAssetPath(projectDir, rawIconSrc));
    }
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded border border-slate-700 hover:bg-slate-800 transition-colors cursor-pointer"
      onClick={onEdit}
    >
      {/* Icon preview */}
      <div className="w-6 h-6 rounded bg-slate-700 shrink-0 flex items-center justify-center overflow-hidden">
        {iconSrc ? (
          <img src={iconSrc} className="w-full h-full object-cover" alt="" />
        ) : (
          <span className="inline-flex"><EmojiIcon name={CATEGORY_ICONS[item.category]} size={12} /></span>
        )}
      </div>

      {/* Name */}
      <span className="flex-1 text-xs text-slate-200 truncate">
        {item.name || t.items.noName}
      </span>

      {/* Category badge */}
      <span className="inline-flex text-slate-500 shrink-0">
        <EmojiIcon name={CATEGORY_ICONS[item.category]} size={12} />
      </span>

      {/* Delete */}
      <button
        className="text-slate-600 hover:text-red-400 text-xs cursor-pointer shrink-0"
        onClick={e => { e.stopPropagation(); onDelete(); }}
      >
        <EmojiIcon name="trash" size={20} />
      </button>
    </div>
  );
}
