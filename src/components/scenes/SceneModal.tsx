import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useT } from '../../i18n';
import {
  SYSTEM_TAGS, SYSTEM_TAG_COLORS, START_TAG, START_TAG_COLOR,
} from '../../types';
import type { SystemTag, SceneBackground, SceneBgSize, SceneBgImageType, AvatarConfig } from '../../types';
import {
  ModalShell, ColorSwatchInput, INPUT_CLS,
} from '../shared/ModalShell';
import { ImageAssetPicker, ImageMappingEditor } from '../shared/ImageMappingEditor';
import { VariablePicker } from '../shared/VariablePicker';
import { useVariableNodes } from '../shared/VariableScope';
import { AvatarGenModal } from '../characters/AvatarGenModal';
import { toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SceneData {
  name: string;
  tags: string[];
  notes?: string;
  background?: SceneBackground;
}

interface Props {
  mode: 'create' | 'edit';
  initial: SceneData;
  takenNames: string[];
  onSave: (data: SceneData) => void;
  onClose: () => void;
  /** Scene ID — required in edit mode for "Make starting scene" */
  sceneId?: string;
}

type TabId = 'settings' | 'background';
type BgType = SceneBgImageType;

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const IconImage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
    <circle cx="9" cy="9" r="2"/>
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
  </svg>
);

const IconSparkle = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l1.09 4.26L17 7l-3.91 0.74L12 12l-1.09-4.26L7 7l3.91-0.74L12 2z" />
    <path d="M5 15l0.55 2.13L7.5 18l-1.95 0.37L5 20.5l-0.55-2.13L2.5 18l1.95-0.37L5 15z" />
    <path d="M19 15l0.55 2.13L21.5 18l-1.95 0.37L19 20.5l-0.55-2.13L16.5 18l1.95-0.37L19 15z" />
  </svg>
);

// ─── Main component ───────────────────────────────────────────────────────────

