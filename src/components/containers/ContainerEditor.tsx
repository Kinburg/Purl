import { useState, useEffect, type ReactNode } from 'react';
import { charToVarPrefix, useProjectStore } from '../../store/projectStore';
import { toLocalFileUrl, resolveAssetPath } from '../../lib/fsApi';
import { ImageAssetPicker } from '../shared/ImageMappingEditor';
import { AvatarGenModal } from '../characters/AvatarGenModal';
import type {
  ContainerDefinition, ContainerMode, ContainerItemSlot, ItemDefinition, AvatarConfig,
} from '../../types';
import { useT } from '../../i18n';
import { ModalShell, INPUT_CLS } from '../shared/ModalShell';
import NumericInput from '../shared/NumericInput';
import { EmojiIcon, type EmojiIconName } from '../shared/EmojiIcons';

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════

function resolveEditorSrc(src: string, projectDir: string | null): string {
  if (!src) return '';
  if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('localfile://')) return src;
  if (projectDir) return toLocalFileUrl(resolveAssetPath(projectDir, src));
  return '';
}

// 'shop' has no SVG counterpart in the central icon set yet, so it falls
// back to the storefront glyph. The four emoji from the migration list
// (📦 chest, 🎁 loot, 👕 wearable, 🧪 consumable, 📦 misc) all
// resolve to SVGs.
const MODE_ICONS: Record<ContainerMode, EmojiIconName> = {
  shop:  'shop',
  chest: 'box',
  loot:  'gift',
};
const ModeIcon = ({ mode, size = 16, className }: { mode: ContainerMode; size?: number; className?: string }) => (
  <EmojiIcon name={MODE_ICONS[mode]} size={size} className={className} />
);

// Note: emoji prefixes used to appear inside <option> elements via
// ITEM_CATEGORY_ICONS — browsers don't render inline SVG inside <option>,
// so when migrating to SVG icons that affordance was dropped.

// ═══════════════════════════════════════════════════════════════════════════
//  Props & main component
// ═══════════════════════════════════════════════════════════════════════════

type TabId = 'basics' | 'appearance' | 'stock';

interface Props {
  mode: 'create' | 'edit';
  containerId?: string;
  initial: Omit<ContainerDefinition, 'id' | 'varIds'>;
  takenNames: string[];
  takenVarNames: string[];
  onSave: (data: Omit<ContainerDefinition, 'id' | 'varIds'>) => void;
  onClose: () => void;
}

