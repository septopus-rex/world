import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';
import { reportError } from '../core/errors';

/**
 * SpatialAudio — the render layer's 3D audio subsystem, extracted from
 * RenderEngine (intra-layer refactor: still `render/`, still allowed to import
 * Three.js). Owns the listener, the decoded-buffer LRU cache, the one-shot vs.
 * looping-emitter play paths, and the autoplay-policy gesture gate. RenderEngine
 * keeps a thin `playSpatialSound` / `attachAudioEmitter` facade that forwards
 * here; the sound objects still ride the mesh's `userData.__media` so
 * RenderEngine's removeHandle disposal (disposeMediaResources) stops them on
 * eviction — the two sides couple only through userData, not each other's guts.
 */
export class SpatialAudio {
    private listener: THREE.AudioListener | null = null;
    private loader: THREE.AudioLoader | null = null;
    /** Decoded buffers, load-once by URL (shared across every play). LRU-ordered
     *  (Map insertion order) and capped: a currently-playing source keeps its own
     *  buffer reference, so evicting never cuts a sound short — the decoded PCM is
     *  just GC'd once nothing plays it. */
    private static readonly MAX_BUFFERS = 64;
    private buffers = new Map<string, Promise<AudioBuffer>>();
    /** Audio stays untouched until the first user gesture (autoplay policy). */
    private unlocked = false;
    private pendingOneShot: Array<{ url: string; position: [number, number, number] | null; volume: number }> = [];
    private pendingEmitters: Array<{ handle: RenderHandle; url: string; opts: EmitterOpts }> = [];

    /** @param camera    the listener rides this (main camera).
     *  @param worldRoot positional one-shots add here (absolute-local; the root's
     *                   rebase offset places them relative to the camera-borne listener). */
    constructor(private readonly camera: THREE.Object3D, private readonly worldRoot: THREE.Object3D) {
        // Browsers forbid an AudioContext before a user gesture (and warn on any
        // pre-gesture create/resume). So we DON'T touch audio until the first
        // gesture — then resume the context and flush autoplay requests queued
        // during boot (e2 ambient audio).
        if (typeof window !== 'undefined') {
            const unlock = () => {
                this.unlocked = true;
                try { (this.listener?.context as AudioContext)?.resume?.(); } catch { /* noop */ }
                const one = this.pendingOneShot; this.pendingOneShot = [];
                for (const a of one) this.play(a.url, a.position, a.volume);
                const emit = this.pendingEmitters; this.pendingEmitters = [];
                for (const e of emit) {
                    if (!((e.handle as THREE.Object3D)?.userData?.__removed)) this.attachEmitter(e.handle, e.url, e.opts);
                }
                for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, unlock);
            };
            for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
        }
    }

    private static headless(): boolean {
        return typeof (globalThis as any).AudioContext === 'undefined'
            && typeof (globalThis as any).webkitAudioContext === 'undefined';
    }

    /** Ensure the listener + loader exist and the context is (best-effort) resumed. */
    private ensure(): THREE.AudioListener {
        if (!this.listener) { this.listener = new THREE.AudioListener(); this.camera.add(this.listener); }
        try { (this.listener.context as AudioContext)?.resume?.(); } catch { /* pre-gesture: stays suspended */ }
        if (!this.loader) this.loader = new THREE.AudioLoader();
        return this.listener;
    }

    /** Decoded buffer for `url` (load-once, LRU-touched, capped). */
    private buffer(url: string): Promise<AudioBuffer> {
        let buf = this.buffers.get(url);
        if (buf) { this.buffers.delete(url); this.buffers.set(url, buf); return buf; } // LRU touch
        buf = this.loader!.loadAsync(url);
        this.buffers.set(url, buf);
        while (this.buffers.size > SpatialAudio.MAX_BUFFERS) {
            const victim = this.buffers.keys().next().value; // LRU head
            if (victim === undefined) break;
            this.buffers.delete(victim);
        }
        return buf;
    }

    /**
     * Play a one-shot sound. With a position → PositionalAudio in the scene
     * (distance attenuation); without → flat 2D. Pre-gesture requests are queued
     * (deduped, capped) and flushed on unlock.
     */
    play(url: string, position: [number, number, number] | null, volume = 1): void {
        if (!this.unlocked) {
            if (SpatialAudio.headless()) return;
            this.pendingOneShot = this.pendingOneShot.filter((a) => a.url !== url);
            this.pendingOneShot.push({ url, position, volume });
            if (this.pendingOneShot.length > 16) this.pendingOneShot.shift();
            return;
        }
        const listener = this.ensure();
        this.buffer(url).then((buf) => {
            if (position) {
                const sound = new THREE.PositionalAudio(listener);
                sound.setBuffer(buf);
                sound.setRefDistance(8);
                sound.setVolume(volume);
                sound.position.set(position[0], position[1], position[2]);
                this.worldRoot.add(sound); // absolute local; the root offset puts it in render space
                // Chain to three's own onEnded (it clears isPlaying) rather than
                // clearing the flag by hand — it is a readonly property in the types.
                const clearFlag = sound.onEnded.bind(sound);
                sound.onEnded = () => { clearFlag(); this.worldRoot.remove(sound); };
                sound.play();
            } else {
                const sound = new THREE.Audio(listener);
                sound.setBuffer(buf);
                sound.setVolume(volume);
                sound.play();
            }
        }).catch((e) => reportError(e, { tag: '[SpatialAudio]', severity: 'warn', code: 'RESOURCE_LOAD', id: url }));
    }

    /**
     * Attach a looping spatial sound to a mesh (audio emitter, e2). Unlike the
     * one-shot play, the PositionalAudio rides the mesh (moves with it, stops on
     * eviction via userData.__media). Pre-gesture emitters are queued (deduped by
     * handle) and attached on unlock. Headless → no-op.
     */
    attachEmitter(handle: RenderHandle, url: string, opts: EmitterOpts = {}): void {
        const mesh = handle as THREE.Object3D;
        if (SpatialAudio.headless()) return;
        if (!this.unlocked) {
            this.pendingEmitters = this.pendingEmitters.filter((e) => e.handle !== handle);
            this.pendingEmitters.push({ handle, url, opts });
            if (this.pendingEmitters.length > 32) this.pendingEmitters.shift();
            return;
        }
        const listener = this.ensure();
        const sound = new THREE.PositionalAudio(listener);
        (mesh.userData ??= {}).__media = { audio: sound };
        this.buffer(url).then((buf) => {
            if (mesh.userData?.__removed) return; // evicted mid-load
            sound.setBuffer(buf);
            sound.setLoop(opts.loop !== false);
            sound.setRefDistance(opts.refDistance ?? 8);
            sound.setVolume(opts.volume ?? 1);
            mesh.add(sound);
            if (opts.autoplay !== false) sound.play();
        }).catch((e) => reportError(e, { tag: '[SpatialAudio]', severity: 'warn', code: 'RESOURCE_LOAD', id: url }));
    }
}

export interface EmitterOpts { autoplay?: boolean; loop?: boolean; volume?: number; refDistance?: number }
