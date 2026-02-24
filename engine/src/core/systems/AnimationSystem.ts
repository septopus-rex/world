import { World, EntityId, ISystem } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { AnimationComponent } from '../components/AnimationComponent';
import { Color } from '../utils/Math';
import { SystemMode } from '../types/SystemMode';
import { AdjunctComponent } from '../components/AdjunctComponents';

/**
 * AnimationSystem
 * 
 * Centralized processor for the SPP Animation Protocol.
 * Supports add, set, multi, random modes and various property types.
 */
export class AnimationSystem implements ISystem {
    public update(world: World, deltaTime: number): void {
        const entities = world.getEntitiesWith(["AnimationComponent", "TransformComponent"]);
        const isEdit = world.mode === SystemMode.Edit;
        const activeBlockId = world.activeEditBlockId;

        for (const entityId of entities) {
            const anim = world.getComponent<AnimationComponent>(entityId, "AnimationComponent");
            const transform = world.getComponent<TransformComponent>(entityId, "TransformComponent");

            if (!anim || !transform) continue;

            // Optimization: Only check AdjunctComponent in Edit Mode for the active block
            if (isEdit && activeBlockId !== null) {
                const adj = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
                if (adj && adj.parentBlockEntityId === activeBlockId) {
                    this.resetToInitial(anim, transform);
                    continue;
                }
            }

            if (anim.isPaused) continue;

            this.processAnimation(world, entityId, anim, transform, deltaTime);
        }
    }

    private resetToInitial(anim: AnimationComponent, transform: TransformComponent) {
        if (!anim.initialValues) return;
        const iv = anim.initialValues;
        if (iv.position) transform.position = [iv.position[0], iv.position[1], iv.position[2]];
        if (iv.rotation) transform.rotation = [iv.rotation[0], iv.rotation[1], iv.rotation[2]];
        if (iv.scale) transform.scale = [iv.scale[0], iv.scale[1], iv.scale[2]];
    }

    private processAnimation(world: World, entityId: EntityId, anim: AnimationComponent, transform: TransformComponent, deltaTime: number) {
        const config = anim.config;
        if (!config.timeline) return;

        // Capture initial values for absolute/multi modes
        if (!anim.initialValues) {
            anim.initialValues = {
                position: [...transform.position],
                rotation: [...transform.rotation],
                scale: [...transform.scale],
                opacity: 1.0,
                color: 0xffffff
            };
        }

        // 1. Advance Time
        anim.elapsedTime += (deltaTime * 1000); // ms

        const duration = config.duration || 1000;
        if (duration > 0) {
            if (anim.elapsedTime > duration) {
                if (config.loops === 0 || anim.loopCount < (config.loops || Infinity)) {
                    anim.elapsedTime %= duration;
                    anim.loopCount++;
                } else {
                    anim.elapsedTime = duration;
                    anim.isPaused = true;
                    // Finish last frame
                }
            }
        }

        // 2. Process Timeline Steps
        for (const step of config.timeline) {
            const timeRange = Array.isArray(step.time) ? step.time : [step.time, step.time];
            const [start, end] = timeRange;

            // Handle repeat (division of time window)
            let currentT = anim.elapsedTime;
            const stepDuration = end - start;

            if (step.repeat > 1 && stepDuration > 0) {
                const subDuration = stepDuration / step.repeat;
                currentT = start + ((anim.elapsedTime - start) % subDuration);
            }

            // Check if active in current time window
            if (anim.elapsedTime >= start && anim.elapsedTime <= end) {
                const progress = stepDuration > 0 ? (anim.elapsedTime - start) / stepDuration : 1;
                this.applyStep(anim, transform, step, progress, deltaTime, stepDuration);
            }
        }
    }

    private applyStep(anim: AnimationComponent, transform: TransformComponent, step: any, progress: number, deltaTime: number, stepDuration: number) {
        const mode = step.mode || 'add';
        const type = step.type || 'rotate';
        const axes = (step.axis || 'XYZ').split('');

        // Helper to get base value for absolute/multi modes
        const getBase = (t: string, axis?: string) => {
            if (t === 'move') return anim.initialValues?.position?.[this.getAxisIndex(axis)] ?? 0;
            if (t === 'rotate') return anim.initialValues?.rotation?.[this.getAxisIndex(axis)] ?? 0;
            if (t === 'scale') return anim.initialValues?.scale?.[this.getAxisIndex(axis)] ?? 1;
            if (t === 'opacity') return anim.initialValues?.opacity ?? 1;
            return 0;
        };

        const interpolate = (values: any[], p: number, isColor: boolean = false) => {
            if (values.length === 1) return values[0];
            const segmentCount = values.length - 1;
            const segmentIndex = Math.min(Math.floor(p * segmentCount), segmentCount - 1);
            const segmentProgress = (p * segmentCount) % 1;

            if (isColor) {
                const c1 = new Color(values[segmentIndex]);
                const c2 = new Color(values[segmentIndex + 1]);
                return c1.lerp(c2, segmentProgress).getHex();
            } else {
                return values[segmentIndex] + (values[segmentIndex + 1] - values[segmentIndex]) * segmentProgress;
            }
        };

        const calculateValue = (currentBase: number, targetValue: any, p: number, isColor: boolean = false) => {
            if (mode === 'add') {
                return (targetValue * (deltaTime * 1000)) / Math.max(stepDuration, 1);
            }
            if (mode === 'set') {
                if (Array.isArray(targetValue)) {
                    return interpolate(targetValue, p, isColor);
                }
                return targetValue;
            }
            if (mode === 'multi') {
                return currentBase * targetValue;
            }
            return 0;
        };

        // Apply to Target
        if (type === 'move' || type === 'rotate' || type === 'scale') {
            const targetArr = type === 'move' ? transform.position : (type === 'rotate' ? transform.rotation : transform.scale);

            for (const axis of axes) {
                const idx = this.getAxisIndex(axis);
                if (idx === -1) continue;

                const base = getBase(type, axis);
                const newValue = calculateValue(base, step.value, progress, false);

                if (mode === 'add') {
                    targetArr[idx] += newValue;
                } else {
                    targetArr[idx] = newValue;
                }
            }
        } else if (type === 'opacity') {
            const base = getBase('opacity');
            const val = calculateValue(base, step.value, progress, false);
            anim.opacityOverride = (mode === 'add') ? (anim.opacityOverride ?? base) + val : val;
        } else if (type === 'color') {
            const base = getBase('color');
            anim.colorOverride = calculateValue(base, step.value, progress, true);
        }
    }

    private getAxisIndex(axis?: string): number {
        if (axis === 'X') return 0;
        if (axis === 'Y') return 2; // SPP North -> Engine -Z
        if (axis === 'Z') return 1; // SPP Alt -> Engine Y
        return -1;
    }
}
