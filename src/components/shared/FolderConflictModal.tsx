import { useFolderConflictStore } from '../../store/folderConflictStore';
import { useT } from '../../i18n';
import { ModalShell, ModalHeader } from './ModalShell';

/**
 * Globally-mounted dialog shown when a new project's target sub-folder already
 * exists and is non-empty. Driven by `useFolderConflictStore` so the (non-React)
 * save helpers can `await` the user's decision. Rendered once, in App; it
 * self-hides while `folderName` is null.
 *
 * Uses ModalShell (z=60) so it stacks above the Project Settings modal (z=50)
 * and Escape closes *this* dialog first via ModalShell's shared escStack.
 */
export function FolderConflictModal() {
  const t          = useT();
  const folderName = useFolderConflictStore(s => s.folderName);
  const resolve    = useFolderConflictStore(s => s.resolve);

  if (folderName === null) return null;
  const fc = t.folderConflict;

  return (
    <ModalShell width={440} z={60} dismissOnBackdrop onClose={() => resolve('cancel')}>
      <ModalHeader title={fc.title} onClose={() => resolve('cancel')} />
      <div className="p-4 flex flex-col gap-4">
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
          {fc.message(folderName)}
        </p>
        <div className="flex gap-2 justify-end flex-wrap">
          <button
            onClick={() => resolve('cancel')}
            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white rounded border border-slate-600 hover:border-slate-400 transition-colors cursor-pointer"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={() => resolve('overwrite')}
            className="px-3 py-1.5 text-xs text-white rounded bg-amber-600 hover:bg-amber-500 transition-colors cursor-pointer"
          >
            {fc.overwrite}
          </button>
          <button
            onClick={() => resolve('suffix')}
            className="px-3 py-1.5 text-xs text-white rounded bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            {fc.createNew}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
