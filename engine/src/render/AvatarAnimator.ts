import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';

interface Rig {
    mixer: THREE.AnimationMixer;
    /** state name → action (idle/walk/run/air + every clip by raw name). */
    actions: Map<string, THREE.AnimationAction>;
    current: string | null;
}

/**
 * AvatarAnimator — the render layer's skeletal-animation state machine,
 * extracted from RenderEngine (intra-layer refactor: still `render/`, still
 * imports Three.js). One mixer per animated handle; state → clip mapping and
 * the crossfade/fallback logic follow protocol avatar-animation.md §2/§3.
 * RenderEngine keeps thin start/set/update/stop/debug facades that forward here.
 */
export class AvatarAnimator {
    private mixers = new Map<THREE.Object3D, Rig>();

    /** LEGACY heuristics for NON-COMPLIANT assets only — the normative clip
     *  naming contract (avatar-animation.md §3) is case-insensitive NAME
     *  EQUALITY to the state name. Assets predating the contract degrade to this
     *  substring match so they keep animating. */
    private static readonly STATE_PATTERNS: Record<string, RegExp> = {
        idle: /idle|stand|breath/i,
        walk: /walk/i,
        run: /run|sprint|jog/i,
        air: /jump|fall|air/i,
    };

    /**
     * Register a handle's clips with a mixer and start its default state.
     * Mapping (avatar-animation.md §3): (1) NORMATIVE clip-name == state-name,
     * case-insensitive; (2) LEGACY substring heuristics fill still-unmapped
     * states. Clips are also indexed by raw name; unmapped states fall back at
     * play time through the §2 chain, so a one-clip model still animates.
     */
    start(handle: RenderHandle, clips: THREE.AnimationClip[]): void {
        if (!clips.length) return;
        const obj = handle as THREE.Object3D;
        const mixer = new THREE.AnimationMixer(obj);
        const actions = new Map<string, THREE.AnimationAction>();

        for (const clip of clips) {
            const action = mixer.clipAction(clip);
            actions.set(clip.name, action);
            const lower = clip.name.toLowerCase();          // normative: name equality wins
            if (!actions.has(lower)) actions.set(lower, action);
        }
        for (const clip of clips) {                         // legacy degrade for unmapped states
            for (const [state, pattern] of Object.entries(AvatarAnimator.STATE_PATTERNS)) {
                if (!actions.has(state) && pattern.test(clip.name)) actions.set(state, mixer.clipAction(clip));
            }
        }
        if (!actions.has('idle')) actions.set('idle', mixer.clipAction(clips[0]));

        const rig: Rig = { mixer, actions, current: null };
        this.mixers.set(obj, rig);
        this.playState(rig, 'idle', 0);
    }

    /** Crossfade to a movement state (idle/walk/run/air or a raw clip name).
     *  No-op if it's already playing or the handle has no rig. */
    setState(handle: RenderHandle, state: string, fadeSec = 0.25): void {
        const rig = this.mixers.get(handle as THREE.Object3D);
        if (!rig || rig.current === state) return;
        this.playState(rig, state, fadeSec);
    }

    private playState(rig: Rig, state: string, fadeSec: number): void {
        // NORMATIVE fallback chains (avatar-animation.md §2): any state must
        // eventually resolve to `idle`.
        const FALLBACK: Record<string, string[]> = {
            run: ['run', 'walk', 'idle'],
            walk: ['walk', 'idle'],
            air: ['air', 'jump', 'idle'],
            jump: ['jump', 'air', 'idle'],
            land: ['land', 'idle'],
            idle: ['idle'],
        };
        let next: THREE.AnimationAction | undefined;
        for (const name of FALLBACK[state] ?? [state, 'idle']) {
            next = rig.actions.get(name);
            if (next) break;
        }
        if (!next) return;

        const prev = rig.current ? rig.actions.get(rig.current) : undefined;
        // The fallback chain can resolve two states to the SAME action (one-clip
        // model: walk→idle→clips[0]); record the state but don't restart it.
        rig.current = state;
        if (prev === next && next.isRunning()) return;

        if (prev && prev.isRunning() && fadeSec > 0) prev.fadeOut(fadeSec);
        else prev?.stop();
        next.reset();
        if (fadeSec > 0 && prev) next.fadeIn(fadeSec);
        next.play();
    }

    /** Advance the mixer for this handle by dt seconds. */
    update(handle: RenderHandle, dt: number): void {
        this.mixers.get(handle as THREE.Object3D)?.mixer.update(dt);
    }

    /** Stop and forget the mixer for this handle (avatar swap / disposal). */
    stop(handle: RenderHandle): void {
        const rig = this.mixers.get(handle as THREE.Object3D);
        if (rig) { rig.mixer.stopAllAction(); this.mixers.delete(handle as THREE.Object3D); }
    }

    /** Debug snapshot: registered clip names, current state, the clip the state
     *  actually resolved to (fallback chains make these differ), and world-space
     *  body height (avatar height checks). */
    debug(handle: RenderHandle): {
        clips: string[]; state: string | null; activeClip: string | null;
        activeTime: number; activeRunning: boolean; height: number; minY: number;
    } | null {
        const obj = handle as THREE.Object3D;
        const rig = this.mixers.get(obj);
        const box = new THREE.Box3().setFromObject(obj);
        let activeClip: string | null = null;
        let activeTime = 0, activeRunning = false;
        if (rig?.current) {
            const action = rig.actions.get(rig.current);
            activeClip = action?.getClip()?.name ?? null;
            activeTime = action?.time ?? 0;
            activeRunning = action?.isRunning() ?? false;
        }
        const clipNames = new Set<string>();
        rig?.actions.forEach((a) => clipNames.add(a.getClip().name));
        return {
            clips: [...clipNames],
            state: rig?.current ?? null,
            activeClip, activeTime, activeRunning,
            height: Number.isFinite(box.max.y - box.min.y) ? box.max.y - box.min.y : 0,
            minY: Number.isFinite(box.min.y) ? box.min.y : 0,
        };
    }
}
