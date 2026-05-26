import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Translations } from './types';
import type { Block } from '../types';
import enTranslations from './locales/en';

// ─── Locale discovery + lazy loading ──────────────────────────────────────────
// English is bundled with the main chunk as the synchronous fallback. Every
// other locale (ua, ru, de, …) becomes its own chunk fetched on first use.
// Loaders are still discovered via Vite glob — drop a `xx.ts` into locales/
// and it's instantly picked up by the picker; the chunk is only fetched if
// the user actually switches to it.
const localeLoaders = import.meta.glob('./locales/*.ts') as Record<
  string,
  () => Promise<{ default: Translations }>
>;

// In-memory cache: starts with English; populated on demand by `loadLocale`.
const localeMap: Record<string, Translations> = { en: enTranslations };

// Display-name overrides for locales that aren't loaded yet so the picker
// can show "Українська" instead of just "ua" before the file is fetched.
// Add new entries here when adding a new locale.
const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  ua: 'Українська',
};

async function loadLocale(code: string): Promise<Translations | null> {
  if (localeMap[code]) return localeMap[code];
  const loader = localeLoaders[`./locales/${code}.ts`];
  if (!loader) return null;
  const mod = await loader();
  localeMap[code] = mod.default;
  return mod.default;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Returns all discovered locales sorted alphabetically by display name. */
export function getLocales(): { code: string; name: string }[] {
  const codes = Object.keys(localeLoaders).map(p => p.replace('./locales/', '').replace('.ts', ''));
  return codes
    .map(code => ({
      code,
      // Prefer the loaded locale's own self-name; fall back to overrides; finally code.
      name: localeMap[code]?.locale.name ?? LOCALE_DISPLAY_NAMES[code] ?? code,
    }))
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
    'audio-gen':         t.block.audioGen,
    'container':         t.block.container,
    'time-manipulation': t.block.timeManipulation,
    'paperdoll':         t.block.paperdoll,
    'inventory':         t.block.inventory,
    'tabs':              t.block.tabs,
    'plugin':            t.block.plugin,
  };
  return map[type] ?? type;
}

// ─── Zustand store ────────────────────────────────────────────────────────────

interface LocaleState {
  locale: string;
  /** Active translations object. Set sync to English on boot, swapped async after lazy load. */
  translations: Translations;
  setLocale: (locale: string) => Promise<void>;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'en',
      translations: enTranslations,
      setLocale: async (locale) => {
        const t = await loadLocale(locale);
        if (t) set({ locale, translations: t });
      },
    }),
    {
      name: 'purl-locale',
      // Only persist the locale code — `translations` is a ~70 KB object that
      // would bloat localStorage and the rehydrate payload. We restore it by
      // either falling back to bundled English or async-loading via the locale
      // file referenced by the persisted code.
      partialize: (s) => ({ locale: s.locale }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // partialize stripped translations — restore the bundled English and
        // kick off async load for whatever code persisted.
        state.translations = enTranslations;
        if (state.locale !== 'en') {
          loadLocale(state.locale).then((t) => {
            if (t) useLocaleStore.setState({ translations: t });
          });
        }
      },
    },
  ),
);

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the translations object for the currently selected locale.
 * Falls back to English while a non-English locale is being lazy-loaded.
 *
 * Usage:
 *   const t = useT();
 *   <span>{t.sidebar.scenes}</span>
 *   <span>{t.scene.confirmDelete('My Scene')}</span>
 */
export function useT(): Translations {
  return useLocaleStore(s => s.translations);
}