export function ContainerEditor({
  mode, initial, takenNames, takenVarNames, onSave, onClose,
}: Props) {
  const t = useT();
  const project    = useProjectStore(s => s.project);
  const projectDir = useProjectStore(s => s.projectDir);
  const items = project.items ?? [];

  const [tab, setTab] = useState<TabId>('basics');
  const [name, setName]       = useState(initial.name);
  const [varName, setVarName] = useState(initial.varName);
  const [varNameTouched, setVarNameTouched] = useState(mode === 'edit');
  const [containerMode, setContainerMode] = useState<ContainerMode>(initial.mode);
  const [stock, setStock]     = useState<ContainerItemSlot[]>(initial.initialItems);
  const [bgImage, setBgImage] = useState(initial.bgImage ?? '');
  const [genModalOpen, setGenModalOpen] = useState(false);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!varNameTouched) setVarName(charToVarPrefix(v));
  };
  const handleVarNameChange = (v: string) => {
    setVarNameTouched(true);
    setVarName(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  };

  const trimmedName    = name.trim();
  const trimmedVarName = varName.trim().replace(/^[\d_]+/, '').replace(/_+$/g, '');

  const nameError = trimmedName === '' ? t.containers.nameEmpty
    : takenNames.includes(trimmedName) ? t.containers.nameTaken : null;
  const varNameError = trimmedVarName === '' ? t.containers.varNameEmpty
    : !/^[a-z][a-z0-9_]*$/.test(trimmedVarName) ? t.containers.varNameInvalid
    : takenVarNames.includes(trimmedVarName) ? t.containers.varNameTaken : null;

  const addSlot = () => {
    if (items.length === 0) return;
    setStock(prev => [...prev, { id: crypto.randomUUID(), itemVarName: items[0].varName, quantity: 1 }]);
  };
  const updateSlot = (id: string, patch: Partial<ContainerItemSlot>) =>
    setStock(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeSlot = (id: string) => setStock(prev => prev.filter(s => s.id !== id));

  const handleSave = () => {
    if (nameError || varNameError) return;
    onSave({
      name: trimmedName,
      varName: trimmedVarName,
      mode: containerMode,
      initialItems: stock,
      bgImage: bgImage || undefined,
    });
    onClose();
  };

  const bgAvatarCfg: AvatarConfig = {
    mode: 'static',
    src: bgImage,
    variableId: '',
    mapping: [],
    defaultSrc: '',
  };

  const bgPreviewSrc = resolveEditorSrc(bgImage, projectDir);

  const tabs: { id: TabId; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'basics',     label: t.containers.tabBasics,     icon: <IconSliders /> },
    { id: 'appearance', label: t.containers.tabAppearance, icon: <IconImage /> },
    { id: 'stock',      label: t.containers.tabStock,      icon: <IconBox />, badge: stock.length || undefined },
  ];

  return (
    <ModalShell onClose={onClose} width={1060}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-700 shrink-0">
        <div className="w-9 h-9 rounded-lg border border-slate-600 bg-slate-700/80 flex items-center justify-center text-xl shrink-0 overflow-hidden">
          {bgPreviewSrc
            ? <img src={bgPreviewSrc} className="w-full h-full object-cover" alt="" />
            : <span><ModeIcon mode={containerMode} size={16} /></span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-100 leading-tight truncate">
            {mode === 'create' ? t.containers.createTitle : t.containers.editTitle}
            {trimmedName && <span className="text-slate-400 font-normal ml-2">— {trimmedName}</span>}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t.containers.modalSubtitle}</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 transition-colors p-1 -m-1 cursor-pointer"
          aria-label="Close"
        >
          <IconX />
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
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
                {item.badge !== undefined && (
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-700/60 rounded px-1">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {tab === 'basics' && (
            <BasicsTab
              name={name} varName={varName}
              nameError={nameError} varNameError={varNameError}
              mode={mode} containerMode={containerMode} trimmedVarName={trimmedVarName}
              onNameChange={handleNameChange} onVarNameChange={handleVarNameChange}
              onContainerModeChange={setContainerMode}
              onEnterSave={handleSave}
            />
          )}
          {tab === 'appearance' && (
            <AppearanceTab
              bgImage={bgImage}
              onBgImageChange={setBgImage}
              assetNodes={project.assetNodes}
              onGenerate={() => setGenModalOpen(true)}
            />
          )}
          {tab === 'stock' && (
            <StockTab
              stock={stock} items={items} containerMode={containerMode}
              onAdd={addSlot}
              onUpdate={updateSlot}
              onRemove={removeSlot}
            />
          )}
        </div>

        {/* Preview */}
        <aside className="w-72 shrink-0 border-l border-slate-700 p-5 flex flex-col gap-4 bg-slate-900/30 overflow-y-auto">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            {t.containers.previewLabel}
          </h3>
          <ContainerPreview
            name={trimmedName || name}
            varName={trimmedVarName || varName}
            containerMode={containerMode}
            stockCount={stock.length}
            bgPreviewSrc={bgPreviewSrc}
          />
        </aside>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-700 shrink-0">
        <div className="text-[11px] text-red-400 min-w-0 truncate">
          {nameError || varNameError || ''}
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
            disabled={!!nameError || !!varNameError}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium cursor-pointer transition-colors"
          >
            {t.containers.save}
          </button>
        </div>
      </div>

      {/* Background image gen modal */}
      {genModalOpen && (
        <AvatarGenModal
          cfg={bgAvatarCfg}
          charVarName={trimmedVarName || 'container'}
          charName={name}
          charLlmDescr=""
          assetSubfolder="containers"
          modalTitle={t.containers.bgImageGenerate}
          slotLabelStatic={t.containers.sectionBgImage}
          slotLabelDefault={t.containers.sectionBgImage}
          entityKind="container"
          onSave={avatar => setBgImage(avatar.src)}
          onClose={() => setGenModalOpen(false)}
        />
      )}
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Preview panel
// ═══════════════════════════════════════════════════════════════════════════

function ContainerPreview({
  name, varName, containerMode, stockCount, bgPreviewSrc,
}: {
  name: string;
  varName: string;
  containerMode: ContainerMode;
  stockCount: number;
  bgPreviewSrc: string;
}) {
  const t = useT();
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [bgPreviewSrc]);
  const showBg = Boolean(bgPreviewSrc) && !imgFailed;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 overflow-hidden flex flex-col">
      {/* Background image thumbnail */}
      <div className="w-full h-28 bg-slate-700/60 flex items-center justify-center relative overflow-hidden">
        {showBg ? (
          <img
            src={bgPreviewSrc}
            className="w-full h-full object-cover"
            alt=""
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="opacity-30"><ModeIcon mode={containerMode} size={56} /></span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-transparent" />
        <span className="absolute bottom-2 left-3"><ModeIcon mode={containerMode} size={22} /></span>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100 leading-tight">
            {name || <span className="text-slate-600 italic">—</span>}
          </p>
          {varName && (
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">$containers.{varName}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 bg-slate-700/50 text-slate-400">
            {containerMode}
          </span>
          {stockCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 bg-slate-700/50 text-slate-400">
              {stockCount} item{stockCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {!showBg && (
          <p className="text-[10px] text-slate-600 italic">{t.containers.bgImageNone}</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  BASICS TAB
// ═══════════════════════════════════════════════════════════════════════════

function BasicsTab({
  name, varName, nameError, varNameError, mode, containerMode, trimmedVarName,
  onNameChange, onVarNameChange, onContainerModeChange, onEnterSave,
}: {
  name: string; varName: string;
  nameError: string | null; varNameError: string | null;
  mode: 'create' | 'edit'; containerMode: ContainerMode; trimmedVarName: string;
  onNameChange: (v: string) => void;
  onVarNameChange: (v: string) => void;
  onContainerModeChange: (m: ContainerMode) => void;
  onEnterSave: () => void;
}) {
  const t = useT();

  const MODE_DEFS: { id: ContainerMode; label: string; subtitle: string }[] = [
    { id: 'shop',  label: t.containers.modeShop,  subtitle: t.containers.modeShopSubtitle },
    { id: 'chest', label: t.containers.modeChest, subtitle: t.containers.modeChestSubtitle },
    { id: 'loot',  label: t.containers.modeLoot,  subtitle: t.containers.modeLootSubtitle },
  ];

  return (
    <>
      <Section title={t.containers.sectionIdentity}>
        <TwoCol>
          <Field label={t.containers.fieldName} error={nameError}>
            <input
              autoFocus
              className={`${INPUT_CLS} ${nameError ? '!border-red-500' : ''}`}
              value={name}
              onChange={e => onNameChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEnterSave(); }}
            />
          </Field>
          <Field
            label={t.containers.fieldVarName}
            hint={mode !== 'edit' && !varNameError ? `$containers.${trimmedVarName || '…'}` : undefined}
            error={mode !== 'edit' ? varNameError : null}
          >
            <input
              className={`${INPUT_CLS} font-mono ${
                mode === 'edit' ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : ''
              } ${varNameError && mode !== 'edit' ? '!border-red-500' : ''}`}
              value={varName}
              readOnly={mode === 'edit'}
              onChange={e => onVarNameChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEnterSave(); }}
              placeholder="village_shop, chest_01..."
            />
          </Field>
        </TwoCol>
      </Section>

      <Section title={t.containers.sectionMode}>
        <div className="grid grid-cols-3 gap-2">
          {MODE_DEFS.map(m => {
            const active = containerMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onContainerModeChange(m.id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors cursor-pointer text-center ${
                  active
                    ? 'bg-indigo-600/15 border-indigo-500 text-indigo-100'
                    : 'bg-slate-700/30 border-slate-600 text-slate-300 hover:border-slate-500 hover:bg-slate-700/50'
                }`}
              >
                <span className="inline-flex items-center justify-center text-slate-300"><ModeIcon mode={m.id} size={28} /></span>
                <span className="text-xs font-medium leading-tight">{m.label}</span>
                <span className={`text-[10px] leading-tight ${active ? 'text-indigo-300' : 'text-slate-500'}`}>
                  {m.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  APPEARANCE TAB
// ═══════════════════════════════════════════════════════════════════════════

function AppearanceTab({
  bgImage, onBgImageChange, assetNodes, onGenerate,
}: {
  bgImage: string;
  onBgImageChange: (v: string) => void;
  assetNodes: import('../../types').AssetTreeNode[];
  onGenerate: () => void;
}) {
  const t = useT();

  return (
    <Section title={t.containers.sectionBgImage}>
      <p className="text-xs text-slate-500">{t.containers.bgImageHint}</p>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={onGenerate}
          className="text-xs px-3 py-1.5 rounded border transition-colors cursor-pointer bg-slate-700 border-slate-600 text-slate-300 hover:border-indigo-500 hover:text-indigo-200 flex items-center gap-1.5"
        >
          <IconSparkle /> {t.containers.bgImageGenerate}
        </button>
        {bgImage && (
          <button
            onClick={() => onBgImageChange('')}
            className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-700 transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-1"><EmojiIcon name="close" size={20} /> {t.containers.bgImageNone}</span>
          </button>
        )}
      </div>

      <ImageAssetPicker
        assetNodes={assetNodes}
        value={bgImage}
        onChange={onBgImageChange}
      />
    </Section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  STOCK TAB
// ═══════════════════════════════════════════════════════════════════════════

function StockTab({
  stock, items, containerMode, onAdd, onUpdate, onRemove,
}: {
  stock: ContainerItemSlot[];
  items: ItemDefinition[];
  containerMode: ContainerMode;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<ContainerItemSlot>) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();

  return (
    <Section title={t.containers.stockSection}>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500 italic">{t.containers.noItemsDefined}</p>
      ) : (
        <div className="flex flex-col gap-1 rounded border border-slate-700 p-2">
          {stock.length > 0 && (
            <div
              className="grid gap-1 text-[10px] text-slate-500 px-0.5 mb-0.5"
              style={{ gridTemplateColumns: containerMode === 'shop' ? '1fr 64px 72px 20px' : '1fr 64px 20px' }}
            >
              <span>{t.containers.stockItem}</span>
              <span className="text-center">{t.containers.stockQty}</span>
              {containerMode === 'shop' && <span className="text-center">{t.containers.stockPrice}</span>}
            </div>
          )}

          {stock.length === 0 && (
            <p className="text-xs text-slate-600 italic py-1">{t.containers.stockEmpty}</p>
          )}

          {stock.map(slot => (
            <StockRow
              key={slot.id}
              slot={slot}
              items={items}
              showPrice={containerMode === 'shop'}
              onChange={patch => onUpdate(slot.id, patch)}
              onDelete={() => onRemove(slot.id)}
            />
          ))}

          <button
            type="button"
            className="text-xs text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded px-2 py-1 transition-colors cursor-pointer border border-dashed border-slate-700 hover:border-indigo-600 mt-0.5"
            onClick={onAdd}
          >
            {t.containers.stockAdd}
          </button>
        </div>
      )}
    </Section>
  );
}

// ─── Stock row ────────────────────────────────────────────────────────────

function StockRow({
  slot, items, showPrice, onChange, onDelete,
}: {
  slot: ContainerItemSlot;
  items: ItemDefinition[];
  showPrice: boolean;
  onChange: (patch: Partial<ContainerItemSlot>) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const isInfinite = slot.quantity === -1;

  return (
    <div
      className="grid gap-1 items-center"
      style={{ gridTemplateColumns: showPrice ? '1fr 64px 72px 20px' : '1fr 64px 20px' }}
    >
      <select
        className="bg-slate-700 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500 cursor-pointer min-w-0"
        value={slot.itemVarName}
        onChange={e => onChange({ itemVarName: e.target.value })}
      >
        {items.map(it => (
          <option key={it.id} value={it.varName}>
            {it.name}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title={t.containers.stockInfinite}
          className={`text-xs px-1 rounded transition-colors cursor-pointer shrink-0 ${
            isInfinite ? 'text-indigo-400 bg-indigo-900/50' : 'text-slate-500 hover:text-slate-300'
          }`}
          onClick={() => onChange({ quantity: isInfinite ? 1 : -1 })}
        >
          ∞
        </button>
        <NumericInput
          min={1} disabled={isInfinite}
          className="w-full bg-slate-700 text-xs text-white rounded px-1 py-1 outline-none border border-slate-600 focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
          value={isInfinite ? 0 : slot.quantity}
          placeholder={isInfinite ? '∞' : ''}
          onChange={v => onChange({ quantity: v })}
        />
      </div>

      {showPrice && (
        <NumericInput
          min={0}
          className="w-full bg-slate-700 text-xs text-white rounded px-1.5 py-1 outline-none border border-slate-600 focus:border-indigo-500"
          value={slot.price ?? 0}
          onChange={v => onChange({ price: v })}
        />
      )}

      <button
        type="button"
        className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer text-xs"
        onClick={onDelete}
      >
        <EmojiIcon name="close" size={20} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Primitives
// ═══════════════════════════════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function TwoCol({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label, children, hint, error,
}: {
  label: string; children: ReactNode; hint?: string; error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{label}</label>
      {children}
      {error
        ? <span className="text-[10px] text-red-400">{error}</span>
        : hint ? <span className="text-[10px] text-slate-500">{hint}</span> : null
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Icons
// ═══════════════════════════════════════════════════════════════════════════

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconSliders = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
    <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="2" fill="currentColor" stroke="none" />
  </svg>
);
const IconImage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="M21 15l-5-5-10 10" />
  </svg>
);
const IconBox = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const IconSparkle = () => <EmojiIcon name="sparkle" size={20} />;
