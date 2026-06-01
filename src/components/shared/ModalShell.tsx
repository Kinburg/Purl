import {useState, useEffect, type ReactNode} from 'react';

// ─── Shared modal primitives ─────────────────────────────────────────────────
//
// Central place for modal chrome so every settings dialog (Character, Item,
// Project, EditorPrefs, etc.) renders identically. All styling lives here.
//
// Usage:
//   <ModalShell onClose={…} width={520}>
//     <ModalHeader title="…" onClose={…} />
//     <ModalBody>
//       <ModalSection title="…"> …rows… </ModalSection>
//     </ModalBody>
//     <ModalFooter>
//       <button …/>
//     </ModalFooter>
//   </ModalShell>
//
// ─────────────────────────────────────────────────────────────────────────────

// Stack of open ModalShell close handlers, so Escape closes only the TOPMOST dialog
// (stacked dialog-over-dialog collapses one layer at a time).
const escStack: Array<() => void> = [];

interface ShellProps {
    onClose?: () => void,
    width?: number | string,
    /** z-index bump for nested modals (e.g. dialog-over-dialog). Default 50. */
    z?: number,
    /** If true, clicking the backdrop calls onClose. Default false. */
    dismissOnBackdrop?: boolean,
    children: ReactNode,
    height?: number
}

export function ModalShell({onClose, width = 520, z = 50, dismissOnBackdrop = false, children, height}: ShellProps) {
    // Close on Escape — only the topmost open ModalShell responds.
    useEffect(() => {
        if (!onClose) return;
        escStack.push(onClose);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && escStack[escStack.length - 1] === onClose) {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            const i = escStack.lastIndexOf(onClose);
            if (i >= 0) escStack.splice(i, 1);
        };
    }, [onClose]);

    return (
        <div className="fixed inset-0 flex items-center justify-center" style={{zIndex: z}}>
            <div
                className="absolute inset-0 bg-black/60"
                onClick={dismissOnBackdrop ? onClose : undefined}
            />
            <div
                className="relative bg-slate-800 border border-slate-600 rounded-lg shadow-2xl flex flex-col max-h-[90vh]"
                style={{width: typeof width === 'number' ? `${width}px` : width, height: typeof height === 'number' ? `${height}px` : height}}
            >
                {children}
            </div>
        </div>
    );
}

// ─── Header ──────────────────────────────────────────────────────────────────

