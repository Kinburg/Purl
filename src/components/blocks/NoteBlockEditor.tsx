import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import type { NoteBlock } from '../../types';

export function NoteBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: NoteBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<NoteBlock>) => void;
}) {
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const t = useT();
  const update = onUpdate ?? ((p: Partial<NoteBlock>) => updateBlock(sceneId, block.id, p as never));

  return (
    <textarea
      className="w-full bg-transparent text-sm text-amber-200/80 placeholder-amber-800 resize-none outline-none leading-relaxed"
      rows={3}
      placeholder={t.scene.notePlaceholder}
      value={block.text}
      onFocus={saveSnapshot}
      onChange={e => update({ text: e.target.value })}
    />
  );
}
