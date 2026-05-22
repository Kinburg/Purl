import { useState } from 'react';
import { useProjectStore, charToVarPrefix } from '../../store/projectStore';
import { useEditorPrefsStore } from '../../store/editorPrefsStore';
import type { Character } from '../../types';
import { useT } from '../../i18n';
import { CharacterModal } from './CharacterModal';
import { useConfirm } from '../shared/ConfirmModal';

import { EmojiIcon } from '../shared/EmojiIcons';
const DEFAULT_COLORS = [
  { nameColor: '#7dd3fc', bgColor: '#0c2340', borderColor: '#0ea5e9' },
  { nameColor: '#f9a8d4', bgColor: '#2d0a1e', borderColor: '#ec4899' },
  { nameColor: '#86efac', bgColor: '#052e16', borderColor: '#22c55e' },
  { nameColor: '#fde047', bgColor: '#1a1000', borderColor: '#eab308' },
  { nameColor: '#c4b5fd', bgColor: '#1e0a3c', borderColor: '#a855f7' },
];

let colorIdx = 0;
function nextColor() {
  const c = DEFAULT_COLORS[colorIdx % DEFAULT_COLORS.length];
  colorIdx++;
  return c;
}

function newCharDraft(name: string): Omit<Character, 'id'> {
  const c = nextColor();
  return {
    name,
    nameColor: c.nameColor,
    textColor: '#e2e8f0',
    bgColor: c.bgColor,
    borderColor: c.borderColor,
    avatarConfig: { mode: 'static', src: '', variableId: '', mapping: [], defaultSrc: '' },
  };
}

type ModalState =
  | { mode: 'create'; draft: Omit<Character, 'id'> }
  | { mode: 'edit'; char: Character }
  | null;

export function CharacterManager() {
  const t = useT();
  const project          = useProjectStore(s => s.project);
  const addCharacter     = useProjectStore(s => s.addCharacter);
  const updateCharacter  = useProjectStore(s => s.updateCharacter);
  const deleteCharacter  = useProjectStore(s => s.deleteCharacter);
  const { characters } = project;
  const [modalState, setModalState] = useState<ModalState>(null);
  const confirmDeleteCharacter = useEditorPrefsStore(s => s.confirmDeleteCharacter);
  const { ask, modal: confirmModal } = useConfirm();

  const openCreate = () => {
    const baseName = t.characters.defaultName;
    const existing = characters.map(c => c.name);
    let name = baseName;
    let i = 2;
    while (existing.includes(name)) { name = `${baseName}${i}`; i++; }
    setModalState({ mode: 'create', draft: newCharDraft(name) });
  };

  return (
    <div className="p-2 flex flex-col gap-1">
      {/* Add toolbar */}
      <div className="flex gap-1 pb-1 border-b border-slate-800 mb-1">
        <button
          className="flex-1 text-xs text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded px-2 py-1.5 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600"
          onClick={openCreate}
        >
          {t.characters.add}
        </button>
      </div>

      {characters.map(char => (
        <CharacterRow
          key={char.id}
          char={char}
          onEdit={() => setModalState({ mode: 'edit', char })}
          onDelete={() => {
            if (confirmDeleteCharacter) {
              ask({ message: t.characters.confirmDelete(char.name), variant: 'danger' }, () => deleteCharacter(char.id));
            } else {
              deleteCharacter(char.id);
            }
          }}
        />
      ))}

      {characters.length === 0 && (
        <p className="text-xs text-slate-600 italic px-2 py-1">{t.characters.empty}</p>
      )}

      {modalState && (
        <CharacterModal
          mode={modalState.mode}
          charId={modalState.mode === 'edit' ? modalState.char.id : undefined}
          initial={modalState.mode === 'create' ? modalState.draft : modalState.char}
          takenNames={characters
            .filter(c => modalState.mode !== 'edit' || c.id !== modalState.char.id)
            .map(c => c.name)}
          takenVarNames={characters
            .filter(c => modalState.mode !== 'edit' || c.id !== modalState.char.id)
            .map(c => c.varName || charToVarPrefix(c.name))}
          onSave={(data, pendingNodes, pregenVarIds) => {
            if (modalState.mode === 'create') {
              addCharacter(data, pregenVarIds ?? undefined, pendingNodes);
            } else {
              updateCharacter(modalState.char.id, data);
            }
          }}
          onClose={() => setModalState(null)}
        />
      )}
      {confirmModal}
    </div>
  );
}

function CharacterRow({
  char,
  onEdit,
  onDelete,
}: {
  char: Character;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded border border-slate-700 hover:bg-slate-800 transition-colors cursor-pointer${char.isHero ? ' ring-2 ring-amber-400' : ''}`}
      onClick={onEdit}
    >
      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ background: char.borderColor }}
      />
      {char.isHero && <span className="text-xs shrink-0 inline-flex"><EmojiIcon name="star" size={20} /></span>}
      <span className="flex-1 text-xs truncate" style={{ color: char.nameColor }}>
        {char.name || t.characters.noName}
      </span>
      <button
        className="text-slate-600 hover:text-red-400 text-xs cursor-pointer"
        onClick={e => { e.stopPropagation(); onDelete(); }}
      >
        <EmojiIcon name="trash" size={20} />
      </button>
    </div>
  );
}
