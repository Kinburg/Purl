import { useState, useMemo } from 'react';

import { EmojiIcon } from './EmojiIcons';
// Style names are always English (they go directly into the generation prompt)
const DEFAULT_PRESET_STYLES = [
  'Anime',
  'Realistic',
  'Watercolor',
  'Oil Painting',
  'Digital Art',
  'Pixel Art',
  'Comic',
  'Sketch',
  'Cinematic',
  'Fantasy',
];

interface PresetGroup {
  /** Localized header text shown above the chip row. */
  label: string;
  items: string[];
}

interface CommonProps {
  label: string;
  customPlaceholder: string;
  addBtn: string;
  presets?: string[];
  presetGroups?: PresetGroup[];
}

/**
 * Toggle mode (default): chips have a "selected" state stored in `value`.
 * Clicking a chip adds/removes it from the array. Custom chips appear as
 * removable bubbles under the preset rows.
 */
interface ToggleModeProps extends CommonProps {
  mode?: 'toggle';
  value: string[];
  onChange: (v: string[]) => void;
}

/**
 * Insert mode: chips trigger an `onInsert(chip)` callback. The caller decides
 * what to do — typically append to a textarea (or remove on second click, if
 * `isSelected` is provided to drive the highlight).
 *
 * Provide `isSelected` to make chips reflect external state (e.g. "is this
 * chip text already present in the target textarea?"). When `isSelected(chip)`
 * is true, the chip renders with the highlighted style; the caller's
 * `onInsert` should treat that case as a removal.
 */
interface InsertModeProps extends CommonProps {
  mode: 'insert';
  onInsert: (chip: string) => void;
  isSelected?: (chip: string) => boolean;
}

type Props = ToggleModeProps | InsertModeProps;

export function StyleChipsEditor(props: Props) {
  const { label, customPlaceholder, addBtn, presets, presetGroups } = props;
  const [customInput, setCustomInput] = useState('');

  const allPresetValues = useMemo<string[]>(() => {
    if (presetGroups && presetGroups.length > 0) return presetGroups.flatMap(g => g.items);
    return presets ?? DEFAULT_PRESET_STYLES;
  }, [presets, presetGroups]);

  const flatPresetList = presets ?? DEFAULT_PRESET_STYLES;
  const isInsert = props.mode === 'insert';

  // ── Handlers split by mode ────────────────────────────────────────────────
  const onChipClick = (chip: string) => {
    if (isInsert) {
      props.onInsert(chip);
    } else {
      const { value, onChange } = props;
      if (value.includes(chip)) onChange(value.filter(s => s !== chip));
      else onChange([...value, chip]);
    }
  };

  const onCustomSubmit = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (isInsert) {
      props.onInsert(trimmed);
    } else {
      const { value, onChange } = props;
      if (!value.includes(trimmed)) onChange([...value, trimmed]);
    }
    setCustomInput('');
  };

  // Selection highlight:
  // - toggle mode: chip is in the value[] array
  // - insert mode: optional `isSelected` predicate (driven by external state,
  //   e.g. "is this chip text already a token in the target textarea?")
  const isSelected = (chip: string): boolean => {
    if (isInsert) return props.isSelected?.(chip) ?? false;
    return props.value.includes(chip);
  };
  const customStyles = isInsert ? [] : props.value.filter(s => !allPresetValues.includes(s));

  const renderChip = (chip: string) => (
    <button
      key={chip}
      type="button"
      onClick={() => onChipClick(chip)}
      className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer transition-colors ${
        isSelected(chip)
          ? 'bg-indigo-600 border-indigo-500 text-white'
          : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
      }`}
    >
      {chip}
    </button>
  );

  return (
    <div className="flex items-start gap-2">
      <label className="text-xs text-slate-400 w-20 shrink-0 pt-1">{label}</label>
      <div className="flex-1 flex flex-col gap-1.5">
        {/* Preset chips — grouped or flat */}
        {presetGroups && presetGroups.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {presetGroups.map(group => (
              <div key={group.label} className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-wider text-slate-500">{group.label}</span>
                <div className="flex flex-wrap gap-1">
                  {group.items.map(renderChip)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {flatPresetList.map(renderChip)}
          </div>
        )}

        {/* Custom chips + input — toggle mode shows removable bubbles; insert mode is input-only */}
        <div className="flex items-center gap-1 flex-wrap">
          {customStyles.map(chip => (
            <span
              key={chip}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-indigo-700/60 border border-indigo-600 text-indigo-200"
            >
              {chip}
              <button
                type="button"
                className="text-indigo-400 hover:text-white leading-none cursor-pointer"
                onClick={() => {
                  if (!isInsert) props.onChange(props.value.filter(s => s !== chip));
                }}
              >
                <EmojiIcon name="close" size={20} />
              </button>
            </span>
          ))}
          <input
            className="bg-slate-800 text-xs text-white rounded px-2 py-0.5 outline-none border border-slate-600 focus:border-indigo-500 w-32"
            placeholder={customPlaceholder}
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCustomSubmit(); } }}
          />
          <button
            type="button"
            className="px-2 py-0.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer border border-slate-600"
            onClick={onCustomSubmit}
          >
            {addBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
