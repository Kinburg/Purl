import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import type { NoteBlock } from '../../types';
import { RichTextArea } from '../shared/RichTextArea';

export function NoteBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: NoteBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<NoteBlock>) => void;
}) {
  const updateBlock = useProjectStore(s => s.updateBlock);
  const t = useT();
  const update = onUpdate ?? ((p: Partial<NoteBlock>) => updateBlock(sceneId, block.id, p as never));

  return (
    <RichTextArea
      sceneId={sceneId}
      blockId={block.id}
      value={block.text}
      onChange={text => update({ text })}
      placeholder={t.scene.notePlaceholder}
      className="bg-transparent text-sm text-amber-200/80 placeholder-amber-800 resize-none outline-none leading-relaxed min-h-[60px]"
    />
  );
}
