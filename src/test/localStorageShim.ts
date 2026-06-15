// Minimal localStorage polyfill for node-env store tests. projectStore's persist
// adapter reads `localStorage` at module-evaluation time (only `window` is guarded),
// so this MUST be imported before the store module. Import it first in any test that
// pulls in a persisted Zustand store.
if (typeof (globalThis as { localStorage?: Storage }).localStorage === 'undefined') {
  const mem = new Map<string, string>();
  (globalThis as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() { return mem.size; },
  } as Storage;
}
