import { useState, useEffect } from 'react';
import { useProjectStore, deepCloneBlock } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useT } from '../../i18n';
import { toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import type { DialogueBlock } from '../../types';
import { BlockEffectsPanel } from './BlockEffectsPanel';
import { RichTextArea } from '../shared/RichTextArea';
import { StyleOverrideEditor } from '../shared/StyleOverrideEditor';
import { DIALOGUE_FIELD_SCHEMA, DIALOGUE_RAW_CSS_HELP } from '../../utils/styleCascade';
import { useVariableNodes } from '../shared/VariableScope';
import { EmojiIcon } from '../shared/EmojiIcons';
import { dialogueElementClasses, buildDialogueSpotStyleBlock } from '../../utils/styleCascade';
import { NestedBlockList } from './NestedBlockList';

/**
 * Converts an avatar src value to a URL the editor renderer can actually load:
 * - External http(s):// and data: URIs — used as-is
 * - Already-resolved localfile:// URLs — used as-is
 * - Relative asset paths (e.g. "assets/chars/hero.png") — converted to
 *   localfile:// using the project directory from the Electron store
 * - Relative path with no projectDir (project not yet saved) — returns ''
 *   so the editor falls back to the 👤 placeholder gracefully
 */
function resolveEditorSrc(src: string, projectDir: string | null): string {
  if (!src) return '';
  if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('localfile://')) {
    return src;
  }
  if (projectDir) {
    return toLocalFileUrl(resolveAssetPath(projectDir, src));
  }
  return ''; // can't resolve local path without projectDir
}

// ─── Inner blocks section ──────────────────────────────────────────────────────
// Uses the shared NestedBlockList (drag / add / edit / delete / duplicate); the
// dialogue-specific type policy (no dialogue/condition/choice/button/input-field)
// is enforced centrally via containerKind='dialogue'.

function InnerBlocksList({
  block,
  sceneId,
}: {
  block: DialogueBlock;
  sceneId: string;
}) {
  const addDialogueInnerBlock      = useProjectStore(s => s.addDialogueInnerBlock);
  const updateDialogueInnerBlock   = useProjectStore(s => s.updateDialogueInnerBlock);
  const deleteDialogueInnerBlock   = useProjectStore(s => s.deleteDialogueInnerBlock);
  const reorderDialogueInnerBlocks = useProjectStore(s => s.reorderDialogueInnerBlocks);
  const copyToClipboard            = useEditorStore(s => s.copyToClipboard);
  const t = useT();

  const innerBlocks = block.innerBlocks ?? [];

  const handleDuplicate = (id: string) => {
    const idx = innerBlocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const next = [...innerBlocks];
    next.splice(idx + 1, 0, deepCloneBlock(innerBlocks[idx]));
    reorderDialogueInnerBlocks(sceneId, block.id, next);
  };

  return (
    <div className="flex flex-col gap-1 mt-1">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">
          {t.dialogueBlock.innerBlocksLabel}
        </span>
        <div className="flex-1 h-px bg-slate-700/60" />
      </div>

      <NestedBlockList
        sceneId={sceneId}
        containerId={block.id}
        containerKind="dialogue"
        blocks={innerBlocks}
        onAdd={nb => addDialogueInnerBlock(sceneId, block.id, nb)}
        onUpdate={(id, patch) => updateDialogueInnerBlock(sceneId, block.id, id, patch)}
        onDelete={id => deleteDialogueInnerBlock(sceneId, block.id, id)}
        onDuplicate={handleDuplicate}
        onCopy={b => copyToClipboard(deepCloneBlock(b))}
        onPaste={src => addDialogueInnerBlock(sceneId, block.id, deepCloneBlock(src))}
      />
    </div>
  );
}

// ─── Main editor ───────────────────────────────────────────────────────────────

