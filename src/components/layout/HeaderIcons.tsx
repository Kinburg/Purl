interface IconProps { className?: string }

const svg = (content: React.ReactNode, props?: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" className={props?.className}>
    {content}
  </svg>
);

export const Icon = {
  save: (p?: IconProps) => svg(<>
    <path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>
    <path d="M7 3v6h9V3"/>
    <rect x="7" y="13" width="10" height="8" rx="1"/>
  </>, p),

  folderOpen: (p?: IconProps) => svg(<>
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v2H3V7Z"/>
    <path d="M3 11h18l-2 8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8Z"/>
  </>, p),

  folder: (p?: IconProps) => svg(<>
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z"/>
  </>, p),

  filePlus: (p?: IconProps) => svg(<>
    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/>
    <path d="M14 3v5h5"/>
    <path d="M12 12v6M9 15h6"/>
  </>, p),

  fileOpen: (p?: IconProps) => svg(<>
    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/>
    <path d="M14 3v5h5"/>
    <path d="M9 14l3 3 3-3"/>
    <path d="M12 11v6"/>
  </>, p),

  settings: (p?: IconProps) => svg(<>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>
  </>, p),

  tools: (p?: IconProps) => svg(<>
    <path d="M14.7 6.3a4 4 0 0 0 5 5L17 14l-7 7-3-3 7-7-2.7-2.7Z"/>
    <path d="M7 14l-4 4 3 3 4-4"/>
  </>, p),

  brain: (p?: IconProps) => svg(<>
    <path d="M9 4a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 10v1a3 3 0 0 0 1 2.2V15a3 3 0 0 0 3 3h.5a2 2 0 0 0 3.5-1.3V5.3A2 2 0 0 0 9 4Z"/>
    <path d="M15 4a3 3 0 0 1 3 3v.5a3 3 0 0 1 2 2.5v1a3 3 0 0 1-1 2.2V15a3 3 0 0 1-3 3h-.5a2 2 0 0 1-3.5-1.3V5.3A2 2 0 0 1 15 4Z"/>
  </>, p),

  info: (p?: IconProps) => svg(<>
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 11v5M12 8h.01"/>
  </>, p),

  languages: (p?: IconProps) => svg(<>
    <path d="M3 6h11M9 4v2M5 6c0 6 4 8 8 8M11 14a8 8 0 0 1-7 4"/>
    <path d="M14 21l4-9 4 9M16 17h4"/>
  </>, p),

  code: (p?: IconProps) => svg(<>
    <path d="m9 18-6-6 6-6M15 6l6 6-6 6"/>
  </>, p),

  network: (p?: IconProps) => svg(<>
    <circle cx="6" cy="6" r="2.5"/>
    <circle cx="18" cy="6" r="2.5"/>
    <circle cx="12" cy="18" r="2.5"/>
    <path d="M7.7 7.7 10.5 16M16.3 7.7 13.5 16M8 6h8"/>
  </>, p),

  play: (p?: IconProps) => svg(<>
    <path d="M8 5.5v13l11-6.5L8 5.5Z"/>
  </>, p),

  undo: (p?: IconProps) => svg(<>
    <path d="M9 14 4 9l5-5"/>
    <path d="M4 9h11a5 5 0 0 1 0 10H9"/>
  </>, p),

  redo: (p?: IconProps) => svg(<>
    <path d="m15 14 5-5-5-5"/>
    <path d="M20 9H9a5 5 0 0 0 0 10h6"/>
  </>, p),

  pencil: (p?: IconProps) => svg(<>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>
  </>, p),

  chevronDown: (p?: IconProps) => svg(<>
    <path d="m6 9 6 6 6-6"/>
  </>, p),

  menu: (p?: IconProps) => svg(<>
    <path d="M4 7h16M4 12h16M4 17h16"/>
  </>, p),

  externalLink: (p?: IconProps) => svg(<>
    <path d="M14 4h6v6"/>
    <path d="M20 4 10 14"/>
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>
  </>, p),

  check: (p?: IconProps) => svg(<>
    <path d="m4 12 5 5L20 6"/>
  </>, p),

  alert: (p?: IconProps) => svg(<>
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v4M12 16h.01"/>
  </>, p),

  spinner: (p?: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" className={`${p?.className ?? ''} animate-spin`}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  ),
};