export function ModalHeader({
                                title,
                                subtitle,
                                onClose,
                                right,
                            }: {
    title: ReactNode;
    subtitle?: ReactNode;
    onClose?: () => void;
    right?: ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-700 shrink-0">
            <div className="flex items-baseline gap-2 min-w-0">
                <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
                {subtitle && <span className="text-xs text-slate-400 font-normal truncate">{subtitle}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {right}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-white transition-colors cursor-pointer text-base leading-none"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Body / Footer ───────────────────────────────────────────────────────────

export function ModalBody({children, className = ''}: { children: ReactNode; className?: string }) {
    return (
        <div className={`overflow-y-auto flex-1 p-4 flex flex-col gap-4 ${className}`}>
            {children}
        </div>
    );
}

export function ModalFooter({children}: { children: ReactNode }) {
    return (
        <div className="px-4 py-3 border-t border-slate-700 shrink-0 flex gap-2">
            {children}
        </div>
    );
}

// ─── Primary / Secondary buttons ─────────────────────────────────────────────

export function PrimaryButton({
                                  children, disabled, onClick, full = true, className = '',
                              }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    full?: boolean;
    className?: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={[
                'py-1.5 text-xs rounded transition-colors cursor-pointer',
                'bg-indigo-600 hover:bg-indigo-500 text-white',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600',
                full ? 'flex-1' : 'px-4',
                className,
            ].join(' ')}
        >
            {children}
        </button>
    );
}

export function SecondaryButton({
                                    children, disabled, onClick, full = true, className = '',
                                }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    full?: boolean;
    className?: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={[
                'py-1.5 text-xs rounded transition-colors cursor-pointer',
                'bg-slate-700 hover:bg-slate-600 text-slate-200',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                full ? 'flex-1' : 'px-4',
                className,
            ].join(' ')}
        >
            {children}
        </button>
    );
}

// ─── Section (uppercase label + underline) ───────────────────────────────────

export function ModalSection({
                                 title, note, children,
                             }: {
    title?: ReactNode;
    note?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2">
            {title && (
                <div
                    className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700 pb-1">
                    {title}
                </div>
            )}
            {note && <p className="text-[10px] text-slate-500 -mt-1">{note}</p>}
            <div className="flex flex-col gap-2.5">{children}</div>
        </div>
    );
}

// ─── Field (stacked label + body) ───────────────────────────────────────────

export function ModalField({
                               label, required, note, error, children,
                           }: {
    label?: ReactNode;
    required?: boolean;
    note?: ReactNode;
    error?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1">
            {label && (
                <label
                    className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    {label}
                    {required && <span className="text-red-400">*</span>}
                </label>
            )}
            {children}
            {error
                ? <span className="text-[10px] text-red-400">{error}</span>
                : note && <span className="text-[10px] text-slate-500">{note}</span>}
        </div>
    );
}

// ─── Row (inline label + right-aligned control) ─────────────────────────────

export function ModalRow({
                             label, hint, children,
                         }: {
    label: ReactNode;
    hint?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs text-slate-300 truncate">{label}</span>
                {hint && <span className="text-[10px] text-slate-500 truncate">{hint}</span>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

// ─── Input styles ───────────────────────────────────────────────────────────

export const INPUT_CLS =
    'w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 ' +
    'placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors';

export const INPUT_ERR_CLS =
    'w-full px-2 py-1.5 bg-slate-700 border border-red-500 rounded text-xs text-slate-200 ' +
    'placeholder-slate-500 focus:outline-none focus:border-red-400 transition-colors';

export const INPUT_READONLY_CLS =
    'w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-500 ' +
    'font-mono cursor-not-allowed';

// ─── Toggle switch ──────────────────────────────────────────────────────────

export function Toggle({value, onChange, disabled}: { value: boolean; onChange: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={disabled ? undefined : onChange}
            disabled={disabled}
            className={[
                'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
                value ? 'bg-indigo-600' : 'bg-slate-600',
                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
        >
      <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              value ? 'translate-x-4' : 'translate-x-0'
          }`}
      />
        </button>
    );
}

// ─── Segmented pills (for small choice groups) ─────────────────────────────

export function Segmented<T extends string>({
                                                value, options, onChange, className = '',
                                            }: {
    value: T;
    options: Array<{ value: T; label: ReactNode }>;
    onChange: (v: T) => void;
    className?: string;
}) {
    return (
        <div className={`inline-flex gap-1 flex-wrap ${className}`}>
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={[
                        'text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer',
                        value === opt.value
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-400',
                    ].join(' ')}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

// ─── Password field with visibility toggle ─────────────────────────────────

export function PasswordInput({
                                  value, onChange, placeholder,
                              }: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={INPUT_CLS + ' pr-8'}
            />
            <button
                type="button"
                tabIndex={-1}
                onClick={() => setVisible(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                aria-label={visible ? 'Hide' : 'Show'}
            >
                {visible ? <EyeOffIcon/> : <EyeIcon/>}
            </button>
        </div>
    );
}

function EyeIcon() {
    return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path strokeLinecap="round" strokeLinejoin="round"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>
    );
}

function EyeOffIcon() {
    return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
        </svg>
    );
}

// ─── Tabs (horizontal, compact) ─────────────────────────────────────────────

export interface TabDef<T extends string = string> {
    id: T;
    label: ReactNode;
    icon?: ReactNode;
    count?: number;
    hidden?: boolean;
}

export function ModalTabs<T extends string>({
                                                tabs, active, onChange,
                                            }: {
    tabs: TabDef<T>[];
    active: T;
    onChange: (id: T) => void;
}) {
    const visible = tabs.filter(t => !t.hidden);
    return (
        <div className="flex items-stretch gap-0 px-2 border-b border-slate-700 shrink-0 overflow-x-auto">
            {visible.map(tab => {
                const isActive = tab.id === active;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={[
                            'relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border-b-2',
                            isActive
                                ? 'text-white border-indigo-500'
                                : 'text-slate-400 border-transparent hover:text-slate-200',
                        ].join(' ')}
                    >
                        {tab.icon && <span className="text-sm leading-none">{tab.icon}</span>}
                        <span>{tab.label}</span>
                        {typeof tab.count === 'number' && tab.count > 0 && (
                            <span className={`text-[10px] font-mono px-1 rounded ${
                                isActive ? 'bg-indigo-500/30 text-indigo-200' : 'bg-slate-700 text-slate-400'
                            }`}>
                {tab.count}
              </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Color-picker field ─────────────────────────────────────────────────────

export function ColorSwatchInput({
                                     value, onChange, placeholder, allowClear = false,
                                 }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    allowClear?: boolean;
}) {
    return (
        <div className="flex items-center gap-2">
            <input
                type="color"
                value={value || '#1e293b'}
                onChange={e => onChange(e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
            />
            <input
                className={INPUT_CLS + ' font-mono w-28'}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder ?? '—'}
            />
            {allowClear && value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    className="text-slate-500 hover:text-slate-300 cursor-pointer text-xs leading-none"
                    aria-label="Clear"
                >
                    ✕
                </button>
            )}
        </div>
    );
}