export function DialogueBlockEditor({
  block,
  sceneId,
  onUpdate,
}: {
  block: DialogueBlock;
  sceneId: string;
  onUpdate?: (patch: Partial<DialogueBlock>) => void;
}) {
  const updateBlock  = useProjectStore(s => s.updateBlock);
  const saveSnapshot = useProjectStore(s => s.saveSnapshot);
  const projectDir   = useProjectStore(s => s.projectDir);
  const characters   = useProjectStore(s => s.project.characters);
  const t = useT();
  const variableNodes = useVariableNodes();
  const update = onUpdate ?? ((p: Partial<DialogueBlock>) => updateBlock(sceneId, block.id, p as never));

  const selectedChar = characters.find(c => c.id === block.characterId);
  const align = block.align ?? 'left';
  const isRight = align === 'right';

  // Derive avatar preview source from avatarConfig (fallback to deprecated avatarUrl)
  const avatarCfg = selectedChar?.avatarConfig;
  const isBoundAvatar = avatarCfg?.mode === 'bound';
  const rawSrc = isBoundAvatar
    ? ''   // can't show a dynamic image in the editor
    : (avatarCfg?.src ?? selectedChar?.avatarUrl ?? '');
  const avatarPreviewSrc = resolveEditorSrc(rawSrc, projectDir);

  // Track if the resolved URL fails to load (e.g. file was deleted, bad URL, etc.)
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [avatarPreviewSrc]);

  const showImg       = Boolean(avatarPreviewSrc) && !imgFailed;
  const showBound     = !showImg && Boolean(selectedChar) && isBoundAvatar;
  const showNoAvatar  = !showImg && Boolean(selectedChar) && !isBoundAvatar;

  // Build preview class list + spot <style> snippet matching the export.
  // For bound common-custom, the preview shows the default variant (no runtime swap).
  const previewClasses = selectedChar
    ? dialogueElementClasses(selectedChar, block).join(' ')
    : 'dialogue';
  const spotStyleBlock = selectedChar ? buildDialogueSpotStyleBlock(block) : '';

  return (
    <div className="flex flex-col gap-2">

      {/* Character selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.dialogueBlock.characterLabel}</label>
        <select
          className="flex-1 bg-slate-800 text-slate-200 text-sm rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none cursor-pointer"
          value={block.characterId}
          onChange={e => update({ characterId: e.target.value })}
        >
          <option value="">{t.dialogueBlock.selectChar}</option>
          {characters.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {characters.length === 0 && (
          <span className="text-xs text-slate-500 italic">{t.dialogueBlock.noCharacters}</span>
        )}
      </div>

      {/* Alignment toggle */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.dialogueBlock.sideLabel}</label>
        <div className="flex gap-1">
          <button
            className={`text-xs px-3 py-1 rounded border transition-colors cursor-pointer ${
              !isRight
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
            }`}
            onClick={() => update({ align: 'left' })}
          >
            {t.dialogueBlock.sideLeft}
          </button>
          <button
            className={`text-xs px-3 py-1 rounded border transition-colors cursor-pointer ${
              isRight
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
            }`}
            onClick={() => update({ align: 'right' })}
          >
            {t.dialogueBlock.sideRight}
          </button>
        </div>
      </div>

      {/* Name suffix */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.dialogueBlock.nameSuffixLabel}</label>
        <input
          className="flex-1 bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:border-indigo-500 outline-none placeholder-slate-600"
          placeholder={t.dialogueBlock.nameSuffixPlaceholder}
          value={block.nameSuffix ?? ''}
          onFocus={saveSnapshot}
          onChange={e => update({ nameSuffix: e.target.value })}
        />
      </div>

      {/* Live update toggle */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 w-20 shrink-0">{t.dialogueBlock.liveUpdateLabel}</label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={block.live ?? false}
            onChange={e => update({ live: e.target.checked })}
            className="accent-indigo-500 cursor-pointer"
          />
          <span className="text-xs text-slate-400">{t.dialogueBlock.liveUpdateDesc} <span className="font-mono text-slate-500">&lt;&lt;live&gt;&gt;</span></span>
        </label>
      </div>

      {/* Dialogue preview — uses the same CSS classes + spot <style> as the exported story */}
      {spotStyleBlock && (
        <div dangerouslySetInnerHTML={{ __html: spotStyleBlock }} />
      )}
      <div className={`${previewClasses}${isRight ? ' dlg-right' : ''}`}>
        {/* Avatar thumbnail — keep editor size (40×40) regardless of story CSS */}
        {showImg && (
          <img
            src={avatarPreviewSrc}
            className="char-avatar object-cover"
            style={{ width: 40, height: 40 }}
            alt=""
            onError={() => setImgFailed(true)}
          />
        )}
        {showBound && (
          <div
            className="char-avatar bg-slate-700 flex items-center justify-center text-slate-500 text-xs"
            style={{ width: 40, height: 40 }}
            title={t.dialogueBlock.dynamicAvatarTitle}
          >
            <EmojiIcon name="chart" size={20} />
          </div>
        )}
        {showNoAvatar && (
          <div
            className="char-avatar bg-slate-700 flex items-center justify-center text-slate-500 text-xs"
            style={{ width: 40, height: 40 }}
          >
            <EmojiIcon name="person" size={20} />
          </div>
        )}

        {/* Body */}
        <div className="char-body relative" style={selectedChar ? undefined : { flex: 1 }}>
          {selectedChar && (
            <span className="char-name text-xs">
              {selectedChar.name}{block.nameSuffix ? ` (${block.nameSuffix})` : ''}
            </span>
          )}
          <RichTextArea
            sceneId={sceneId}
            blockId={block.id}
            value={block.text}
            onChange={text => update({ text })}
            placeholder={t.dialogueBlock.linePlaceholder}
            className="char-text bg-transparent rounded outline-none min-h-[60px] placeholder-slate-500"
          />
        </div>
      </div>

      {/* Inner blocks — only when not used as a nested block inside a condition
          (onUpdate is set when called from ConditionBlockEditor) */}
      {!onUpdate && (
        <InnerBlocksList block={block} sceneId={sceneId} />
      )}

      {/* Spot-level style override (static only — bound is at character level) */}
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
            fieldsSchema={DIALOGUE_FIELD_SCHEMA}
            rawCssHelp={DIALOGUE_RAW_CSS_HELP}
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
