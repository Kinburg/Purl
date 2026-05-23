import { useProjectStore } from '../../store/projectStore';
import type { InventoryBlock } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';

export function InventoryBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: InventoryBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<InventoryBlock>) => void;
}) {
  const project     = useProjectStore(s => s.project);
  const updateBlock = useProjectStore(s => s.updateBlock);
  const update = onUpdate ?? ((p: Partial<InventoryBlock>) => updateBlock(sceneId, block.id, p as never));
  const t = useT();
  const hero = project.characters.find(c => c.isHero);
  const noHero = !hero;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-28 shrink-0">{t.inventoryBlock.charLabel}:</label>
        <select
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer"
          value={block.charId}
          onChange={e => update({ charId: e.target.value })}
        >
          <option value="">{t.inventoryBlock.charNone}</option>
          {project.characters.map(ch => (
            <option key={ch.id} value={ch.id}>
              {ch.name}{ch.isHero ? ' ★' : ''}
            </option>
          ))}
        </select>
      </div>

      {noHero && !block.charId && (
        <span className="text-[11px] text-amber-400/80 italic">{t.inventoryBlock.noHeroHint}</span>
      )}

      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-28 shrink-0">{t.inventoryBlock.titleLabel}:</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          placeholder={t.inventoryBlock.titlePlaceholder}
          value={block.title ?? ''}
          onChange={e => update({ title: e.target.value || undefined })}
        />
      </div>

      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
