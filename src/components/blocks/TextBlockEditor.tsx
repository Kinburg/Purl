import { useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import type { TextBlock } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { TextInsertToolbar } from '../shared/TextInsertToolbar';
import { LLMGenerateButton } from '../shared/LLMGenerateButton';
import { flattenVariables, flattenAssets } from '../../utils/treeUtils';
import { useVariableNodes } from '../shared/VariableScope';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import {
  CONTENT_BLOCK_FIELD_SCHEMA,
  CONTENT_BLOCK_RAW_CSS_HELP,
  simpleBlockCascadeClasses,
} from '../../utils/styleCascade';

export function TextBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: TextBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<TextBlock>) => void;
}) {
  const { updateBlock, saveSnapshot, project } = useProjectStore();
  const t = useT();
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<TextBlock>) => updateBlock(sceneId, block.id, p as never));
  const vars = flattenVariables(variableNodes);
  const imgAssets = flattenAssets(project.assetNodes).filter(a => a.assetType === 'image');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cascadeClasses = ['tg-text', ...simpleBlockCascadeClasses(block, project.settings)].join(' ');
  // Show preview only when a style override / default actually affects this block —
  // otherwise the textarea above already shows the literal content.
  const hasOverride =
    !!project.settings.defaultBlockStyles?.text?.enabled ||
    !!block.customStyle?.enabled;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <div className="absolute top-1 right-1 z-10 flex gap-0.5">
          <LLMGenerateButton
            sceneId={sceneId}
            blockId={block.id}
            currentValue={block.content}
            onGenerated={text => update({ content: text })}
            onStreaming={text => update({ content: text })}
          />
          <TextInsertToolbar
            targetRef={textareaRef}
            value={block.content}
            onChange={content => update({ content })}
            vars={vars}
            imageAssets={imgAssets}
            variableNodes={variableNodes}
            scenes={project.scenes}
          />
        </div>
        <textarea
          ref={textareaRef}
          className="w-full bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 pr-20 outline-none border border-slate-600 focus:border-indigo-500 min-h-[80px]"
          placeholder={t.textBlock.placeholder}
          value={block.content}
          onFocus={saveSnapshot}
          onChange={e => update({ content: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none mt-0.5">
        <input
          type="checkbox"
          checked={block.live ?? false}
          onChange={e => update({ live: e.target.checked })}
          className="accent-indigo-500 cursor-pointer"
        />
        <span className="text-xs text-slate-400">{t.textBlock.liveUpdateLabel} <span className="font-mono text-slate-500">&lt;&lt;live&gt;&gt;</span></span>
      </label>

      {/* Live preview — only shown when an override is active; otherwise textarea is the visual. */}
      {hasOverride && block.content && (
        <div className="mt-1 pt-1 border-t border-slate-700/40">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Preview</div>
          <div className={cascadeClasses}>
            {block.content}
          </div>
        </div>
      )}

      <details className="border border-slate-700/60 rounded bg-slate-900/30">
        <summary className="text-xs text-slate-300 px-2 py-1.5 cursor-pointer select-none hover:bg-slate-800/50">
          {t.styleOverride.sectionTitle}
        </summary>
        <div className="px-2 pb-2 pt-1">
          <StyleOverrideEditor
            value={block.customStyle}
            onChange={v => update({ customStyle: v })}
            variableNodes={variableNodes}
            allowBound={false}
            fieldsSchema={CONTENT_BLOCK_FIELD_SCHEMA}
            rawCssHelp={CONTENT_BLOCK_RAW_CSS_HELP}
          />
        </div>
      </details>

      <BlockEffectsPanel
        delay={block.delay}
        typewriter={block.typewriter}
        onDelayChange={v => update({ delay: v })}
        onTypewriterChange={v => update({ typewriter: v })}
      />
    </div>
  );
}
