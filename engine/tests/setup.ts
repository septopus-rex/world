// Vitest global setup (node environment).
//
// Minimal Map-based `localStorage` shim so DraftStorage — which BlockSystem reads
// on the block-load hot path — works headlessly instead of throwing. P1's
// IndexedDB DraftStore will use `fake-indexeddb` the same way.
//
// Guards on a missing OR partial localStorage (Node's experimental localStorage
// may be present but incomplete under vitest).
if (typeof (globalThis as any).localStorage === 'undefined'
    || typeof (globalThis as any).localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}
