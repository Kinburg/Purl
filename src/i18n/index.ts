import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Translations } from './types';
import type { Block } from '../types';

// ─── Auto-discover locale files ───────────────────────────────────────────────
// Any *.ts file added to src/i18n/locales/ is automatically included.
// The locale code is derived from the filename: 'ru.ts' → 'ru'.

const modules = import.meta.glob('./locales/*.ts', { eager: true }) as Record<
  string,
  { default: Translations }
>;

const localeMap: Record<string, Translations> = {};
for (const [path, mod] of Object.entries(modules)) {
  const code = path.replace('./locales/', '').replace('.ts', '');
  localeMap[code] = mod.default;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Returns all discovered locales sorted alphabetically by display name. */
export function getLocales(): { code: string; name: string }[] {
  return Object.entries(localeMap)
    .map(([code, t]) => ({ code, name: t.locale.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Map a Block['type'] to the corresponding label in the current translations. */
export function blockTypeLabel(t: Translations, type: Block['type']): string {
  const map: Record<Block['type'], string> = {
    'text':              t.block.text,
    'dialogue':          t.block.dialogue,
    'choice':            t.block.choice,
    'condition':         t.block.condition,
    'variable-set':      t.block.variableSet,
    'set-object':        t.block.setObject,
    'for':               t.block.forLoop,
    'button':            t.block.button,
    'link':              t.block.link,
    'input-field':       t.block.inputField,
    'image':             t.block.image,
    'image-gen':         t.block.imageGen,
    'video':             t.block.video,
    'raw':               t.block.raw,
    'note':              t.block.note,
    'table':             t.block.table,
    'include':           t.block.include,
    'divider':           t.block.divider,
    'checkbox':          t.block.checkbox,
    'radio':             t.block.radio,
    'function':          t.block.function,
    'popup':             t.block.popup,
    'audio':             t.block.audio,
    'container':         t.block.container,
    'time-manipulation': t.block.timeManipulation,
    'paperdoll':         t.block.paperdoll,
    'inventory':         t.block.inventory,
    'plugin':            t.block.plugin,
  };
  return map[type] ?? type;
}

// ─── Zustand store ────────────────────────────────────────────────────────────

interface LocaleState {
  locale: string;
  setLocale: (locale: string) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'purl-locale' },
  ),
);

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the translations object for the currently selected locale.
 * Falls back to English if the locale is not found.
 *
 * Usage:
 *   const t = useT();
 *   <span>{t.sidebar.scenes}</span>
 *   <span>{t.scene.confirmDelete('My Scene')}</span>
 */
export function useT(): Translations {
  const { locale } = useLocaleStore();
  return localeMap[locale] ?? localeMap['en'];
}
