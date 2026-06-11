// Vitest global setup (node environment).
//
// Minimal Map-based `localStorage` shim (IdbDraftBackend's legacy-draft
// migration probes it; player-state persistence writes it). The P1 DraftStore
// itself runs against `fake-indexeddb` where the draft-store suite opts in.
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
