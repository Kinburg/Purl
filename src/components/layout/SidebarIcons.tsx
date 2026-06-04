import { BLOCK_SVG_ICONS } from '../blocks/BlockIcons';

interface IconProps { className?: string }

const svg = (content: React.ReactNode, props?: IconProps) => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={props?.className}>
    {content}
  </svg>
);

const scenes = (p?: IconProps) => svg(<>
  <rect x="2" y="9" width="28" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".08"/>
  <path d="M2 9 L7 3 L11 3 L6 9" fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  <path d="M11 9 L16 3 L20 3 L15 9" fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  <path d="M20 9 L25 3 L29 3 L24 9" fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  <path d="M14 16 L22 20 L14 24 Z" fill="currentColor" opacity=".7"/>
</>, p);

const panel = (p?: IconProps) => svg(<>
  <rect x="2" y="3" width="28" height="26" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".08"/>
  <rect x="2" y="3" width="28" height="6" rx="2.5" fill="currentColor" fillOpacity=".22"/>
  <circle cx="6" cy="6" r="1" fill="currentColor" opacity=".7"/>
  <circle cx="9.5" cy="6" r="1" fill="currentColor" opacity=".5"/>
  <rect x="5" y="13" width="9" height="6" rx="1.5" fill="currentColor" opacity=".5"/>
  <rect x="5" y="21" width="9" height="5" rx="1.5" fill="currentColor" opacity=".3"/>
  <rect x="17" y="13" width="10" height="13" rx="1.5" fill="currentColor" opacity=".4"/>
</>, p);

const watchers = (p?: IconProps) => svg(<>
  <path d="M2 16 C5 9 11 5 16 5 C21 5 27 9 30 16 C27 23 21 27 16 27 C11 27 5 23 2 16 Z"
    stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".1"/>
  <circle cx="16" cy="16" r="5.5" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity=".25"/>
  <path d="M17 11 L14 17 L17 17 L15 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
</>, p);

// Shield + check — story health / validation.
const validate = (p?: IconProps) => svg(<>
  <path d="M16 3 L27 7 V15 C27 22 22 27 16 29 C10 27 5 22 5 15 V7 Z"
    stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".1" strokeLinejoin="round"/>
  <path d="M11 16 L15 20 L21 11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
</>, p);

// Bar chart — story statistics.
const stats = (p?: IconProps) => svg(<>
  <rect x="5"    y="14" width="5" height="13" rx="1" fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.6"/>
  <rect x="13.5" y="8"  width="5" height="19" rx="1" fill="currentColor" fillOpacity=".4"  stroke="currentColor" strokeWidth="1.6"/>
  <rect x="22"   y="18" width="5" height="9"  rx="1" fill="currentColor" fillOpacity=".3"  stroke="currentColor" strokeWidth="1.6"/>
</>, p);

// Clipboard with checks — quest log.
const quests = (p?: IconProps) => svg(<>
  <rect x="6" y="5" width="20" height="23" rx="2" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".08"/>
  <rect x="11" y="3" width="10" height="5" rx="1.5" fill="currentColor" fillOpacity=".25" stroke="currentColor" strokeWidth="1.5"/>
  <path d="M10 13.5l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  <path d="M18.5 13.5h3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  <path d="M10 21.5l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  <path d="M18.5 21.5h3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
</>, p);

export const SIDEBAR_SVG_ICONS = {
  scenes,
  characters: BLOCK_SVG_ICONS.paperdoll,
  items: BLOCK_SVG_ICONS.inventory,
  containers: BLOCK_SVG_ICONS.container,
  plugins: BLOCK_SVG_ICONS.plugin,
  variables: BLOCK_SVG_ICONS['variable-set'],
  assets: BLOCK_SVG_ICONS.image,
  panel,
  watchers,
  validate,
  stats,
  quests,
};
