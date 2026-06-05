import { create } from 'zustand';

/**
 * How the user resolves a "project sub-folder already exists" collision when
 * creating / first-saving a project. See `src/lib/projectDir.ts`.
 */
export type FolderConflictChoice = 'overwrite' | 'suffix' | 'cancel';

/**
 * Ephemeral store driving a single, globally-mounted `<FolderConflictModal>`.
 * `ask()` returns a promise that resolves when the user clicks a button — this
 * lets the (non-React) save helpers `await` the user's decision.
 */
interface FolderConflictState {
  /** Name of the conflicting folder; non-null while the modal is shown. */
  folderName: string | null;
  /** Resolver for the in-flight `ask()` promise. */
  _resolve: ((choice: FolderConflictChoice) => void) | null;
  /** Show the modal for `folderName` and await the user's choice. */
  ask: (folderName: string) => Promise<FolderConflictChoice>;
  /** Called by the modal buttons to resolve the pending promise + hide. */
  resolve: (choice: FolderConflictChoice) => void;
}

export const useFolderConflictStore = create<FolderConflictState>()((set, get) => ({
  folderName: null,
  _resolve: null,
  ask: (folderName) =>
    new Promise<FolderConflictChoice>((resolve) => {
      set({ folderName, _resolve: resolve });
    }),
  resolve: (choice) => {
    get()._resolve?.(choice);
    set({ folderName: null, _resolve: null });
  },
}));
