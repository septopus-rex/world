import * as THREE from 'three';

/**
 * PlayerLighting — the two lights that belong to the PLAYER rather than to the
 * world: a soft fill above the avatar, and a hand TORCH along the view
 * direction.
 *
 * Why they exist at all: the tuned night baseline is sun 0.15 / ambient 0.02
 * (画面基线) — a real night, in which you cannot see your own avatar, never mind
 * the ground in front of it. The fix is NOT to raise the global night level:
 * ambient is the one dial that flattens everything it touches, and the baseline
 * was tuned specifically to get away from that ("纸片感"). A light that travels
 * with the player leaves the world's own night intact and only lifts the metre
 * or two the player actually occupies.
 *
 * Two rules hold this together:
 *   · BOTH lights fade to EXACTLY zero by day (nightFactor 0), so the daylight
 *     baseline is reproduced bit-for-bit and this whole file is inert at noon —
 *     the same discipline as EnvironmentSystem.OVERCAST's `clear → 0`.
 *   · Neither casts shadows. A torch that casts would double the shadow passes
 *     for the one light that moves every frame; the cost is not worth it, and
 *     an unshadowed torch reads fine because its cone is what sells it.
 *
 * These are SCENE-level lights (siblings of the sun/ambient), re-anchored every
 * frame from RenderEngine.render(). They are deliberately not children of the
 * main camera: that camera is not in the scene graph, so a light parented to it
 * would never be collected by the renderer. Anchoring instead of parenting also
 * keeps everything in render space, so the floating origin cancels for free.
 */
export class PlayerLighting {
    // ── Fill ──────────────────────────────────────────────────────────────────
    // Offset diagonally from the player, not straight overhead, and NOT on the
    // camera. Both alternatives were tried against a pixel probe:
    //   · straight overhead lit almost nothing. A body's front and back are
    //     vertical surfaces, so a light directly above them arrives at ~90° and
    //     N·L collapses; the avatar stayed as black as it was without any light
    //     (measured: luma 1.1 → 4.0, i.e. still unreadable).
    //   · on the camera lights the avatar well, but the whole pool of ground
    //     swings around as you turn — the light is attached to your gaze, so the
    //     world appears to rotate under a fixed lamp.
    // A fixed WORLD-space diagonal offset gives ~45° incidence on a standing
    // figure (N·L ≈ 0.7) and keeps the lit side of the world still while you look
    // around, which is what a lantern hanging off your pack would do.
    private static readonly FILL_OFFSET = { x: 2.2, y: 3.2, z: 2.2 }; // metres, from the feet
    private static readonly FILL_DISTANCE = 14;  // hard cutoff — never lights the horizon
    // Candela at full night. Measured against a luma probe on the avatar's body
    // (e2e/player-lighting.spec): 12 → barely 16/255, still unreadable; 60 → the
    // avatar reads like daylight against a black background, which looks cut out
    // rather than lit. 45 puts it around 28/255 — clearly visible, still night.
    private static readonly FILL_NIGHT = 45;
    private static readonly FILL_COLOR = 0xbcd0ff; // cool: moonlight, not a lamp

    // ── Torch ─────────────────────────────────────────────────────────────────
    // Cast from the CAMERA, not from the avatar's hand: the player aims a torch by
    // looking, and a hand-anchored cone in third person would light whatever the
    // avatar faces instead of what the player is looking at.
    private static readonly TORCH_ANGLE = 0.40;  // radians (~23°) half-angle
    private static readonly TORCH_DISTANCE = 32;
    private static readonly TORCH_INTENSITY = 42;
    private static readonly TORCH_COLOR = 0xfff2d0; // warm white, like an LED torch

    private readonly fill: THREE.PointLight;
    private readonly torch: THREE.SpotLight;
    private on = false;
    private night = 0;
    private readonly _dir = new THREE.Vector3();

    constructor(scene: THREE.Scene) {
        this.fill = new THREE.PointLight(PlayerLighting.FILL_COLOR, 0, PlayerLighting.FILL_DISTANCE, 2);
        this.fill.castShadow = false;
        scene.add(this.fill);

        this.torch = new THREE.SpotLight(PlayerLighting.TORCH_COLOR, 0, PlayerLighting.TORCH_DISTANCE,
            PlayerLighting.TORCH_ANGLE, 0.45, 2);
        this.torch.castShadow = false;
        scene.add(this.torch);
        // A SpotLight aims at its `target`, whose default position is the world
        // ORIGIN — leave it there and the beam points at 0,0,0 from wherever the
        // player stands. The target must also be in the scene graph for its
        // matrixWorld to update.
        scene.add(this.torch.target);
    }

    /** Is the torch switched on? (View state — nothing simulated depends on it.) */
    get torchOn(): boolean { return this.on; }

    setTorch(on: boolean): void {
        this.on = on;
        this.applyIntensities();
    }

    /**
     * How dark it is outside: 0 = full day (both lights OFF, exactly), 1 = night.
     * Fed by EnvironmentSystem from the same smoothstepped day factor that drives
     * the sun, so the fill comes up across the same dusk band the sun goes down.
     */
    setNightFactor(night: number): void {
        this.night = Math.min(1, Math.max(0, night));
        this.applyIntensities();
    }

    /**
     * Re-anchor to the player and camera. `feet` is the player's position in
     * RENDER space; the camera supplies the torch's origin and aim.
     */
    anchor(feet: THREE.Vector3, camera: THREE.Camera): void {
        const O = PlayerLighting.FILL_OFFSET;
        this.fill.position.set(feet.x + O.x, feet.y + O.y, feet.z + O.z);
        if (!this.on) return;                       // aiming an off torch is wasted work
        this.torch.position.copy(camera.position);
        camera.getWorldDirection(this._dir);
        this.torch.target.position.copy(camera.position).addScaledVector(this._dir, 10);
        this.torch.target.updateMatrixWorld();
    }

    /** The torch is usable in daylight too (indoors, caves) — it just isn't lit by
     *  the night factor. The FILL is night-only: by day the sun already models the
     *  avatar, and adding to it is how you get a figure that glows in sunlight. */
    private applyIntensities(): void {
        this.fill.intensity = PlayerLighting.FILL_NIGHT * this.night;
        this.torch.intensity = this.on ? PlayerLighting.TORCH_INTENSITY : 0;
    }

    dispose(): void {
        this.fill.removeFromParent();
        this.torch.removeFromParent();
        this.torch.target.removeFromParent();
        this.fill.dispose();
        this.torch.dispose();
    }
}
