import { useDropdown } from '../shared/useDropdown';
import { Icon } from './HeaderIcons';

interface Locale { code: string; name: string }

export function LocaleSelect({
  value, options, onChange,
}: {
  value: string;
  options: Locale[];
  /** May be async (lazy-loaded locales return a Promise). The return value is ignored. */
  onChange: (code: string) => void | Promise<void>;
}) {
  const { open, toggle, close, triggerRef, panelRef } = useDropdown<HTMLDivElement>();
  const current = options.find(l => l.code === value);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 bg-slate-700/60 hover:bg-slate-700 text-slate-200 text-xs rounded px-2.5 py-1.5 border border-slate-600 hover:border-slate-500 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon.languages className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{current?.name ?? value}</span>
        </span>
        <Icon.chevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-xl z-50 overflow-hidden"
          role="listbox"
        >
          {options.map(l => (
            <button
              key={l.code}
              role="option"
              aria-selected={l.code === value}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                l.code === value
                  ? 'bg-indigo-600/20 text-indigo-200'
                  : 'text-slate-200 hover:bg-slate-700/70'
              }`}
              onClick={() => { onChange(l.code); close(); }}
            >
              <span className="truncate">{l.name}</span>
              {l.code === value && <Icon.check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
