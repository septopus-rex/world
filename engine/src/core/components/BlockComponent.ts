import { RenderHandle } from '../types/Adjunct';

export interface BlockComponent {
    x: number;
    y: number;
    elevation: number; // Absolute vertical offset relative to physics Y=0
    world: string | number;
    adjuncts: any[]; // Intermediate format (std)
    animations?: any[]; // Block-scoped animation library
    isInitialized: boolean;
    group?: RenderHandle; // Visual container for this block and its children
}
