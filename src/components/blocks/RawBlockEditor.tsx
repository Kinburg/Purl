import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import type { RawBlock } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { createBuildContext, passageBodyToBlocks } from '../../utils/twee/blockBuilder';
import { toast } from 'sonner';

export function RawBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: RawBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<RawBlock>) => void;
}) {
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const replaceBlock = useProjectStore(s => s.replaceBlock);
  const project      = useProjectStore(s => s.project);
  const t = useT();
  const update = onUpdate ?? ((p: Partial<RawBlock>) => updateBlock(sceneId, block.id, p as never));

  // The recognize action only works for top-level blocks (no onUpdate override),
  // because `replaceBlock` walks `scene.blocks` and can't reach nested branches.
  const canRecognize = !onUpdate;

  const handleRecognize = () => {
    const ctx = createBuildContext([...project.variableNodes]);
    const result = passageBodyToBlocks(block.code, ctx);

    const unchanged =
      result.length === 0 ||
      (result.length === 1 && result[0].type === 'raw');
    if (unchanged) {
      toast.info(t.rawBlock.recognizeNothing);
      return;
    }
    replaceBlock(sceneId, block.id, result, ctx.variableNodes);
    toast.success(t.rawBlock.recognizeSuccess(result.length));
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className="w-full min-h-[80px] bg-slate-800 text-sm text-white font-mono rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 resize-y leading-relaxed"
        placeholder={"<<set $x to 1>>\n<<audio 'theme' play>>\n..."}
        value={block.code}
        onFocus={saveSnapshot}
        onChange={e => update({ code: e.target.value })}
        spellCheck={false}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-600 italic">{t.rawBlock.hint}</span>
        {canRecognize && (
          <button
            type="button"
            onClick={handleRecognize}
            title={t.rawBlock.recognizeTitle}
            className="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-300 hover:text-white hover:border-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer shrink-0"
          >
            {t.rawBlock.recognizeButton}
          </button>
        )}
      </div>
      <BlockEffectsPanel
        delay={block.delay}
        onDelayChange={v => update({ delay: v })}
      />
    </div>
  );
}
