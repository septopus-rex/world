/**
 * Tumble (block-tower / Jenga) components.
 *
 * Tumble is the first native game whose play is driven by REAL rigid-body
 * physics (rapier) rather than a hand-rolled sim — the tower stands, leans and
 * topples emergently. The rapier bodies themselves live in TumbleSystem (WASM
 * handles, non-serialisable); these components are the ECS-side, serialisable
 * facts the rest of the engine + tests read.
 */

/** Tags a spawned a2 box as one tower piece. */
export interface TumbleBlockComponent {
    blockId: number;   // 0..N-1, build order (layer-major, then within-layer)
    layer: number;     // 0 = bottom
    slot: number;      // 0..perLayer-1 within the layer
}

/** The live tower session (one per game). */
export interface TumbleTowerComponent {
    block: [number, number];            // the playable block
    base: [number, number, number];     // engine-space anchor: tower centre at ground top
    layers: number;
    perLayer: number;
    initialTopY: number;                 // engine Y of the tower's top at spawn (topple datum)
    pulled: number;                      // pieces removed by the player
    toppled: boolean;                    // a piece left the stack envelope (tower fell)
    settled: boolean;                    // all pieces at rest (no piece moving)
}
