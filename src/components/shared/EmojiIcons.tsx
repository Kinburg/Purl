/**
 * EmojiIcons.tsx
 *
 * Central registry of SVG icons that replace the emoji glyphs scattered
 * throughout the codebase. Each entry is a small inline component that
 * inherits color via `currentColor` and accepts `className` (for sizing).
 *
 * The set covers exactly the emoji that used to live in the UI:
 *   ✨  📊  🔗  👕  🧪  📦  🖼️  🎁  🧩  🎲  ⚙️  🎒  ✍  ⏱  ⚡  📋
 *
 * Render any icon by name: `<EmojiIcon name="sparkle" />`.
 */

import type { ReactNode } from 'react';

interface IconProps {
  className?: string;
  size?: number | string;
  title?: string;
}

const wrap = (content: ReactNode, props?: IconProps, viewBox = '0 0 24 24') => {
  const { className, size = 16, title } = props ?? {};
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {content}
    </svg>
  );
};

// ── ✨ Sparkle (AI generate, magic action) ─────────────────────────────────
const EmojiSparkle = (p?: IconProps) => wrap(
  <>
    <path
      d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4L12 3z"
      fill="currentColor"
      stroke="none"
    />
    <path
      d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z"
      fill="currentColor"
      stroke="none"
    />
  </>,
  p,
);

// ── 📊 Chart / dynamic data ────────────────────────────────────────────────
const EmojiChart = (p?: IconProps) => wrap(
  <>
    <path d="M3 3v18h18" />
    <rect x="7"  y="12" width="3" height="6" rx="0.5" fill="currentColor" stroke="none" />
    <rect x="12" y="8"  width="3" height="10" rx="0.5" fill="currentColor" stroke="none" />
    <rect x="17" y="5"  width="3" height="13" rx="0.5" fill="currentColor" stroke="none" />
  </>,
  p,
);

// ── 🔗 Link / static binding ───────────────────────────────────────────────
const EmojiLink = (p?: IconProps) => wrap(
  <>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1-1" />
  </>,
  p,
);

// ── 👕 Wearable / shirt ────────────────────────────────────────────────────
const EmojiShirt = (p?: IconProps) => wrap(
  <>
    <path d="M8 3 L4 6 L6 10 L8.5 9 V21 H15.5 V9 L18 10 L20 6 L16 3 L14 5 Q12 6.5 10 5 Z" />
  </>,
  p,
);

// ── 🧪 Consumable / potion ─────────────────────────────────────────────────
const EmojiPotion = (p?: IconProps) => wrap(
  <>
    <path d="M9 2h6" />
    <path d="M10 2v6.5L5.5 17a3 3 0 0 0 2.7 4h7.6a3 3 0 0 0 2.7-4L14 8.5V2" />
    <path d="M7.2 14h9.6" opacity="0.6" />
  </>,
  p,
);

// ── 📦 Box / misc / chest ──────────────────────────────────────────────────
const EmojiBox = (p?: IconProps) => wrap(
  <>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </>,
  p,
);

// ── 🖼️ Image / picture frame ───────────────────────────────────────────────
const EmojiImage = (p?: IconProps) => wrap(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="9" r="1.5" fill="currentColor" stroke="none" />
    <path d="M21 15l-5-5-10 10" />
  </>,
  p,
);

// ── 🎁 Loot / gift ─────────────────────────────────────────────────────────
const EmojiGift = (p?: IconProps) => wrap(
  <>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
    <path d="M12 8v14" />
    <path d="M12 8c-2 0-4-1-4-3a2 2 0 0 1 4 0 2 2 0 0 1 4 0c0 2-2 3-4 3z" />
  </>,
  p,
);

// ── 🧩 Plugin / puzzle piece ───────────────────────────────────────────────
const EmojiPuzzle = (p?: IconProps) => wrap(
  <>
    <path d="M9 3a2 2 0 0 1 4 0v2h3a1 1 0 0 1 1 1v3h2a2 2 0 0 1 0 4h-2v3a1 1 0 0 1-1 1h-3v2a2 2 0 0 1-4 0v-2H6a1 1 0 0 1-1-1v-3H3a2 2 0 0 1 0-4h2V6a1 1 0 0 1 1-1h3V3z" />
  </>,
  p,
);

// ── 🎲 Dice / random ───────────────────────────────────────────────────────
const EmojiDice = (p?: IconProps) => wrap(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="8"  cy="8"  r="1.3" fill="currentColor" stroke="none" />
    <circle cx="16" cy="8"  r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="8"  cy="16" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none" />
  </>,
  p,
);

// ── ⚙️ Cog / settings / expression mode ────────────────────────────────────
const EmojiCog = (p?: IconProps) => wrap(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </>,
  p,
);

