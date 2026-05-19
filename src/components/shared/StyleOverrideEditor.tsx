import { useState } from 'react';
import type {
  BlockStyleOverride, StyleMappingEntry, StyleMode, VariableTreeNode,
} from '../../types';
import type { StyleFieldDescriptor, StyleRawCssHelp } from '../../utils/styleCascade';
import { useT } from '../../i18n';
import { ColorSwatchInput, INPUT_CLS } from './ModalShell';
import { VariablePicker } from './VariablePicker';

/**
 * Shared editor for a `BlockStyleOverride`. Schema-driven — accepts a
 * `fieldsSchema` prop that describes the editable fields for the current block
 * type (dialogue colors / button family / future block types).
 *
 * Used in:
 *   - CharacterModal           (per-character common-custom dialogue style)
 *   - DialogueBlockEditor      (per-block spot custom dialogue style)
 *   - ButtonBlockEditor etc.   (per-block spot custom button-family style)
 *   - ProjectSettingsModal     (per-block-type common-custom in Block Defaults tab)
 */

type StyleFieldValue = string | number | boolean;

function emptyOverride(): BlockStyleOverride {
  return { enabled: false, mode: 'static', fields: {}, rawCss: '' };
}

function setFieldValue(
  fields: Record<string, StyleFieldValue> | undefined,
  key: string,
  value: StyleFieldValue | undefined,
): Record<string, StyleFieldValue> {
  const next = { ...(fields ?? {}) };
  if (value === undefined || value === '') delete next[key];
  else next[key] = value;
  return next;
}

interface Props {
  value: BlockStyleOverride | undefined;
  onChange: (value: BlockStyleOverride | undefined) => void;
  variableNodes: VariableTreeNode[];
  /** Disable bound mode (only allowed at common-custom layer). */
  allowBound?: boolean;
  /**
   * Schema describing editable structured fields. Pass empty array (or omit)
   * when the block has no structured override fields — the FieldsEditor will
   * be hidden and only RawCssEditor will be shown (Divider use case).
   */
  fieldsSchema?: ReadonlyArray<StyleFieldDescriptor>;
  /** Optional content for the raw-CSS help <details> panel. */
  rawCssHelp?: StyleRawCssHelp;
}

