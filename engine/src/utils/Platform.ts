/**
 * Simple Platform detection utility
 */
export const Platform = {
    isMac: typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform),
    isBrowser: typeof window !== 'undefined',
};