// ── 🎒 Backpack / inventory ────────────────────────────────────────────────
const EmojiBackpack = (p?: IconProps) => wrap(
  <>
    <path d="M6 8a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8z" />
    <path d="M9 4.5c0-1 1-2 3-2s3 1 3 2" />
    <rect x="9" y="12" width="6" height="5" rx="1" />
    <path d="M9 14h6" opacity="0.6" />
  </>,
  p,
);

// ── ✍ Pencil / typewriter / write ──────────────────────────────────────────
const EmojiPencil = (p?: IconProps) => wrap(
  <>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    <path d="M14 6l4 4" />
  </>,
  p,
);

// ── ⏱ Stopwatch / delay ────────────────────────────────────────────────────
const EmojiStopwatch = (p?: IconProps) => wrap(
  <>
    <circle cx="12" cy="14" r="8" />
    <path d="M12 14V9.5" />
    <path d="M9 2h6" />
    <path d="M12 2v3" />
    <path d="M18.5 7.5l1.5-1.5" opacity="0.6" />
  </>,
  p,
);

// ── ⚡ Bolt / lightning / generate / watcher ───────────────────────────────
const EmojiBolt = (p?: IconProps) => wrap(
  <>
    <path
      d="M13 2L3 14h8l-1 8 11-13h-8l1-7z"
      fill="currentColor"
      stroke="currentColor"
      strokeLinejoin="round"
    />
  </>,
  p,
);

// ── 📋 Clipboard / paste / copy ────────────────────────────────────────────
const EmojiClipboard = (p?: IconProps) => wrap(
  <>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <rect x="9" y="2" width="6" height="4" rx="1" fill="currentColor" stroke="currentColor" />
    <path d="M9 12h6M9 16h4" opacity="0.6" />
  </>,
  p,
);

// ── 📁 Folder ────────────────────────────────────────────────────────────────
const EmojiFolder = (p?: IconProps) => wrap(
  <>
    <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" />
  </>,
  p,
);

// ── 📄 Document / page ───────────────────────────────────────────────────────
const EmojiDocument = (p?: IconProps) => wrap(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h6M9 9h2" opacity="0.6" />
  </>,
  p,
);

// ── 🔊 Speaker / audio ───────────────────────────────────────────────────────
const EmojiSpeaker = (p?: IconProps) => wrap(
  <>
    <path d="M11 5L6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" opacity="0.7" />
  </>,
  p,
);

// ── 🎥 Video / film ───────────────────────────────────────────────────────────
const EmojiVideo = (p?: IconProps) => wrap(
  <>
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="M16 10l6-3v10l-6-3z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
  </>,
  p,
);

// ── 🗑 Trash / delete ────────────────────────────────────────────────────────
const EmojiTrash = (p?: IconProps) => wrap(
  <>
    <path d="M4 7h16" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    <path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
    <path d="M10 11v7M14 11v7" opacity="0.7" />
  </>,
  p,
);

// ── 🔍 Search / magnifier ────────────────────────────────────────────────────
const EmojiSearch = (p?: IconProps) => wrap(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
  p,
);

// ── 📝 Note / pencil-on-page (rename, edit name) ──────────────────────────────
const EmojiNote = (p?: IconProps) => wrap(
  <>
    <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L12 14l-4 1 1-4 7.5-7.5z" />
  </>,
  p,
);

// ── 👤 Person / avatar placeholder ────────────────────────────────────────────
const EmojiPerson = (p?: IconProps) => wrap(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
  p,
);

// ── 📥 Inbox / import / download ──────────────────────────────────────────────
const EmojiDownload = (p?: IconProps) => wrap(
  <>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </>,
  p,
);

// ── 📤 Outbox / export / upload ────────────────────────────────────────────────
const EmojiUpload = (p?: IconProps) => wrap(
  <>
    <path d="M12 21V9" />
    <path d="M7 14l5-5 5 5" />
    <path d="M5 3h14" />
  </>,
  p,
);

// ── ⭐ Star / favorite / hero ──────────────────────────────────────────────────
const EmojiStar = (p?: IconProps) => wrap(
  <>
    <path
      d="M12 2.5l2.94 6.32 6.56.84-4.85 4.55 1.27 6.79L12 17.8l-5.92 3.2 1.27-6.79L2.5 9.66l6.56-.84z"
      fill="currentColor"
      stroke="currentColor"
      strokeLinejoin="round"
    />
  </>,
  p,
);

// ── ⚠ Warning triangle ────────────────────────────────────────────────────────
const EmojiWarning = (p?: IconProps) => wrap(
  <>
    <path d="M12 3 L22 20 H2 Z" />
    <path d="M12 10v5" />
    <circle cx="12" cy="18" r="0.8" fill="currentColor" stroke="none" />
  </>,
  p,
);

// ── ℹ Info circle ────────────────────────────────────────────────────────────
const EmojiInfo = (p?: IconProps) => wrap(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6" />
    <circle cx="12" cy="7.8" r="0.8" fill="currentColor" stroke="none" />
  </>,
  p,
);

