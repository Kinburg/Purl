/* eslint-disable react-refresh/only-export-components -- co-located confirm hook (useConfirm) + its modal; splitting a tiny utility isn't worth the churn */
import { useState } from 'react';
import { useT } from '../../i18n';

interface ConfirmModalProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const t = useT();
  const defaultConfirm = variant === 'danger' ? t.common.delete : t.common.confirm;
  const btnClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-500'
    : 'bg-indigo-600 hover:bg-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-80 p-4 flex flex-col gap-4">
        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white rounded border border-slate-600 hover:border-slate-400 transition-colors cursor-pointer"
          >
            {cancelLabel ?? t.common.cancel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs text-white rounded transition-colors cursor-pointer ${btnClass}`}
          >
            {confirmLabel ?? defaultConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

interface AskOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

type PendingState = AskOptions & { onYes: () => void };

export function useConfirm() {
  const [pending, setPending] = useState<PendingState | null>(null);

  const ask = (options: AskOptions | string, onYes: () => void) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    setPending({ ...opts, onYes });
  };

  const modal = pending ? (
    <ConfirmModal
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      variant={pending.variant}
      onConfirm={() => { pending.onYes(); setPending(null); }}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return { ask, modal };
}
