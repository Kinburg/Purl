// ─── Shared nested-block editor switch ─────────────────────────────────────────
//
// The single dispatcher used by every block CONTAINER (condition branches, tabs,
// sections, for-bodies, dialogue bubbles, table cells) to render a nested block's
// editor. Covers EVERY block type — the export already supports any block inside a
// branch/tab/section/etc., so nesting is only gated by per-container policy
// (see blockTree.containerAccepts), never by "this editor can't render nested".
//
// Heavy / rarely-nested editors (media-gen, entity, plugin) are lazy-loaded so this
// module (which is eager, pulled in by NestedBlockList) doesn't drag them into the
// main chunk. Mutations bubble up via `onUpdate` — every editor honors the
// `onUpdate ?? updateBlock` pattern, so nested edits persist through the parent.

import { lazy, Suspense } from 'react';
import { useT } from '../../i18n';
import type {
  Block,
  TextBlock, DialogueBlock, ChoiceBlock, ConditionBlock, VariableSetBlock, SetObjectBlock, ForBlock,
  ImageBlock, VideoBlock, ButtonBlock, LinkBlock, MenuLinkBlock, FunctionBlock, PopupBlock,
  AudioBlock, RawBlock, TableBlock, IncludeBlock, DividerBlock, SpacerBlock, SectionBlock, ProgressBlock,
  AudioVolumeBlock, DateTimeBlock, CalloutBlock, SelectBlock, SliderBlock, DisplayObjectBlock,
  CheckboxBlock, RadioBlock, InputFieldBlock, NoteBlock, SaveBlock, TabsBlock,
  ImageGenBlock, AudioGenBlock, VideoGenBlock, PaperdollBlock, InventoryBlock, ContainerBlock,
  TimeManipulationBlock, SetQuestStateBlock, ShowQuestsBlock, PluginBlock,
} from '../../types';

import { TextBlockEditor } from './TextBlockEditor';
import { DialogueBlockEditor } from './DialogueBlockEditor';
import { ChoiceBlockEditor } from './ChoiceBlockEditor';
import { ConditionBlockEditor } from './ConditionBlockEditor';
import { VariableSetBlockEditor } from './VariableSetBlockEditor';
import { SetObjectBlockEditor } from './SetObjectBlockEditor';
import { ForBlockEditor } from './ForBlockEditor';
import { ImageBlockEditor } from './ImageBlockEditor';
import { VideoBlockEditor } from './VideoBlockEditor';
import { ButtonBlockEditor } from './ButtonBlockEditor';
import { LinkBlockEditor } from './LinkBlockEditor';
import { MenuLinkBlockEditor } from './MenuLinkBlockEditor';
import { SpacerBlockEditor } from './SpacerBlockEditor';
import { SectionBlockEditor } from './SectionBlockEditor';
import { ProgressBlockEditor } from './ProgressBlockEditor';
import { AudioVolumeBlockEditor } from './AudioVolumeBlockEditor';
import { DateTimeBlockEditor } from './DateTimeBlockEditor';
import { CalloutBlockEditor } from './CalloutBlockEditor';
import { SelectBlockEditor } from './SelectBlockEditor';
import { SliderBlockEditor } from './SliderBlockEditor';
import { DisplayObjectBlockEditor } from './DisplayObjectBlockEditor';
import { FunctionBlockEditor } from './FunctionBlockEditor';
import { PopupBlockEditor } from './PopupBlockEditor';
import { AudioBlockEditor } from './AudioBlockEditor';
import { RawBlockEditor } from './RawBlockEditor';
import { TableBlockEditor } from './TableBlockEditor';
import { IncludeBlockEditor } from './IncludeBlockEditor';
import { DividerBlockEditor } from './DividerBlockEditor';
import { CheckboxBlockEditor } from './CheckboxBlockEditor';
import { RadioBlockEditor } from './RadioBlockEditor';
import { InputFieldBlockEditor } from './InputFieldBlockEditor';
import { NoteBlockEditor } from './NoteBlockEditor';
import { SaveBlockEditor } from './SaveBlockEditor';
import { TabsBlockEditor } from './TabsBlockEditor';
import { TimeManipulationBlockEditor } from './TimeManipulationBlockEditor';

// Heavy / rarely-nested editors — lazy so they don't bloat the eager chunk.
const ImageGenBlockEditor   = lazy(() => import('./ImageGenBlockEditor').then(m => ({ default: m.ImageGenBlockEditor })));
const AudioGenBlockEditor   = lazy(() => import('./AudioGenBlockEditor').then(m => ({ default: m.AudioGenBlockEditor })));
const VideoGenBlockEditor   = lazy(() => import('./VideoGenBlockEditor').then(m => ({ default: m.VideoGenBlockEditor })));
const PaperdollBlockEditor  = lazy(() => import('./PaperdollBlockEditor').then(m => ({ default: m.PaperdollBlockEditor })));
const InventoryBlockEditor  = lazy(() => import('./InventoryBlockEditor').then(m => ({ default: m.InventoryBlockEditor })));
const ContainerBlockEditor  = lazy(() => import('./ContainerBlockEditor').then(m => ({ default: m.ContainerBlockEditor })));
const PluginBlockEditor     = lazy(() => import('./PluginBlockEditor').then(m => ({ default: m.PluginBlockEditor })));
const QuestSetBlockEditor   = lazy(() => import('./QuestSetBlockEditor').then(m => ({ default: m.QuestSetBlockEditor })));
const ShowQuestsBlockEditor = lazy(() => import('./ShowQuestsBlockEditor').then(m => ({ default: m.ShowQuestsBlockEditor })));