export function SceneModal({ mode, initial, takenNames, onSave, onClose, sceneId }: Props) {
  const t = useT();
  const { project, projectDir, makeStartScene } = useProjectStore();
  const variableNodes = useVariableNodes();

  // ── Settings tab state ─────────────────────────────────────────────────────
  const [name, setName]             = useState(initial.name);
  const [tags, setTags]             = useState<string[]>(initial.tags);
  const [notes, setNotes]           = useState(initial.notes ?? '');
  const [newTagInput, setNewTagInput] = useState('');
  const [startTagHint, setStartTagHint] = useState(false);

  // ── Background tab state ───────────────────────────────────────────────────
  const [bg, setBg]           = useState<SceneBackground | null>(initial.background ?? null);
  const [genModalOpen, setGenModalOpen] = useState(false);

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<TabId>('settings');

  // ── Validation ─────────────────────────────────────────────────────────────
  const trimmedName = name.trim();
  const nameError = trimmedName === ''
    ? t.scene.nameEmpty
    : takenNames.includes(trimmedName)
      ? t.scene.nameTaken
      : null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSave = () => {
    if (nameError) return;
    onSave({ name: trimmedName, tags, notes: notes.trim() || undefined, background: bg ?? undefined });
    onClose();
  };

  const isStartScene = tags.includes(START_TAG);

  const toggleTag = (tag: string) => {
    if (tag === START_TAG) return;
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const addCustomTag = () => {
    const tag = newTagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag) { setNewTagInput(''); return; }
    if (tag === START_TAG) { setStartTagHint(true); setNewTagInput(''); return; }
    if (tags.includes(tag)) { setNewTagInput(''); return; }
    setStartTagHint(false);
    setTags(prev => [...prev, tag]);
    setNewTagInput('');
  };

  const handleMakeStart = () => {
    if (sceneId) makeStartScene(sceneId);
    onClose();
  };

  const allCustomTags = [...new Set([
    ...project.scenes.flatMap(s => s.tags),
    ...tags,
  ].filter(tag => !(SYSTEM_TAGS as readonly string[]).includes(tag) && tag !== START_TAG))].sort();

  // ── Background helpers ─────────────────────────────────────────────────────

  function patchBg(patch: Partial<SceneBackground>) {
    setBg(prev => prev ? { ...prev, ...patch } : { imageType: 'none', ...patch });
  }

  function setBgType(newType: BgType) {
    if (newType === 'none') {
      // Preserve color data when switching back to None
      setBg(prev => {
        if (!prev) return null;
        const { bgColor, overlayColor, overlayOpacity } = prev;
        if (!bgColor && !overlayColor) return null;
        return { imageType: 'none', bgColor, overlayColor, overlayOpacity };
      });
      return;
    }
    setBg(prev => ({
      imageType: newType,
      bgColor:       prev?.bgColor,
      src:           prev?.src,
      variableId:    prev?.variableId,
      mapping:       prev?.mapping,
      defaultSrc:    prev?.defaultSrc,
      genSettings:   prev?.genSettings,
      blur:          prev?.blur,
      opacity:       prev?.opacity,
      size:          prev?.size,
      posX:          prev?.posX,
      posY:          prev?.posY,
      overlayColor:  prev?.overlayColor,
      overlayOpacity: prev?.overlayOpacity,
    }));
  }

  const bgType: BgType = bg?.imageType ?? 'none';

  function resolvePreviewSrc(src?: string): string {
    if (!src) return '';
    if (src.startsWith('assets/') && projectDir) return toLocalFileUrl(resolveAssetPath(projectDir, src));
    return src;
  }

  const rawPreviewSrc = (bgType === 'bound' || bgType === 'ai-bound')
    ? (bg?.defaultSrc || bg?.mapping?.[0]?.src)
    : bg?.src;
  const previewSrc = resolvePreviewSrc(rawPreviewSrc);

  const bgAvatarCfg: AvatarConfig = (bgType === 'ai-bound')
    ? {
        mode: 'bound',
        src: '',
        variableId: bg?.variableId ?? '',
        mapping:    bg?.mapping ?? [],
        defaultSrc: bg?.defaultSrc ?? '',
        genSettings: bg?.genSettings,
      }
    : {
        mode: 'static',
        src: bg?.src ?? '',
        variableId: '',
        mapping: [],
        defaultSrc: '',
        genSettings: bg?.genSettings,
      };

  // ── Tab definitions ────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'settings',   label: t.scene.tabSettings,   icon: <IconSettings /> },
    { id: 'background', label: t.scene.tabBackground, icon: <IconImage /> },
  ];

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <ModalShell onClose={onClose} width={1060}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-700">
        <div className="w-9 h-9 rounded-lg border border-slate-600 bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 shrink-0">
          {(trimmedName || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-100 leading-tight truncate">
            {mode === 'create' ? t.scene.createTitle : t.scene.editTitle}
            {trimmedName && <span className="text-slate-400 font-normal ml-2">— {trimmedName}</span>}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t.scene.tabSettings}, {t.scene.tabBackground}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors p-1 -m-1 cursor-pointer" aria-label="Close">
          <IconX />
        </button>
      </div>

      {/* ── Body: sidebar + content + preview ──────────────────────────── */}
      <div className="flex min-h-0 flex-1">

        {/* Sidebar */}
        <nav className="w-52 shrink-0 border-r border-slate-700 py-3 flex flex-col gap-0.5">
          {tabs.map(item => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors cursor-pointer border-l-2 ${
                  active
                    ? 'bg-indigo-600/10 border-indigo-500 text-indigo-200'
                    : 'border-transparent text-slate-300 hover:bg-slate-700/40 hover:text-slate-100'
                }`}
              >
                <span className={active ? 'text-indigo-300' : 'text-slate-400'}>{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* ══ Settings tab ══════════════════════════════════════════════ */}
          {tab === 'settings' && (
            <>
              {/* Name */}
              <Section title={t.scene.fieldName}>
                <input
                  autoFocus
                  className={`${INPUT_CLS} ${nameError ? '!border-red-500' : ''}`}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                />
              </Section>

              {/* Tags */}
              <Section title={t.sceneSettings.tagsLabel}>
                {isStartScene && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    <span
                      className="px-2.5 py-1 rounded text-xs font-medium border"
                      style={{ background: START_TAG_COLOR, borderColor: START_TAG_COLOR, color: '#fff' }}
                    >
                      {START_TAG}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {SYSTEM_TAGS.map(tag => {
                    const active = tags.includes(tag);
                    const color = SYSTEM_TAG_COLORS[tag as SystemTag];
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className="px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-all border"
                        style={active
                          ? { background: color, borderColor: color, color: '#fff' }
                          : { background: 'transparent', borderColor: color, color: color }
                        }
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                {allCustomTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {allCustomTags.map(tag => {
                      const active = tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`px-2.5 py-1 rounded text-xs cursor-pointer transition-colors border ${
                            active
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'bg-transparent border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-300'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-1.5 mt-1.5">
                  <input
                    className={`${INPUT_CLS} flex-1`}
                    placeholder={t.sceneSettings.addTagPlaceholder}
                    value={newTagInput}
                    onChange={e => { setNewTagInput(e.target.value); setStartTagHint(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') addCustomTag(); }}
                  />
                  <button
                    onClick={addCustomTag}
                    className="text-xs text-indigo-400 hover:text-indigo-300 px-2.5 py-1 rounded border border-slate-600 hover:border-indigo-500 transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
                {startTagHint && (
                  <span className="text-xs text-amber-400">{t.scene.startTagHint}</span>
                )}
              </Section>

              {/* Note */}
              <Section title={t.scene.note}>
                <textarea
                  className={`${INPUT_CLS} resize-none placeholder-slate-500`}
                  rows={3}
                  placeholder={t.scene.notePlaceholder}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </Section>

              {/* Make start */}
              {mode === 'edit' && !isStartScene && (
                <div>
                  <button
                    onClick={handleMakeStart}
                    className="px-4 py-1.5 text-xs rounded border transition-colors cursor-pointer"
                    style={{ borderColor: START_TAG_COLOR, background: 'transparent', color: START_TAG_COLOR }}
                    onMouseEnter={e => { e.currentTarget.style.background = START_TAG_COLOR; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = START_TAG_COLOR; }}
                  >
                    {t.scene.makeStart}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ══ Background tab ════════════════════════════════════════════ */}
          {tab === 'background' && (
            <>
              <Section title={t.scene.bgSection}>
                <p className="text-[10px] text-slate-500 -mt-1">{t.scene.bgHint}</p>

                {/* Type selector */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {([
                    ['none',      t.scene.bgNone],
                    ['static',    t.scene.bgStatic],
                    ['bound',     t.scene.bgBound],
                    ['ai-static', t.scene.bgAiStatic],
                    ['ai-bound',  t.scene.bgAiBound],
                  ] as [BgType, string][]).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setBgType(v)}
                      className={`px-2.5 py-1 text-xs rounded border cursor-pointer transition-colors ${
                        bgType === v
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Section>

              {/* ── Static ──────────────────────────────────────────────── */}
              {bgType === 'static' && (
                <Section title={t.scene.bgStatic}>
                  <ImageAssetPicker
                    assetNodes={project.assetNodes}
                    value={bg?.src ?? ''}
                    onChange={src => patchBg({ src })}
                  />
                </Section>
              )}

              {/* ── Variable (bound) ────────────────────────────────────── */}
              {bgType === 'bound' && (
                <Section title={t.scene.bgBound}>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-xs text-slate-400 w-20 shrink-0">{t.scene.bgVariable}</label>
                    <VariablePicker
                      value={bg?.variableId ?? ''}
                      onChange={id => patchBg({ variableId: id })}
                      nodes={variableNodes}
                      placeholder={t.imageBlock.selectVariable}
                    />
                  </div>
                  <ImageMappingEditor
                    mapping={bg?.mapping ?? []}
                    onChange={mapping => patchBg({ mapping })}
                    defaultSrc={bg?.defaultSrc ?? ''}
                    onDefaultSrcChange={defaultSrc => patchBg({ defaultSrc })}
                    assetNodes={project.assetNodes}
                  />
                </Section>
              )}

              {/* ── AI Static ───────────────────────────────────────────── */}
              {bgType === 'ai-static' && (
                <Section title={t.scene.bgAiStatic}>
                  <button
                    onClick={() => setGenModalOpen(true)}
                    className="self-start text-xs px-3 py-1.5 rounded border transition-colors cursor-pointer bg-slate-700 border-slate-600 text-slate-300 hover:border-indigo-500 hover:text-indigo-200 flex items-center gap-1.5"
                  >
                    <IconSparkle /> {t.scene.bgGenerate}
                  </button>
                  {bg?.src ? (
                    <img
                      src={resolvePreviewSrc(bg.src)}
                      alt=""
                      className="max-h-32 rounded border border-slate-700 object-contain mt-2"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <p className="text-xs text-slate-600 italic mt-1">{t.scene.bgNoImage}</p>
                  )}
                </Section>
              )}

              {/* ── AI Bound ────────────────────────────────────────────── */}
              {bgType === 'ai-bound' && (
                <Section title={t.scene.bgAiBound}>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-xs text-slate-400 w-20 shrink-0">{t.scene.bgVariable}</label>
                    <VariablePicker
                      value={bg?.variableId ?? ''}
                      onChange={id => patchBg({ variableId: id })}
                      nodes={variableNodes}
                      placeholder={t.imageBlock.selectVariable}
                    />
                  </div>
                  <button
                    onClick={() => setGenModalOpen(true)}
                    className="self-start text-xs px-3 py-1.5 rounded border transition-colors cursor-pointer bg-slate-700 border-slate-600 text-slate-300 hover:border-indigo-500 hover:text-indigo-200 flex items-center gap-1.5"
                  >
                    <IconSparkle /> {t.scene.bgGenerate}
                  </button>
                  {(bg?.mapping?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-slate-500 italic mt-1">
                      {bg!.mapping!.length} mapping {bg!.mapping!.length === 1 ? 'entry' : 'entries'}
                    </p>
                  )}
                </Section>
              )}
            </>
          )}
        </div>

        {/* Sticky preview aside — always visible */}
        <aside className="w-72 shrink-0 border-l border-slate-700 p-5 flex flex-col gap-4 bg-slate-900/30 overflow-y-auto">

          {/* Preview thumbnail */}
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Preview</h3>
            <div
              className="w-full rounded border border-slate-700 bg-slate-900/60 overflow-hidden relative"
              style={{ aspectRatio: '16/9' }}
            >
              {previewSrc ? (
                <>
                  <img
                    src={previewSrc}
                    alt=""
                    className="absolute inset-0 w-full h-full"
                    style={{
                      objectFit: bg?.size === 'fill' ? 'fill' : bg?.size === 'contain' ? 'contain' : 'cover',
                      objectPosition: `${bg?.posX ?? 50}% ${bg?.posY ?? 50}%`,
                      opacity: (bg?.opacity ?? 100) / 100,
                      filter: (bg?.blur ?? 0) > 0 ? `blur(${Math.min(bg!.blur! / 3, 4)}px)` : undefined,
                    }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {bg?.overlayColor && (bg.overlayOpacity ?? 0) > 0 && (
                    <div
                      className="absolute inset-0"
                      style={{ background: bg.overlayColor, opacity: (bg.overlayOpacity ?? 0) / 100 }}
                    />
                  )}
                </>
              ) : (
                <>
                  {/* Solid bg color for None mode */}
                  {bg?.bgColor && (
                    <div className="absolute inset-0" style={{ background: bg.bgColor }} />
                  )}
                  {/* Overlay preview */}
                  {bg?.overlayColor && (bg.overlayOpacity ?? 0) > 0 && (
                    <div
                      className="absolute inset-0"
                      style={{ background: bg.overlayColor, opacity: (bg.overlayOpacity ?? 0) / 100 }}
                    />
                  )}
                  {!bg?.bgColor && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] text-slate-600 italic">{t.scene.bgNoImage}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Background color — only for None mode */}
          {bgType === 'none' && (
            <div className="flex flex-col gap-2">
              <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t.scene.bgColorSection}</h3>
              <div className="flex flex-col gap-1">
                <ColorSwatchInput
                  value={bg?.bgColor ?? ''}
                  onChange={v => {
                    if (!v) {
                      if (bg) patchBg({ bgColor: undefined });
                    } else {
                      patchBg({ bgColor: v });
                    }
                  }}
                  allowClear
                />
              </div>
            </div>
          )}

          {/* Display settings — only when there's an image */}
          {bgType !== 'none' && (
            <div className="flex flex-col gap-2">
              <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t.scene.bgDisplaySection}</h3>

              <BgSlider label={t.scene.bgBlur}    value={bg?.blur ?? 0}     min={0} max={20}  unit="px" onChange={v => patchBg({ blur: v })} />
              <BgSlider label={t.scene.bgOpacity}  value={bg?.opacity ?? 100} min={0} max={100} unit="%" onChange={v => patchBg({ opacity: v })} />

              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-slate-400 shrink-0">{t.scene.bgSize}</span>
                <div className="flex gap-0.5">
                  {(['cover', 'contain', 'fill'] as SceneBgSize[]).map(s => (
                    <button
                      key={s}
                      onClick={() => patchBg({ size: s })}
                      className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                        (bg?.size ?? 'cover') === s
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {s === 'cover' ? t.scene.bgSizeCover : s === 'contain' ? t.scene.bgSizeContain : t.scene.bgSizeFill}
                    </button>
                  ))}
                </div>
              </div>

              <BgSlider label={t.scene.bgPosX} value={bg?.posX ?? 50} min={0} max={100} unit="%" onChange={v => patchBg({ posX: v })} />
              <BgSlider label={t.scene.bgPosY} value={bg?.posY ?? 50} min={0} max={100} unit="%" onChange={v => patchBg({ posY: v })} />
            </div>
          )}

          {/* Overlay — only when there's an image */}
          {bgType !== 'none' && (
            <div className="flex flex-col gap-2">
              <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t.scene.bgOverlaySection}</h3>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400">{t.scene.bgOverlayColor}</span>
                <ColorSwatchInput
                  value={bg?.overlayColor ?? ''}
                  onChange={v => patchBg({ overlayColor: v || undefined })}
                  allowClear
                />
              </div>

              {bg?.overlayColor && (
                <BgSlider
                  label={t.scene.bgOverlayOpacity}
                  value={bg?.overlayOpacity ?? 50}
                  min={0} max={100}
                  unit="%"
                  onChange={v => patchBg({ overlayOpacity: v })}
                />
              )}
            </div>
          )}

          {/* Remove bg — only when something visual is configured */}
          {bg && (bgType !== 'none' || bg.bgColor || bg.overlayColor) && (
            <button
              onClick={() => setBg(null)}
              className="self-start text-[10px] text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
            >
              ✕ {t.scene.bgRemove}
            </button>
          )}
        </aside>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-700">
        <div className="text-[11px] text-red-400 min-w-0 truncate">
          {nameError || ''}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-700/60 cursor-pointer transition-colors"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={!!nameError}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium cursor-pointer transition-colors"
          >
            {t.common.confirm}
          </button>
        </div>
      </div>

      {/* AI generation modal */}
      {genModalOpen && (bgType === 'ai-static' || bgType === 'ai-bound') && (
        <AvatarGenModal
          cfg={bgAvatarCfg}
          charVarName="scene_bg"
          charName={trimmedName || name}
          charLlmDescr=""
          assetSubfolder="scenes"
          modalTitle={t.scene.bgGenerate}
          slotLabelStatic={t.scene.bgSection}
          slotLabelDefault={t.scene.bgSection}
          entityKind="container"
          onSave={cfg => {
            if (bgType === 'ai-static') {
              patchBg({ src: cfg.src, genSettings: cfg.genSettings });
            } else {
              patchBg({ mapping: cfg.mapping, defaultSrc: cfg.defaultSrc, genSettings: cfg.genSettings });
            }
            setGenModalOpen(false);
          }}
          onClose={() => setGenModalOpen(false)}
        />
      )}
    </ModalShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function BgSlider({
  label, value, min, max, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-slate-400 w-16 shrink-0 truncate">{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-indigo-500 h-1"
      />
      <span className="text-[10px] text-slate-300 w-8 text-right shrink-0">{value}{unit}</span>
    </div>
  );
}
