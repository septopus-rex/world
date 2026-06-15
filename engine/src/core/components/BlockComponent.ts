import { RenderHandle } from '../types/Adjunct';

export interface BlockComponent {
    x: number;
    y: number;
    elevation: number; // Absolute vertical offset relative to physics Y=0
    /**
     * Game-zone flag (raw[4]). A block declares itself PLAYABLE here — the single,
     * block-level, on-chain-queryable signal that lets a conformant interpreter
     * gate Game-mode entry without scanning adjuncts. 0 = not a game block,
     * >=1 = playable (the new-engine equivalent of the old engine's
     * BLOCK_INDEX_GAME_SETTING). See GameZoneSystem + World.setMode guard.
     */
    game?: number;
    world: string | number;
    adjuncts: any[]; // Intermediate format (std)
    animations?: any[]; // Block-scoped animation library
    isInitialized: boolean;
    isDraft?: boolean;  // True if loaded from localStorage draft instead of chain data
    /** Adjunct meshes still to build; at 0 the block emits ONE block.loaded. */
    pendingAdjuncts?: number;
    /** Total adjunct count at init (block.loaded payload). */
    adjunctTotal?: number;
}