export function InnerBlockEditor({
  block, sceneId, onUpdate,
}: {
  block: Block;
  sceneId: string;
  onUpdate: (patch: Partial<Block>) => void;
}) {
  const t = useT();
  const el = (() => {
    switch (block.type) {
      case 'text':         return <TextBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TextBlock>) => void} />;
      case 'dialogue':     return <DialogueBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DialogueBlock>) => void} />;
      case 'choice':       return <ChoiceBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ChoiceBlock>) => void} />;
      case 'condition':    return <ConditionBlockEditor    block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ConditionBlock>) => void} />;
      case 'variable-set': return <VariableSetBlockEditor  block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<VariableSetBlock>) => void} />;
      case 'set-object':   return <SetObjectBlockEditor    block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SetObjectBlock>) => void} />;
      case 'for':          return <ForBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ForBlock>) => void} />;
      case 'image':        return <ImageBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ImageBlock>) => void} />;
      case 'image-gen':    return <ImageGenBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ImageGenBlock>) => void} />;
      case 'video':        return <VideoBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<VideoBlock>) => void} />;
      case 'video-gen':    return <VideoGenBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<VideoGenBlock>) => void} />;
      case 'button':       return <ButtonBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ButtonBlock>) => void} />;
      case 'link':         return <LinkBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<LinkBlock>) => void} />;
      case 'menu-link':    return <MenuLinkBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<MenuLinkBlock>) => void} />;
      case 'function':     return <FunctionBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<FunctionBlock>) => void} />;
      case 'popup':        return <PopupBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<PopupBlock>) => void} />;
      case 'audio':        return <AudioBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<AudioBlock>) => void} />;
      case 'audio-gen':    return <AudioGenBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<AudioGenBlock>) => void} />;
      case 'raw':          return <RawBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<RawBlock>) => void} />;
      case 'table':        return <TableBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TableBlock>) => void} />;
      case 'include':      return <IncludeBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<IncludeBlock>) => void} />;
      case 'divider':      return <DividerBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DividerBlock>) => void} />;
      case 'spacer':       return <SpacerBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SpacerBlock>) => void} />;
      case 'section':      return <SectionBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SectionBlock>) => void} />;
      case 'progress':     return <ProgressBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ProgressBlock>) => void} />;
      case 'audio-volume': return <AudioVolumeBlockEditor   block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<AudioVolumeBlock>) => void} />;
      case 'date-time':    return <DateTimeBlockEditor      block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DateTimeBlock>) => void} />;
      case 'callout':      return <CalloutBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<CalloutBlock>) => void} />;
      case 'save':         return <SaveBlockEditor          block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SaveBlock>) => void} />;
      case 'select':       return <SelectBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SelectBlock>) => void} />;
      case 'slider':       return <SliderBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SliderBlock>) => void} />;
      case 'display-object': return <DisplayObjectBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<DisplayObjectBlock>) => void} />;
      case 'checkbox':     return <CheckboxBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<CheckboxBlock>) => void} />;
      case 'radio':        return <RadioBlockEditor        block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<RadioBlock>) => void} />;
      case 'input-field':  return <InputFieldBlockEditor   block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<InputFieldBlock>) => void} />;
      case 'note':         return <NoteBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<NoteBlock>) => void} />;
      case 'tabs':         return <TabsBlockEditor         block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TabsBlock>) => void} />;
      case 'paperdoll':    return <PaperdollBlockEditor    block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<PaperdollBlock>) => void} />;
      case 'inventory':    return <InventoryBlockEditor    block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<InventoryBlock>) => void} />;
      case 'container':    return <ContainerBlockEditor    block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ContainerBlock>) => void} />;
      case 'time-manipulation': return <TimeManipulationBlockEditor block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<TimeManipulationBlock>) => void} />;
      case 'quest-set':    return <QuestSetBlockEditor     block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<SetQuestStateBlock>) => void} />;
      case 'quest-show':   return <ShowQuestsBlockEditor   block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<ShowQuestsBlock>) => void} />;
      case 'plugin':       return <PluginBlockEditor       block={block} sceneId={sceneId} onUpdate={onUpdate as (p: Partial<PluginBlock>) => void} />;
      default:             return <span className="text-xs text-slate-500">{t.block.unsupportedNested}</span>;
    }
  })();
  return <Suspense fallback={<div className="text-xs text-slate-500 italic py-1">…</div>}>{el}</Suspense>;
}
