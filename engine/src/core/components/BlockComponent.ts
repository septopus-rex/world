import * as THREE from 'three';
import { EntityId } from '../World';

export interface BlockComponent {
    x: number;
    y: number;
    elevation: number; // Absolute vertical offset relative to physics Y=0
    world: string | number;
    adjuncts: any[]; // Intermediate format (std)
    isInitialized: boolean;
    group?: THREE.Group; // Visual container for this block and its children
}