export function StyleOverrideEditor({
  value, onChange, variableNodes, allowBound = true, fieldsSchema = [], rawCssHelp,
}: Props) {
  const t = useT();
  const tt = t.styleOverride as any;
  const v = value ?? emptyOverride();
  const enabled = v.enabled;
  const mode: StyleMode = v.mode ?? 'static';

  const patch = (p: Partial<BlockStyleOverride>) => onChange({ ...v, ...p });

  const reset = () => onChange(undefined);

  return (
    <div className="flex flex-col gap-2 text-xs">
      {/* Master toggle */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-indigo-500 cursor-pointer"
            checked={enabled}
            onChange={e => patch({ enabled: e.target.checked })}
          />
          <span className="text-sm text-slate-200 font-medium">{tt.enable}</span>
        </label>
        {enabled && (
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
          >
            {tt.reset}
          </button>
        )}
      </div>

      {!enabled && (
        <p className="text-[11px] text-slate-500 leading-relaxed">{tt.enableNote}</p>
      )}

      {enabled && (
        <div className="border border-slate-700/60 rounded p-3 flex flex-col gap-3 bg-slate-900/30">
          {/* Mode selector */}
          {allowBound && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={`flex-1 text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                  mode === 'static'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                }`}
                onClick={() => patch({ mode: 'static' })}
              >
                {tt.modeStatic}
              </button>
              <button
                type="button"
                className={`flex-1 text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                  mode === 'bound'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                }`}
                onClick={() => patch({ mode: 'bound' })}
              >
                {tt.modeBound}
              </button>
            </div>
          )}

          {mode === 'static' && (
            <StaticEditor
              fields={v.fields}
              rawCss={v.rawCss ?? ''}
              fieldsSchema={fieldsSchema}
              rawCssHelp={rawCssHelp}
              onFieldsChange={fields => patch({ fields })}
              onRawCssChange={rawCss => patch({ rawCss })}
            />
          )}

          {mode === 'bound' && allowBound && (
            <BoundEditor
              variableId={v.variableId ?? ''}
              mapping={v.mapping ?? []}
              defaultFields={v.defaultFields}
              defaultRawCss={v.defaultRawCss ?? ''}
              variableNodes={variableNodes}
              fieldsSchema={fieldsSchema}
              rawCssHelp={rawCssHelp}
              onVariableChange={variableId => patch({ variableId })}
              onMappingChange={mapping => patch({ mapping })}
              onDefaultFieldsChange={defaultFields => patch({ defaultFields })}
              onDefaultRawCssChange={defaultRawCss => patch({ defaultRawCss })}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Static-mode editor ──────────────────────────────────────────────────────

function StaticEditor({
  fields, rawCss, fieldsSchema, rawCssHelp, onFieldsChange, onRawCssChange,
}: {
  fields: Record<string, StyleFieldValue> | undefined;
  rawCss: string;
  fieldsSchema: ReadonlyArray<StyleFieldDescriptor>;
  rawCssHelp?: StyleRawCssHelp;
  onFieldsChange: (fields: Record<string, StyleFieldValue>) => void;
  onRawCssChange: (rawCss: string) => void;
}) {
  const t = useT();
  const tt = t.styleOverride as any;
  return (
    <>
      <FieldsEditor fields={fields} schema={fieldsSchema} onChange={onFieldsChange} />
      <RawCssEditor value={rawCss} onChange={onRawCssChange} help={rawCssHelp} />
      <p className="text-[10px] text-slate-500 leading-relaxed">{tt.rawCssScopedNote}</p>
    </>
  );
}

// ─── Bound-mode editor ───────────────────────────────────────────────────────

function BoundEditor({
  variableId, mapping, defaultFields, defaultRawCss, variableNodes, fieldsSchema, rawCssHelp,
  onVariableChange, onMappingChange, onDefaultFieldsChange, onDefaultRawCssChange,
}: {
  variableId: string;
  mapping: StyleMappingEntry[];
  defaultFields: Record<string, StyleFieldValue> | undefined;
  defaultRawCss: string;
  variableNodes: VariableTreeNode[];
  fieldsSchema: ReadonlyArray<StyleFieldDescriptor>;
  rawCssHelp?: StyleRawCssHelp;
  onVariableChange: (id: string) => void;
  onMappingChange: (mapping: StyleMappingEntry[]) => void;
  onDefaultFieldsChange: (fields: Record<string, StyleFieldValue>) => void;
  onDefaultRawCssChange: (rawCss: string) => void;
}) {
  const t = useT();
  const tt = t.styleOverride as any;

  const addVariant = () => {
    const entry: StyleMappingEntry = {
      id: crypto.randomUUID(),
      matchType: 'exact',
      value: '',
      fields: {},
      rawCss: '',
    };
    onMappingChange([...mapping, entry]);
  };

  const updateVariant = (idx: number, patch: Partial<StyleMappingEntry>) => {
    onMappingChange(mapping.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const deleteVariant = (idx: number) => {
    onMappingChange(mapping.filter((_, i) => i !== idx));
  };

  const moveVariant = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= mapping.length) return;
    const next = mapping.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onMappingChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Variable picker */}
      <div>
        <label className="block text-[11px] text-slate-400 mb-1">{tt.bindVariableLabel}</label>
        <VariablePicker
          value={variableId}
          onChange={onVariableChange}
          nodes={variableNodes}
          placeholder={tt.bindVariableEmpty}
          filterType="number"
        />
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">{tt.modeBoundNote}</p>

      {/* Variants */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">
            {tt.variants}
          </span>
          <span className="text-[10px] text-slate-500">— {tt.variantConditionHint}</span>
        </div>

        <div className="flex flex-col gap-2">
          {mapping.length === 0 && (
            <p className="text-[11px] text-slate-500 italic">{tt.variantEmpty}</p>
          )}
          {mapping.map((entry, idx) => (
            <VariantRow
              key={entry.id}
              entry={entry}
              fieldsSchema={fieldsSchema}
              rawCssHelp={rawCssHelp}
              onChange={p => updateVariant(idx, p)}
              onDelete={() => deleteVariant(idx)}
              onMoveUp={idx > 0 ? () => moveVariant(idx, -1) : undefined}
              onMoveDown={idx < mapping.length - 1 ? () => moveVariant(idx, 1) : undefined}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addVariant}
          className="mt-2 text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
        >
          {tt.variantAdd}
        </button>
      </div>

      {/* Default variant */}
      <div className="pt-2 border-t border-slate-700/40">
        <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">
          {tt.variantDefault}
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed mb-2">{tt.variantDefaultNote}</p>
        <FieldsEditor fields={defaultFields} schema={fieldsSchema} onChange={onDefaultFieldsChange} />
        <RawCssEditor value={defaultRawCss} onChange={onDefaultRawCssChange} help={rawCssHelp} />
      </div>
    </div>
  );
}

// ─── Variant row (one entry in the bound mapping) ───────────────────────────

function VariantRow({
  entry, fieldsSchema, rawCssHelp, onChange, onDelete, onMoveUp, onMoveDown,
}: {
  entry: StyleMappingEntry;
  fieldsSchema: ReadonlyArray<StyleFieldDescriptor>;
  rawCssHelp?: StyleRawCssHelp;
  onChange: (p: Partial<StyleMappingEntry>) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const t = useT();
  const tt = t.styleOverride as any;
  const [expanded, setExpanded] = useState(true);

  const isRange = entry.matchType === 'range';

  return (
    <div className="border border-slate-700/60 rounded bg-slate-800/30">
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          className="text-slate-500 hover:text-slate-300 cursor-pointer w-4 text-xs"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? '▾' : '▸'}
        </button>

        {/* Match type toggle */}
        <div className="flex gap-0.5">
          <button
            type="button"
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
              !isRange
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => onChange({ matchType: 'exact' })}
          >
            {tt.variantMatchExact}
          </button>
          <button
            type="button"
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
              isRange
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => onChange({ matchType: 'range' })}
          >
            {tt.variantMatchRange}
          </button>
        </div>

        {/* Match inputs */}
        {!isRange && (
          <input
            type="number"
            className={INPUT_CLS + ' w-20 text-xs'}
            placeholder={tt.variantMatchValue}
            value={entry.value ?? ''}
            onChange={e => onChange({ value: e.target.value })}
          />
        )}
        {isRange && (
          <>
            <input
              type="number"
              className={INPUT_CLS + ' w-16 text-xs'}
              placeholder={tt.variantMatchMin}
              value={entry.rangeMin ?? ''}
              onChange={e => onChange({ rangeMin: e.target.value })}
            />
            <span className="text-slate-500 text-[10px]">…</span>
            <input
              type="number"
              className={INPUT_CLS + ' w-16 text-xs'}
              placeholder={tt.variantMatchMax}
              value={entry.rangeMax ?? ''}
              onChange={e => onChange({ rangeMax: e.target.value })}
            />
          </>
        )}

        <div className="flex-1" />

        {/* Reorder + delete */}
        <button
          type="button"
          disabled={!onMoveUp}
          onClick={onMoveUp}
          className="text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-xs px-1"
          title="Move up"
        >▲</button>
        <button
          type="button"
          disabled={!onMoveDown}
          onClick={onMoveDown}
          className="text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-xs px-1"
          title="Move down"
        >▼</button>
        <button
          type="button"
          onClick={onDelete}
          className="text-slate-500 hover:text-red-400 cursor-pointer text-xs px-1"
          title="Delete"
        >×</button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-2 pb-2 flex flex-col gap-2 border-t border-slate-700/40">
          <FieldsEditor
            fields={entry.fields}
            schema={fieldsSchema}
            onChange={fields => onChange({ fields })}
          />
          <RawCssEditor
            value={entry.rawCss ?? ''}
            onChange={rawCss => onChange({ rawCss })}
            help={rawCssHelp}
          />
        </div>
      )}
    </div>
  );
}

// ─── Field editors (schema-driven; one input per StyleFieldDescriptor) ──────

function FieldsEditor({
  fields, schema, onChange,
}: {
  fields: Record<string, StyleFieldValue> | undefined;
  schema: ReadonlyArray<StyleFieldDescriptor>;
  onChange: (fields: Record<string, StyleFieldValue>) => void;
}) {
  const t = useT();
  const tt = t.styleOverride as any;

  // Schema-less mode (e.g. Divider) — nothing to render, RawCssEditor handles all customisation.
  if (schema.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {schema.map(f => {
        const label = tt.fields?.[f.labelKey] ?? f.labelKey;
        return (
          <div key={f.key}>
            <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
            {f.type === 'color' && (
              <ColorSwatchInput
                value={typeof fields?.[f.key] === 'string' ? (fields![f.key] as string) : ''}
                onChange={v => onChange(setFieldValue(fields, f.key, v))}
                allowClear
              />
            )}
            {f.type === 'number' && (
              <NumberFieldInput
                value={typeof fields?.[f.key] === 'number' ? (fields![f.key] as number) : undefined}
                onChange={v => onChange(setFieldValue(fields, f.key, v))}
                min={f.min} max={f.max} suffix={f.suffix}
              />
            )}
            {f.type === 'boolean' && (
              <TristateInput
                value={typeof fields?.[f.key] === 'boolean' ? (fields![f.key] as boolean) : undefined}
                onChange={v => onChange(setFieldValue(fields, f.key, v))}
              />
            )}
            {f.type === 'enum' && (
              <EnumInput
                value={typeof fields?.[f.key] === 'string' ? (fields![f.key] as string) : undefined}
                options={f.options ?? []}
                onChange={v => onChange(setFieldValue(fields, f.key, v))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function NumberFieldInput({
  value, onChange, min, max, suffix,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number; max?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        className={INPUT_CLS + ' w-20 text-xs'}
        value={value ?? ''}
        min={min}
        max={max}
        onChange={e => {
          const raw = e.target.value;
          if (raw === '') { onChange(undefined); return; }
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
      />
      {suffix && <span className="text-[10px] text-slate-500">{suffix}</span>}
      {value !== undefined && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-slate-500 hover:text-slate-300 cursor-pointer text-xs leading-none"
          title="Clear"
        >×</button>
      )}
    </div>
  );
}

function EnumInput({
  value, options, onChange,
}: {
  value: string | undefined;
  options: ReadonlyArray<{ value: string; labelKey: string }>;
  onChange: (v: string | undefined) => void;
}) {
  const t = useT();
  const tt = t.styleOverride as any;
  return (
    <div className="flex flex-wrap gap-0.5">
      <button
        type="button"
        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
          value === undefined
            ? 'bg-slate-700 border-slate-600 text-slate-200'
            : 'bg-slate-800 border-slate-600 text-slate-500 hover:text-slate-300'
        }`}
        onClick={() => onChange(undefined)}
        title={tt.tristateUnset ?? '—'}
      >—</button>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
            value === opt.value
              ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200'
          }`}
          onClick={() => onChange(opt.value)}
        >
          {tt.options?.[opt.labelKey] ?? opt.labelKey}
        </button>
      ))}
    </div>
  );
}

function TristateInput({
  value, onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  const t = useT();
  const tt = t.styleOverride as any;
  return (
    <div className="flex gap-0.5">
      <button
        type="button"
        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
          value === undefined
            ? 'bg-slate-700 border-slate-600 text-slate-200'
            : 'bg-slate-800 border-slate-600 text-slate-500 hover:text-slate-300'
        }`}
        onClick={() => onChange(undefined)}
        title={tt.tristateUnset ?? '—'}
      >—</button>
      <button
        type="button"
        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
          value === false
            ? 'bg-indigo-600 border-indigo-500 text-white'
            : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200'
        }`}
        onClick={() => onChange(false)}
      >{tt.tristateOff ?? 'Off'}</button>
      <button
        type="button"
        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
          value === true
            ? 'bg-indigo-600 border-indigo-500 text-white'
            : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200'
        }`}
        onClick={() => onChange(true)}
      >{tt.tristateOn ?? 'On'}</button>
    </div>
  );
}

/** CSS-property cheatsheet shown inside the Raw CSS help panel. Block-agnostic. */
const RAW_CSS_CHEATSHEET: ReadonlyArray<{ titleKey: 'motion' | 'effects' | 'layout' | 'interaction'; properties: string[] }> = [
  { titleKey: 'motion',      properties: ['transform', 'transition', 'animation', '@keyframes'] },
  { titleKey: 'effects',     properties: ['box-shadow', 'filter', 'backdrop-filter', 'opacity', 'text-shadow', 'mix-blend-mode'] },
  { titleKey: 'layout',      properties: ['margin', 'width', 'height', 'min-height', 'gap', 'display', 'flex'] },
  { titleKey: 'interaction', properties: ['cursor', 'pointer-events', 'outline', 'user-select'] },
];

function RawCssEditor({
  value, onChange, help,
}: {
  value: string;
  onChange: (v: string) => void;
  help?: StyleRawCssHelp;
}) {
  const t = useT();
  const tt = t.styleOverride as any;
  const placeholder = (help?.placeholderKey && tt[help.placeholderKey]) || tt.rawCssPlaceholder;
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">{tt.rawCssLabel}</label>
      <textarea
        className={INPUT_CLS + ' font-mono text-[11px] resize-y min-h-[80px]'}
        rows={4}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
      />
      {help && (
        <details className="mt-1 text-[10px] text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300 select-none">{tt.rawCssHelpToggle}</summary>
          <div className="mt-1.5 pl-2 border-l border-slate-700 leading-relaxed">
            <p className="text-slate-300 mb-1.5">{tt.rawCssDisclaimer}</p>
            <p>{tt.rawCssHelpIntro}</p>
            <ul className="list-none space-y-0.5 mt-1">
              {help.selectors.map(sel => (
                <li key={sel.name}>
                  <code className="text-indigo-300 font-mono">{sel.name}</code>
                  {' — '}
                  {tt.selectors?.[sel.descKey] ?? sel.descKey}
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <div className="text-slate-400 mb-1">{tt.rawCssCheatsheetTitle}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {RAW_CSS_CHEATSHEET.map(group => (
                  <div key={group.titleKey}>
                    <div className="text-slate-400 text-[10px] uppercase tracking-wide mb-0.5">
                      {tt.rawCssCheatsheet?.[group.titleKey] ?? group.titleKey}
                    </div>
                    <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {group.properties.map(p => (
                        <code key={p} className="text-indigo-300 font-mono text-[10px]">{p}</code>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2">
              <div className="text-slate-400 mb-0.5">{tt.rawCssExampleLabel}</div>
              <pre className="font-mono text-[10px] bg-slate-900/60 border border-slate-700 rounded p-2 whitespace-pre overflow-x-auto leading-snug">{help.exampleCode}</pre>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
