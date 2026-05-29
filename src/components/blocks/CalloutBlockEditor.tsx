import { useProjectStore } from '../../store/projectStore';
import type { CalloutBlock, CalloutVariant } from '../../types';
import { useT } from '../../i18n';
import { BlockEffectsPanel } from './BlockEffectsPanel';

const VARIANTS: CalloutVariant[] = ['info', 'success', 'warning', 'danger', 'note'];
const VARIANT_ACCENT: Record<CalloutVariant, string> = {
  info: '#3b82f6', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444', note: '#94a3b8',
};

export function CalloutBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: CalloutBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<CalloutBlock>) => void;
}) {
  const t = useT();
  const cb = t.calloutBlock;
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const update = onUpdate ?? ((p: Partial<CalloutBlock>) => updateBlock(sceneId, block.id, p));

  const accent = VARIANT_ACCENT[block.variant];

  return (
    <div className="flex flex-col gap-2.5">
      {/* Variant */}
      <div className="flex items-start gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0 pt-1">{cb.variantLabel}</label>
        <div className="flex flex-wrap gap-1">
          {VARIANTS.map(v => (
            <button
              key={v}
              className={`px-2 py-1 rounded text-xs cursor-pointer border transition-colors ${block.variant === v ? 'text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:text-white'}`}
              style={block.variant === v ? { background: VARIANT_ACCENT[v], borderColor: VARIANT_ACCENT[v] } : undefined}
              onClick={() => update({ variant: v })}
            >
              {cb.variants[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Icon */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{cb.iconLabel}</label>
        <input
          className="w-24 bg-slate-800 text-sm text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none text-center"
          placeholder={cb.iconPlaceholder}
          value={block.icon ?? ''}
          onFocus={saveSnapshot}
          onChange={e => update({ icon: e.target.value })}
        />
      </div>

      {/* Title */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{cb.titleLabel}</label>
        <input
          className="flex-1 bg-slate-800 text-sm text-white rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none"
          placeholder={cb.titlePlaceholder}
          value={block.title ?? ''}
          onFocus={saveSnapshot}
          onChange={e => update({ title: e.target.value })}
        />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">{cb.contentLabel}</label>
        <textarea
          className="w-full min-h-[64px] bg-slate-800 text-sm text-white rounded px-2 py-1.5 border border-slate-600 focus:border-indigo-500 outline-none resize-y leading-relaxed"
          value={block.content}
          onFocus={saveSnapshot}
          onChange={e => update({ content: e.target.value })}
        />
      </div>

      {/* Live preview */}
      <div className="rounded px-2.5 py-2 text-sm flex gap-2" style={{ borderLeft: `3px solid ${accent}`, background: `${accent}1f` }}>
        {block.icon && <span className="shrink-0 leading-relaxed">{block.icon}</span>}
        <div className="min-w-0">
          {block.title && <div className="font-semibold">{block.title}</div>}
          <div className="text-slate-200 whitespace-pre-wrap break-words">
            {block.content || <em className="text-slate-500">{cb.contentPlaceholder}</em>}
          </div>
        </div>
      </div>

      <BlockEffectsPanel delay={block.delay} onDelayChange={v => update({ delay: v })} />
    </div>
  );
}
