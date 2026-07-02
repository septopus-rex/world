/**
 * Num — finite-number gates for the content boundary (hardening ②).
 *
 * Content production means hand-edited JSON and imported data: a string or NaN
 * in a position/size slot must not poison transforms/physics silently (the
 * classic symptom: the world "disappears" with no error). These helpers clamp
 * non-finite values to a fallback; the CALLER decides whether to report.
 *
 * Pure core: no Three.js, no World import.
 */

/** Coerce to a finite number, else the fallback. Numeric strings coerce ("2" → 2);
 *  NaN/Infinity/garbage fall back. */
export function finite(v: any, fallback: number): number {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Sanitize the transform-carrying fields of an adjunct STD object IN PLACE:
 * position (ox,oy,oz → 0), rotation (rx,ry,rz → 0), size (x,y,z → 1).
 * Returns true when anything had to be clamped — the caller reports it.
 *
 * Applied at the single chokepoint every adjunct passes through
 * (BlockSystem.attachAdjunctComponents), and the sanitized object IS the
 * stdData handed to rendering/serialization — one gate covers the pipeline.
 */
export function sanitizeStdTransform(std: any): boolean {
    if (!std || typeof std !== 'object') return false;
    let dirty = false;
    const fix = (key: string, fallback: number) => {
        const v = std[key];
        if (v == null) return;              // absent is fine — downstream defaults apply
        const n = finite(v, Number.NaN);
        if (Number.isNaN(n)) { std[key] = fallback; dirty = true; }
        else if (n !== v) { std[key] = n; dirty = true; } // numeric string → number
    };
    for (const k of ['ox', 'oy', 'oz', 'rx', 'ry', 'rz'] as const) fix(k, 0);
    for (const k of ['x', 'y', 'z'] as const) fix(k, 1);
    return dirty;
}
