import { useEffect, useState } from 'react';

/**
 * Returns a value that lags `value` by `delay` ms. Useful for derived expensive
 * computations (preview rebuilds, syntax highlighting) that don't need to run
 * on every keystroke.
 *
 * Pattern:
 *   const debouncedProject = useDebouncedValue(project, 250);
 *   const html = useMemo(() => serialize(debouncedProject), [debouncedProject]);
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
