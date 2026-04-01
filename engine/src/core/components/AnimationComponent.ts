import { EntityId } from '../World';

/**
 * animation.md Protocol Component
 */
export interface AnimationComponent {
    config: {
        name?: string;
        duration: number; // ms
        loops: number;    // 0 = infinite
        pending?: number;
        timeline: any[];
    };
    elapsedTime: number; // Current playback time in ms
    isPaused: boolean;
    loopCount: number;

    // Overrides for non-transform properties (applied by AnimationSystem)
    colorOverride?: number;
    opacityOverride?: number;

    // Initial values captured when an animation starts or resets
    // Used for relative modes (set with array interpolation, multi, etc.)
    initialValues?: {
        position?: [number, number, number];
        rotation?: [number, number, number];
        scale?: [number, number, number];
        color?: number;
        opacity?: number;
    };
}
