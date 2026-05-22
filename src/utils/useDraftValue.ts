import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Local-state draft of a value that lives in an external store (Zustand).
 *
 * While the input is focused, only the local draft updates on every keystroke
 * — the store commit is debounced (default 300 ms). On blur or component
 * unmount the latest draft is flushed immediately, so no data is lost when
 * the user switches blocks.
 *
 * If the `source` value changes externally while the input is NOT focused
 * (undo / LLM streaming / scene switch), the draft re-syncs to the new source.
 *
 * Usage:
 *   const draft = useDraftValue(block.content, v => update({ content: v }));
 *   <textarea
 *     value={draft.value}
 *     onChange={e => draft.set(e.target.value)}
 *     onFocus={draft.onFocus}
 *     onBlur={draft.onBlur}
 *   />
 */
export function useDraftValue<T>(
  source: T,
  onCommit: (v: T) => void,
  delay = 300,
) {
  const [draft, setDraft]   = useState<T>(source);
  const isFocusedRef        = useRef(false);
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedRef    = useRef<T>(source);
  const draftRef            = useRef<T>(source);
  const onCommitRef         = useRef(onCommit);

  // Keep refs in sync with latest values (for use inside effects with stale closures)
  useEffect(() => { draftRef.current    = draft;    }, [draft]);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);

  // External source changed while not focused → re-sync draft
  useEffect(() => {
    if (!isFocusedRef.current && source !== lastCommittedRef.current) {
      lastCommittedRef.current = source;
      setDraft(source);
    }
  }, [source]);

  const set = useCallback((v: T) => {
    setDraft(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (v !== lastCommittedRef.current) {
        lastCommittedRef.current = v;
        onCommitRef.current(v);
      }
    }, delay);
  }, [delay]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (draftRef.current !== lastCommittedRef.current) {
      lastCommittedRef.current = draftRef.current;
      onCommitRef.current(draftRef.current);
    }
  }, []);

  const onFocus = useCallback(() => { isFocusedRef.current = true;  }, []);
  const onBlur  = useCallback(() => { isFocusedRef.current = false; flush(); }, [flush]);

  // Flush on unmount — covers scene switches, block deletes, etc.
  useEffect(() => () => { flush(); }, [flush]);

  return { value: draft, set, onFocus, onBlur, flush };
}