// ── ✓ Check ──────────────────────────────────────────────────────────────────
const EmojiCheck = (p?: IconProps) => wrap(
  <>
    <path d="m4 12 5 5 11-12" />
  </>,
  p,
);

// ── × Close / multiply ────────────────────────────────────────────────────────
const EmojiClose = (p?: IconProps) => wrap(
  <>
    <path d="M5 5l14 14M19 5L5 19" />
  </>,
  p,
);

// ── ▶ Caret right / play ──────────────────────────────────────────────────────
const EmojiCaretRight = (p?: IconProps) => wrap(
  <>
    <path d="M9 5l9 7-9 7z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
  </>,
  p,
);

// ── ▼ Caret down ───────────────────────────────────────────────────────────────
const EmojiCaretDown = (p?: IconProps) => wrap(
  <>
    <path d="M5 9l7 9 7-9z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
  </>,
  p,
);

// ── ≡ Hamburger / drag handle ────────────────────────────────────────────────────────────
const EmojiHamburger = (p?: IconProps) => wrap(
  <>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </>,
  p,
);

// ── Duplicate / clone ───────────────────────────────────────────────────────────
const EmojiDuplicate = (p?: IconProps) => wrap(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </>,
  p,
);

// ── ⚑ Flag ───────────────────────────────────────────────────────────────────
const EmojiFlag = (p?: IconProps) => wrap(
  <>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
  </>,
  p,
);

// ── ☑ Checkbox / array mode ──────────────────────────────────────────────────────────
const EmojiCheckbox = (p?: IconProps) => wrap(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <path d="m7 12 3.5 3.5L17 9" />
  </>,
  p,
);

// ── 🏪 Shop / store ───────────────────────────────────────────────────────────────
const EmojiShop = (p?: IconProps) => wrap(
  <>
    <path d="M3 8l1.5-4h15L21 8" />
    <path d="M3 8v0a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    <path d="M5 8v12h14V8" />
    <rect x="10" y="13" width="4" height="7" />
  </>,
  p,
);

// ── Registry ───────────────────────────────────────────────────────────────

export type EmojiIconName =
  | 'sparkle'
  | 'chart'
  | 'link'
  | 'shirt'
  | 'potion'
  | 'box'
  | 'image'
  | 'gift'
  | 'puzzle'
  | 'dice'
  | 'cog'
  | 'backpack'
  | 'pencil'
  | 'stopwatch'
  | 'bolt'
  | 'clipboard'
  | 'folder'
  | 'document'
  | 'speaker'
  | 'video'
  | 'trash'
  | 'search'
  | 'note'
  | 'person'
  | 'download'
  | 'upload'
  | 'star'
  | 'warning'
  | 'info'
  | 'check'
  | 'close'
  | 'caret-right'
  | 'caret-down'
  | 'hamburger'
  | 'duplicate'
  | 'flag'
  | 'checkbox'
  | 'shop';

const EMOJI_ICON_MAP: Record<EmojiIconName, (p?: IconProps) => ReactNode> = {
  sparkle:   EmojiSparkle,
  chart:     EmojiChart,
  link:      EmojiLink,
  shirt:     EmojiShirt,
  potion:    EmojiPotion,
  box:       EmojiBox,
  image:     EmojiImage,
  gift:      EmojiGift,
  puzzle:    EmojiPuzzle,
  dice:      EmojiDice,
  cog:       EmojiCog,
  backpack:  EmojiBackpack,
  pencil:    EmojiPencil,
  stopwatch: EmojiStopwatch,
  bolt:      EmojiBolt,
  clipboard: EmojiClipboard,
  folder:    EmojiFolder,
  document:  EmojiDocument,
  speaker:   EmojiSpeaker,
  video:     EmojiVideo,
  trash:     EmojiTrash,
  search:    EmojiSearch,
  note:      EmojiNote,
  person:    EmojiPerson,
  download:  EmojiDownload,
  upload:    EmojiUpload,
  star:      EmojiStar,
  warning:   EmojiWarning,
  info:      EmojiInfo,
  check:     EmojiCheck,
  close:     EmojiClose,
  'caret-right': EmojiCaretRight,
  'caret-down':  EmojiCaretDown,
  hamburger: EmojiHamburger,
  duplicate: EmojiDuplicate,
  flag:      EmojiFlag,
  checkbox:  EmojiCheckbox,
  shop:      EmojiShop,
};

interface EmojiIconProps extends IconProps {
  name: EmojiIconName;
}

/** Render an icon by name (`<EmojiIcon name="box" />`). */
export function EmojiIcon({ name, ...rest }: EmojiIconProps) {
  const Comp = EMOJI_ICON_MAP[name];
  return Comp ? <>{Comp(rest)}</> : null;
}

