import { useMemo, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useDraftValue } from '../../utils/useDraftValue';
import { useVariableNodes } from './VariableScope';
import { useFlatVariablesOf, useFlatAssetsOf } from '../../hooks/useFlatVariables';
import { TextInsertToolbar } from './TextInsertToolbar';
import { LLMGenerateButton } from './LLMGenerateButton';

interface Props {
  sceneId: string;
  blockId: string;
  /** Live value from the block — used as the LLM input and as the textarea source. */
  value: string;
  /** Commit handler (debounced for typing; immediate for AI output / inserts). */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Visual classes for the textarea (bg / border / text / min-height / resize).
   *  Layout classes (`w-full pr-20`) for the floating buttons are added automatically. */
  className?: string;
}

const DEFAULT_TEXTAREA_CLASS =
  'bg-slate-800 text-slate-200 text-sm rounded px-2 py-1.5 outline-none border border-slate-600 focus:border-indigo-500 min-h-[80px]';

/**
 * Shared rich text input: a debounced textarea with the AI-generate button
 * (continue / rephrase / hint / translate + history) and the `$` variable picker /
 * `<>` code-template toolbar floating in the top-right corner. Used by the Text, Callout,
 * Note and Dialogue block editors so they behave identically.
 */
export function RichTextArea({ sceneId, blockId, value, onChange, placeholder, className }: Props) {
  const saveSnapshot  = useProjectStore(s => s.saveSnapshot);
  const assetNodes    = useProjectStore(s => s.project.assetNodes);
  const projectScenes = useProjectStore(s => s.project.scenes);
  const variableNodes = useVariableNodes();
  const vars = useFlatVariablesOf(variableNodes);
  const allAssets = useFlatAssetsOf(assetNodes);
  const imgAssets = useMemo(() => allAssets.filter(a => a.assetType === 'image'), [allAssets]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draft = useDraftValue(value, onChange);

  return (
    <div className="relative">
      <div className="absolute top-1 right-1 z-10 flex gap-0.5">
        <LLMGenerateButton
          sceneId={sceneId}
          blockId={blockId}
          currentValue={value}
          onGenerated={onChange}
          onStreaming={onChange}
        />
        <TextInsertToolbar
          targetRef={textareaRef}
          value={value}
          onChange={onChange}
          vars={vars}
          imageAssets={imgAssets}
          variableNodes={variableNodes}
          scenes={projectScenes}
        />
      </div>
      <textarea
        ref={textareaRef}
        className={`w-full pr-20 ${className ?? DEFAULT_TEXTAREA_CLASS}`}
        placeholder={placeholder}
        value={draft.value}
        onFocus={() => { saveSnapshot(); draft.onFocus(); }}
        onBlur={draft.onBlur}
        onChange={e => draft.set(e.target.value)}
      />
    </div>
  );
}
