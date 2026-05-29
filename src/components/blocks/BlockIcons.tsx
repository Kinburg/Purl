import type { BlockType } from '../../types';

interface IconProps { className?: string }

const svg = (content: React.ReactNode, props?: IconProps) => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={props?.className}>
    {content}
  </svg>
);

export const BLOCK_SVG_ICONS: Record<BlockType, (p?: IconProps) => React.ReactNode> = {
  text: (p) => svg(<>
    <rect x="3" y="7" width="26" height="2.5" rx="1.25" fill="currentColor"/>
    <rect x="3" y="13" width="20" height="2.5" rx="1.25" fill="currentColor" opacity=".7"/>
    <rect x="3" y="19" width="24" height="2.5" rx="1.25" fill="currentColor" opacity=".7"/>
    <rect x="3" y="25" width="14" height="2.5" rx="1.25" fill="currentColor" opacity=".45"/>
  </>, p),

  dialogue: (p) => svg(<>
    <path d="M2 6 Q2 3 5 3 H27 Q30 3 30 6 V17 Q30 20 27 20 H15 L8 27 L9 20 H5 Q2 20 2 17 Z" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".12"/>
    <rect x="8" y="9" width="12" height="2" rx="1" fill="currentColor" opacity=".85"/>
    <rect x="8" y="13.5" width="8" height="2" rx="1" fill="currentColor" opacity=".55"/>
  </>, p),

  choice: (p) => svg(<>
    <circle cx="5" cy="10" r="2.2" fill="currentColor"/>
    <rect x="10" y="8.5" width="17" height="2.5" rx="1.25" fill="currentColor" opacity=".8"/>
    <circle cx="5" cy="18" r="2.2" fill="currentColor" opacity=".55"/>
    <rect x="10" y="16.5" width="13" height="2.5" rx="1.25" fill="currentColor" opacity=".55"/>
    <circle cx="5" cy="26" r="2.2" fill="currentColor" opacity=".3"/>
    <rect x="10" y="24.5" width="15" height="2.5" rx="1.25" fill="currentColor" opacity=".3"/>
    <path d="M26 9 L29 10 L26 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </>, p),

  condition: (p) => svg(<>
    <path d="M16 2 L30 16 L16 30 L2 16 Z" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".12"/>
    <path d="M16 30 L10 34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5"/>
    <path d="M16 30 L22 34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5"/>
    <rect x="11" y="13.5" width="4" height="2" rx="1" fill="currentColor" opacity=".9"/>
    <rect x="11" y="17.5" width="4" height="2" rx="1" fill="currentColor" opacity=".6"/>
    <rect x="17" y="13.5" width="5" height="2" rx="1" fill="currentColor" opacity=".4"/>
    <rect x="17" y="17.5" width="5" height="2" rx="1" fill="currentColor" opacity=".25"/>
  </>, p),

  'variable-set': (p) => svg(<>
    <rect x="2" y="8" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".12"/>
    <path d="M7.5 11.5 C6 11.5 6 14 7.5 14 C9 14 9 16.5 7.5 16.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M7.5 10.5 L7.5 11.5 M7.5 16.5 L7.5 17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M15 13.5 L19 13.5 M17.5 11.5 L20 13.5 L17.5 15.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="21" y="8" width="9" height="11" rx="2.5" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.7"/>
    <rect x="23.5" y="12" width="4" height="1.5" rx=".75" fill="currentColor"/>
    <rect x="23.5" y="15" width="4" height="1.5" rx=".75" fill="currentColor" opacity=".6"/>
  </>, p),

  'set-object': (p) => svg(<>
    {/* Curly-brace container with key/value rows inside */}
    <path d="M9 4 Q5 4 5 8 V13 Q5 16 2 16 Q5 16 5 19 V24 Q5 28 9 28" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
    <path d="M23 4 Q27 4 27 8 V13 Q27 16 30 16 Q27 16 27 19 V24 Q27 28 23 28" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/>
    <rect x="9.5" y="9"  width="4" height="2" rx="1" fill="currentColor"/>
    <rect x="15" y="9"  width="7" height="2" rx="1" fill="currentColor" opacity=".55"/>
    <rect x="9.5" y="14" width="4" height="2" rx="1" fill="currentColor"/>
    <rect x="15" y="14" width="6" height="2" rx="1" fill="currentColor" opacity=".55"/>
    <rect x="9.5" y="19" width="4" height="2" rx="1" fill="currentColor"/>
    <rect x="15" y="19" width="8" height="2" rx="1" fill="currentColor" opacity=".55"/>
  </>, p),

  'for': (p) => svg(<>
    {/* Circular arrow (loop) + 3 dots representing the iteration */}
    <path d="M25 9 A11 11 0 1 0 27 19" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M22 5 L25 9 L21 11" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="11" cy="16" r="1.6" fill="currentColor"/>
    <circle cx="16" cy="16" r="1.6" fill="currentColor" opacity=".7"/>
    <circle cx="21" cy="16" r="1.6" fill="currentColor" opacity=".4"/>
  </>, p),

  image: (p) => svg(<>
    <rect x="2" y="5" width="28" height="22" rx="3" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".08"/>
    <circle cx="10" cy="12" r="2.5" fill="currentColor" opacity=".55"/>
    <path d="M2 23 L9 15 L15 21 L20 16 L30 23" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity=".18"/>
  </>, p),

  'image-gen': (p) => svg(<>
    <path d="M13 3 L15.3 8.6 L21 10 L15.3 11.4 L13 17 L10.7 11.4 L5 10 L10.7 8.6Z" fill="currentColor" opacity=".8"/>
    <rect x="12" y="18" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity=".1"/>
    <circle cx="16" cy="23" r="2" fill="currentColor" opacity=".55"/>
    <circle cx="24" cy="23" r="2" fill="currentColor" opacity=".35"/>
    <path d="M5 22 L11 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".4"/>
    <path d="M5 26 L11 26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".25"/>
  </>, p),

  video: (p) => svg(<>
    <rect x="2" y="6" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".08"/>
    <path d="M13 11 L23 16 L13 21 Z" fill="currentColor" opacity=".75"/>
    <rect x="2" y="6" width="28" height="4" rx="3" fill="currentColor" fillOpacity=".15"/>
    <circle cx="7" cy="8" r="1" fill="currentColor" opacity=".6"/>
    <circle cx="11" cy="8" r="1" fill="currentColor" opacity=".4"/>
    <circle cx="15" cy="8" r="1" fill="currentColor" opacity=".25"/>
  </>, p),

  audio: (p) => svg(<>
    <path d="M5 12 H10 L18 5 V27 L10 20 H5 Z" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity=".18"/>
    <path d="M21.5 10 C25 12.5 25 19.5 21.5 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    <path d="M24.5 7 C30 10.5 30 21.5 24.5 25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".5"/>
  </>, p),

  'audio-gen': (p) => svg(<>
    {/* Speaker — slightly smaller, lower-left */}
    <path d="M4 14 H8 L14 8 V26 L8 20 H4 Z" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity=".18"/>
    <path d="M16.5 12 C19 14 19 20 16.5 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".7"/>
    {/* Generation spark — upper-right corner */}
    <path d="M24 4 L25.4 7.6 L29 9 L25.4 10.4 L24 14 L22.6 10.4 L19 9 L22.6 7.6 Z" fill="currentColor" opacity=".85"/>
    {/* Small accent dot */}
    <circle cx="27" cy="18" r="1.4" fill="currentColor" opacity=".5"/>
    <circle cx="29.5" cy="22" r="1" fill="currentColor" opacity=".35"/>
  </>, p),

  table: (p) => svg(<>
    <rect x="2" y="3" width="28" height="26" rx="2.5" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".07"/>
    <rect x="2" y="3" width="28" height="7" rx="2.5" fill="currentColor" fillOpacity=".2"/>
    <path d="M2 17 H30" stroke="currentColor" strokeWidth="1.3" opacity=".5"/>
    <path d="M2 24 H30" stroke="currentColor" strokeWidth="1.3" opacity=".5"/>
    <path d="M12 10 V29" stroke="currentColor" strokeWidth="1.3" opacity=".5"/>
    <path d="M22 10 V29" stroke="currentColor" strokeWidth="1.3" opacity=".5"/>
  </>, p),

  paperdoll: (p) => svg(<>
    <ellipse cx="16" cy="9" rx="4.5" ry="5.5" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity=".12"/>
    <path d="M8 28 C8 21 24 21 24 28" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
    <rect x="10" y="15" width="4" height="5" rx="1" fill="currentColor" opacity=".4"/>
    <rect x="18" y="15" width="4" height="5" rx="1" fill="currentColor" opacity=".4"/>
    <circle cx="16" cy="17" r="1.5" fill="currentColor" opacity=".6"/>
  </>, p),

  inventory: (p) => svg(<>
    <rect x="4" y="6" width="24" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".08"/>
    <rect x="8" y="11" width="7" height="5" rx="1" fill="currentColor" opacity=".5"/>
    <rect x="8" y="18" width="7" height="5" rx="1" fill="currentColor" opacity=".35"/>
    <rect x="17" y="11" width="7" height="5" rx="1" fill="currentColor" opacity=".3"/>
    <rect x="17" y="18" width="7" height="5" rx="1" fill="currentColor" opacity=".2"/>
    <path d="M8 8 H24" stroke="currentColor" strokeWidth="1.2" opacity=".4"/>
  </>, p),

  divider: (p) => svg(<>
    <rect x="3" y="7" width="20" height="2" rx="1" fill="currentColor" opacity=".3"/>
    <rect x="3" y="11.5" width="14" height="2" rx="1" fill="currentColor" opacity=".2"/>
    <rect x="2" y="17" width="28" height="2.5" rx="1.25" fill="currentColor"/>
    <rect x="3" y="22.5" width="18" height="2" rx="1" fill="currentColor" opacity=".3"/>
    <rect x="3" y="27" width="12" height="2" rx="1" fill="currentColor" opacity=".2"/>
  </>, p),

  // Spacer — two content bars with empty gap + up/down arrows marking the gap.
  spacer: (p) => svg(<>
    <rect x="3" y="5" width="26" height="3" rx="1.5" fill="currentColor" opacity=".35"/>
    <rect x="3" y="24" width="26" height="3" rx="1.5" fill="currentColor" opacity=".35"/>
    <path d="M16 11 V21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".8"/>
    <path d="M13 13 L16 10.5 L19 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".8"/>
    <path d="M13 19 L16 21.5 L19 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".8"/>
  </>, p),

  button: (p) => svg(<>
    <rect x="3" y="10" width="26" height="12" rx="6" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="9" y="14.5" width="14" height="2.5" rx="1.25" fill="currentColor" opacity=".75"/>
    <path d="M5 22 Q3 28 8 30" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".3"/>
  </>, p),

  link: (p) => svg(<>
    <rect x="2" y="10" width="20" height="12" rx="6" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="7" y="14.5" width="9" height="2.5" rx="1.25" fill="currentColor" opacity=".7"/>
    <path d="M24 16 H31" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M27.5 12.5 L31.5 16 L27.5 19.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </>, p),

  // Chain-link glyph — a bare hyperlink (no button chrome), as used in menus.
  'menu-link': (p) => svg(<>
    <path d="M13 19 L19 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M11.5 14.5 L8.5 17.5 a4 4 0 0 1 -5.7 -5.7 L6 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M20.5 17.5 L23.5 14.5 a4 4 0 0 0 -5.7 -5.7 L14.5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </>, p),

  'input-field': (p) => svg(<>
    <rect x="2" y="9" width="28" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".07"/>
    <rect x="7" y="14" width="11" height="2" rx="1" fill="currentColor" opacity=".55"/>
    <rect x="18" y="12.5" width="1.8" height="5" rx=".9" fill="currentColor" opacity=".9"/>
    <path d="M5 9 L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".45"/>
    <path d="M27 9 L27 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".45"/>
  </>, p),

  checkbox: (p) => svg(<>
    <rect x="3" y="5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".15"/>
    <path d="M6 10.5 L8.5 13 L14 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="3" y="20" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" opacity=".45"/>
    <rect x="18" y="8" width="11" height="2.5" rx="1.25" fill="currentColor" opacity=".7"/>
    <rect x="18" y="23" width="9" height="2.5" rx="1.25" fill="currentColor" opacity=".35"/>
  </>, p),

  radio: (p) => svg(<>
    <circle cx="9" cy="10" r="5.5" stroke="currentColor" strokeWidth="1.8"/>
    <circle cx="9" cy="10" r="2.5" fill="currentColor"/>
    <circle cx="9" cy="24" r="5.5" stroke="currentColor" strokeWidth="1.8" opacity=".4"/>
    <rect x="18" y="7.5" width="11" height="2.5" rx="1.25" fill="currentColor" opacity=".75"/>
    <rect x="18" y="21.5" width="9" height="2.5" rx="1.25" fill="currentColor" opacity=".35"/>
  </>, p),

  function: (p) => svg(<>
    <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".1"/>
    <path d="M19 7 C15 7 13 10 13 13 V26" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    <path d="M9 16.5 H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </>, p),

  popup: (p) => svg(<>
    <rect x="1" y="3" width="23" height="19" rx="2.5" fill="currentColor" fillOpacity=".06" stroke="currentColor" strokeWidth="1.3" opacity=".35"/>
    <rect x="8" y="10" width="23" height="19" rx="3" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".12"/>
    <rect x="8" y="10" width="23" height="6" rx="3" fill="currentColor" fillOpacity=".28"/>
    <rect x="8" y="13" width="23" height="3" fill="currentColor" fillOpacity=".28"/>
    <circle cx="27" cy="13" r="1.6" fill="currentColor" opacity=".75"/>
    <rect x="12" y="20" width="11" height="2" rx="1" fill="currentColor" opacity=".65"/>
    <rect x="12" y="24" width="8" height="2" rx="1" fill="currentColor" opacity=".4"/>
  </>, p),

  raw: (p) => svg(<>
    <path d="M10 9 L3 16 L10 23" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 9 L29 16 L22 23" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M19 6.5 L13 25.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".65"/>
  </>, p),

  note: (p) => svg(<>
    <path d="M4 4 H22 L28 10 V30 H4 Z" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".08"/>
    <path d="M22 4 L22 10 H28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="8" y="15" width="13" height="2" rx="1" fill="currentColor" opacity=".6"/>
    <rect x="8" y="20" width="10" height="2" rx="1" fill="currentColor" opacity=".45"/>
    <rect x="8" y="25" width="12" height="2" rx="1" fill="currentColor" opacity=".3"/>
  </>, p),

  include: (p) => svg(<>
    <rect x="2" y="4" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".07"/>
    <rect x="7" y="9" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity=".14"/>
    <rect x="10" y="13" width="8" height="1.8" rx=".9" fill="currentColor" opacity=".65"/>
    <rect x="10" y="17" width="6" height="1.8" rx=".9" fill="currentColor" opacity=".4"/>
    <path d="M2 4 L7 9" stroke="currentColor" strokeWidth="1.3" opacity=".35"/>
    <path d="M30 4 L25 9" stroke="currentColor" strokeWidth="1.3" opacity=".35"/>
  </>, p),

  container: (p) => svg(<>
    <rect x="3" y="10" width="26" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".08"/>
    <path d="M3 15 H29" stroke="currentColor" strokeWidth="1.3" opacity=".4"/>
    <rect x="11" y="4" width="10" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity=".15"/>
    <rect x="7" y="19" width="5" height="5" rx="1" fill="currentColor" opacity=".45"/>
    <rect x="14" y="19" width="5" height="5" rx="1" fill="currentColor" opacity=".3"/>
    <rect x="21" y="19" width="5" height="5" rx="1" fill="currentColor" opacity=".2"/>
  </>, p),

  'time-manipulation': (p) => svg(<>
    <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".08"/>
    <path d="M16 9 V16 L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 5 L7 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5"/>
    <path d="M23 5 L25 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5"/>
    <path d="M4 16 L1 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".4"/>
    <path d="M31 16 L28 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".4"/>
  </>, p),

  plugin: (p) => svg(<>
    <rect x="6" y="10" width="20" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".1"/>
    <rect x="10" y="4" width="4" height="8" rx="1" fill="currentColor" fillOpacity=".5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="18" y="4" width="4" height="8" rx="1" fill="currentColor" fillOpacity=".5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="2" y="16" width="6" height="4" rx="1" fill="currentColor" fillOpacity=".4" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="24" y="16" width="6" height="4" rx="1" fill="currentColor" fillOpacity=".4" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="16" cy="19" r="2.5" fill="currentColor" opacity=".65"/>
  </>, p),

  tabs: (p) => svg(<>
    {/* Two tab pills sitting on top of a body rectangle */}
    <path d="M3 10 H12 L13 7 H19 L20 10 H29 V27 H3 Z" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".12" strokeLinejoin="round"/>
    <rect x="6" y="15" width="20" height="2" rx="1" fill="currentColor" opacity=".7"/>
    <rect x="6" y="19" width="14" height="2" rx="1" fill="currentColor" opacity=".5"/>
    <rect x="6" y="23" width="17" height="2" rx="1" fill="currentColor" opacity=".4"/>
  </>, p),

  // Progress — a meter bar partially filled.
  progress: (p) => svg(<>
    <rect x="2" y="12" width="28" height="8" rx="4" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".1"/>
    <rect x="4" y="14" width="15" height="4" rx="2" fill="currentColor" opacity=".8"/>
  </>, p),

  // Audio volume — a speaker with radiating sound waves.
  'audio-volume': (p) => svg(<>
    <path d="M4 13 H8 L13 8 V24 L8 19 H4 Z" fill="currentColor" opacity=".8"/>
    <path d="M17 11 Q20 16 17 21" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".65"/>
    <path d="M20.5 8 Q25.5 16 20.5 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".4"/>
  </>, p),

  // Date-Time — a clock face with hands.
  'date-time': (p) => svg(<>
    <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity=".1"/>
    <path d="M16 9 V16 L21 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </>, p),

  // Callout — a notice box with a thick accent bar on the left.
  callout: (p) => svg(<>
    <rect x="4" y="7" width="24" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".08"/>
    <rect x="4" y="7" width="4" height="18" rx="1" fill="currentColor" opacity=".8"/>
    <rect x="12" y="12" width="12" height="2" rx="1" fill="currentColor" opacity=".6"/>
    <rect x="12" y="17" width="9" height="2" rx="1" fill="currentColor" opacity=".4"/>
  </>, p),

  // Select — a dropdown field with a chevron.
  select: (p) => svg(<>
    <rect x="3" y="9" width="26" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".08"/>
    <rect x="7" y="15" width="10" height="2" rx="1" fill="currentColor" opacity=".6"/>
    <path d="M21.5 14.5 L24 17 L26.5 14.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </>, p),

  // Slider — a track with a draggable knob.
  slider: (p) => svg(<>
    <rect x="3" y="15" width="26" height="2.5" rx="1.25" fill="currentColor" opacity=".4"/>
    <circle cx="20" cy="16.25" r="4.5" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.8"/>
  </>, p),

  // DisplayObject — a framed stat sheet (label/value rows).
  'display-object': (p) => svg(<>
    <rect x="3" y="5" width="26" height="22" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".08"/>
    <rect x="6"  y="9"  width="8" height="2" rx="1" fill="currentColor" opacity=".75"/>
    <rect x="18" y="9"  width="8" height="2" rx="1" fill="currentColor" opacity=".5"/>
    <rect x="6"  y="14" width="8" height="2" rx="1" fill="currentColor" opacity=".75"/>
    <rect x="18" y="14" width="8" height="2" rx="1" fill="currentColor" opacity=".5"/>
    <rect x="6"  y="19" width="8" height="2" rx="1" fill="currentColor" opacity=".75"/>
    <rect x="18" y="19" width="8" height="2" rx="1" fill="currentColor" opacity=".5"/>
  </>, p),

  // Section — titled box: a header bar + framed content area.
  section: (p) => svg(<>
    <rect x="3" y="5" width="26" height="22" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity=".08"/>
    <rect x="3" y="5" width="26" height="6" rx="2.5" fill="currentColor" opacity=".35"/>
    <rect x="7" y="15" width="18" height="2" rx="1" fill="currentColor" opacity=".55"/>
    <rect x="7" y="20" width="13" height="2" rx="1" fill="currentColor" opacity=".4"/>
  </>, p),
};
