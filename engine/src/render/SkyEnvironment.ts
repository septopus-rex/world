import * as THREE from 'three';

/**
 * SkyEnvironment — the gradient sky, and the image-based light derived FROM it.
 *
 * WHAT WAS WRONG. The sky was a single flat `THREE.Color` (#87ceeb) that never
 * changed: the sun arced overhead, the lights dimmed to night values, and the
 * sky stayed noon baby-blue. Worse, `MeshStandardMaterial` is a PBR shader that
 * expects an ENVIRONMENT to reflect — with only ambient + hemisphere +
 * directional and no `scene.environment`, its specular term has nothing to
 * sample, so every surface renders as pure diffuse. That is the technical
 * reason untextured geometry reads as polystyrene rather than as material.
 *
 * WHAT THIS DOES. One 2:1 equirectangular canvas holds a three-band vertical
 * gradient (zenith → horizon → ground). It is used TWICE:
 *   · `scene.background`  — the visible sky, so dawn/dusk/night are actually
 *     different skies rather than the same blue at different light levels;
 *   · `scene.environment` — the same gradient run through `PMREMGenerator`,
 *     giving every PBR material a cheap, physically-plausible IBL. Sky-blue
 *     bounce on up-facing surfaces and warm horizon light at grazing angles
 *     come free, which is most of the "looks lit" impression.
 *
 * Fog rides along: the fog colour is kept AT the horizon band, so the streaming
 * window's far edge keeps dissolving into whatever the sky currently is (fog
 * near/far still belong to EnvironmentSystem, which sizes them to the load
 * window). Without this the fog would stay noon-blue after dark and cut a pale
 * band across a night scene.
 *
 * COST. PMREM regeneration is the only non-trivial work, so it is gated on a
 * phase delta (§PHASE_EPSILON) — a day cycle triggers ~30 regenerations of a
 * 256² cubemap into a REUSED render target, which is negligible next to the
 * per-frame scene draw. Everything else is a texture upload of a 64×128 canvas.
 */

/** Sky colours at one point in the day. */
interface SkyStop {
    zenith: number;
    horizon: number;
    ground: number;
}

/** Keyframes blended by the caller's day factor (0 = night … 1 = full day). */
const NIGHT: SkyStop = { zenith: 0x05070f, horizon: 0x131e38, ground: 0x090b13 };
const TWILIGHT: SkyStop = { zenith: 0x2f4370, horizon: 0xe0813c, ground: 0x2b2119 };
const DAY: SkyStop = { zenith: 0x3f74b8, horizon: 0xa9c9e6, ground: 0x7f8577 };

/** Minimum phase movement before the IBL is re-baked (see COST above). Applies
 *  to the day factor AND the overcast factor — gating on the day factor alone
 *  would freeze the sky grey/blue whenever weather changed at a constant hour,
 *  which is most of the time. */
const PHASE_EPSILON = 0.03;

/**
 * Overcast: desaturate the whole gradient toward its own luma and darken it.
 *
 * Deliberately DERIVED from the current sky rather than lerped toward a fixed
 * grey — a fixed grey would light up the night. Pulling each band to its own
 * luminance keeps the day/night structure (and therefore the IBL's) intact and
 * only removes the blue, which is what a stormy sky actually does.
 */
const OVERCAST_DESAT = 0.85;   // how far toward luma at oc = 1
const OVERCAST_DARKEN = 0.35;  // how much dimmer at oc = 1

function overcastStop(stop: SkyStop, oc: number): SkyStop {
    if (oc <= 0) return stop;
    const f = (hex: number): number => {
        const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const k = OVERCAST_DESAT * oc, dim = 1 - OVERCAST_DARKEN * oc;
        const mix = (c: number) => Math.max(0, Math.min(255, Math.round((c + (luma - c) * k) * dim)));
        return (mix(r) << 16) | (mix(g) << 8) | mix(b);
    };
    return { zenith: f(stop.zenith), horizon: f(stop.horizon), ground: f(stop.ground) };
}

/** Canvas size for the equirect gradient. Only V varies, so U can stay tiny. */
const TEX_W = 64;
const TEX_H = 128;

function lerpHex(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
}

function lerpStop(a: SkyStop, b: SkyStop, t: number): SkyStop {
    return {
        zenith: lerpHex(a.zenith, b.zenith, t),
        horizon: lerpHex(a.horizon, b.horizon, t),
        ground: lerpHex(a.ground, b.ground, t),
    };
}

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

export class SkyEnvironment {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D | null;
    private readonly texture: THREE.CanvasTexture;
    private pmrem: THREE.PMREMGenerator | null;
    private envTarget: THREE.WebGLRenderTarget | null = null;
    private lastPhase = Number.NaN;
    private lastOvercast = Number.NaN;

    /** Clear-day IBL contribution — the tuned 画面基线 value; see the constructor. */
    static readonly IBL_CLEAR = 0.32;
    /** Extra IBL at full overcast: the sky takes over as the light source. */
    static readonly IBL_OVERCAST_GAIN = 0.8;
    /** Current horizon colour — what fog and any sky-matched UI should use. */
    private horizon = DAY.horizon;

    constructor(
        private readonly scene: THREE.Scene,
        renderer: THREE.WebGLRenderer,
        /** World `clearColor`: tints the whole gradient so a themed world (moon,
         *  alien sky) still reads as its own colour instead of Earth blue. */
        private readonly tint: number | null = null,
        /** Full render tier. `false` = the cheap tier (`?fx=low`): no PMREM IBL and
         *  no gradient-texture background — the sky becomes a flat Color set to the
         *  current horizon, so it still tracks the day cycle but costs a clear
         *  instead of a full-screen textured pass. Both matter on software GL,
         *  where the e2e suite runs (see WorldContent.withRenderTier). */
        private readonly full = true,
    ) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = TEX_W;
        this.canvas.height = TEX_H;
        this.ctx = this.canvas.getContext('2d');

        this.texture = new THREE.CanvasTexture(this.canvas);
        // Equirect so it maps as a dome; the gradient runs along V (canvas top =
        // V=1 = zenith, because CanvasTexture keeps Three's default flipY).
        this.texture.mapping = THREE.EquirectangularReflectionMapping;
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.generateMipmaps = false;
        if (this.full) this.scene.background = this.texture;
        // Scale the IBL contribution. At 1.0 the gradient's own brightness reads as
        // a fully-lit overcast dome and stacks on top of the sun into a white-out
        // (measured on the gallery: #eee ground clipped everywhere). At 0.5 it still
        // out-filled the sun, leaving lit and shaded faces nearly equal — the flat
        // look again, just bluer. 0.32 leaves the sun as the dominant light and the
        // sky as the shadow fill, which is the ratio a clear day actually has.
        // (setPhase re-derives this every phase change, scaling it by overcast.)
        this.scene.environmentIntensity = SkyEnvironment.IBL_CLEAR;

        try {
            if (!this.full) throw new Error('cheap tier: no IBL');
            this.pmrem = new THREE.PMREMGenerator(renderer);
            this.pmrem.compileEquirectangularShader();
        } catch {
            // No IBL — either switched off (cheap tier) or the context can't compile
            // the PMREM pass. The visible gradient sky still works; materials just
            // fall back to the lights.
            this.pmrem = null;
        }

        this.setPhase(1);
    }

    /** Horizon colour of the current sky (fog / distance haze should match it). */
    get horizonColor(): number { return this.horizon; }

    /** Bumped every time the sky texture is actually re-published to the GPU.
     *  Observable proof that a phase/weather change reached the visible sky and
     *  not just the lights — see the dispose() note in setPhase. */
    get epoch(): number { return this.skyEpoch; }
    private skyEpoch = 0;

    /**
     * Re-tint the sky for a point in the day cycle, under the current weather.
     * @param dayFactor 0 = night, 0.5 = sun on the horizon, 1 = full day. This is
     *   EnvironmentSystem's already-smoothstepped twilight factor, so the sky
     *   crossfades on exactly the same curve as the sun and ambient intensities.
     * @param overcast 0 = clear … 1 = heavy storm. Greys and darkens the gradient,
     *   AND raises `environmentIntensity`: as the direct beam dies the sky becomes
     *   the light source, so the IBL has to take over or an overcast scene just
     *   goes uniformly dark instead of going flat-and-shadowless. `0` reproduces
     *   the tuned clear-day look exactly (see EnvironmentSystem.OVERCAST).
     */
    setPhase(dayFactor: number, overcast = 0): void {
        const f = Math.min(1, Math.max(0, dayFactor));
        const oc = Math.min(1, Math.max(0, overcast));
        if (Number.isFinite(this.lastPhase) && Math.abs(f - this.lastPhase) < PHASE_EPSILON
            && Number.isFinite(this.lastOvercast) && Math.abs(oc - this.lastOvercast) < PHASE_EPSILON) return;
        this.lastPhase = f;
        this.lastOvercast = oc;
        // IBL gain. The clear-day 0.32 is a tuned number (画面基线) — the multiplier
        // is 1 at oc=0 so that value is reproduced exactly, never approached.
        this.scene.environmentIntensity = SkyEnvironment.IBL_CLEAR * (1 + SkyEnvironment.IBL_OVERCAST_GAIN * oc);

        let stop = f < 0.5 ? lerpStop(NIGHT, TWILIGHT, f * 2) : lerpStop(TWILIGHT, DAY, (f - 0.5) * 2);
        stop = overcastStop(stop, oc);
        if (this.tint != null) {
            // A themed sky pulls the whole gradient a third of the way to the
            // world's clear colour — enough to read as "not Earth" while keeping
            // the day/night structure that drives the IBL.
            stop = {
                zenith: lerpHex(stop.zenith, this.tint, 0.35),
                horizon: lerpHex(stop.horizon, this.tint, 0.35),
                ground: lerpHex(stop.ground, this.tint, 0.2),
            };
        }
        this.horizon = stop.horizon;
        if (this.full) {
            this.paint(stop);
            // `dispose()` on a texture we keep using looks wrong — it is load-bearing.
            //
            // An EQUIRECT texture used as `scene.background` is not sampled directly:
            // three converts it to a cube render target ONCE and caches that in
            // WebGLEnvironments' WeakMap, keyed by the texture. That cache has NO
            // version check — it is invalidated only by the texture's `dispose`
            // EVENT (see three/src/renderers/webgl/WebGLEnvironments.js,
            // onCubemapDispose). So repainting the canvas and setting needsUpdate
            // updates the 2D upload and nothing else: the visible sky keeps
            // rendering the very first conversion, forever.
            //
            // That is not hypothetical — it is what shipped from 2026-07-25 until
            // this was found (2026-07-28): the lights, the fog colour and the IBL
            // all tracked the day cycle while the SKY was a still image, which only
            // became obvious once weather was supposed to grey it out. Verified by
            // pixel readback: calling dispose() here is the difference between a
            // frozen blue sky and a grey one.
            //
            // Cost is one 128² cube re-render per phase change (~30 per day cycle,
            // gated by PHASE_EPSILON) and the old target is freed by the same
            // dispose event, so nothing leaks.
            this.texture.dispose();
            this.texture.needsUpdate = true;
            this.skyEpoch++;
            this.bakeIbl();
        } else if (this.scene.background instanceof THREE.Color) {
            this.scene.background.setHex(stop.horizon);   // flat sky, still day/night-aware
        } else {
            this.scene.background = new THREE.Color(stop.horizon);
        }

        // Keep the distance haze at the horizon (near/far stay EnvironmentSystem's).
        if (this.scene.fog) (this.scene.fog as THREE.Fog | THREE.FogExp2).color.setHex(stop.horizon);
    }

    /** Zenith → horizon over the top half, horizon → ground over the bottom. */
    private paint(stop: SkyStop): void {
        const ctx = this.ctx;
        if (!ctx) return;
        const grad = ctx.createLinearGradient(0, 0, 0, TEX_H);
        grad.addColorStop(0, css(stop.zenith));
        grad.addColorStop(0.42, css(lerpHex(stop.zenith, stop.horizon, 0.55)));
        grad.addColorStop(0.5, css(stop.horizon));
        grad.addColorStop(0.56, css(lerpHex(stop.horizon, stop.ground, 0.7)));
        grad.addColorStop(1, css(stop.ground));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, TEX_W, TEX_H);
    }

    /** Re-bake the PMREM IBL, reusing the render target (no per-bake allocation). */
    private bakeIbl(): void {
        if (!this.pmrem) return;
        try {
            const next = this.pmrem.fromEquirectangular(this.texture, this.envTarget ?? undefined);
            this.envTarget = next;
            this.scene.environment = next.texture;
        } catch {
            this.pmrem = null; // one failure is enough — stop retrying every phase
        }
    }

    dispose(): void {
        this.scene.background = null;
        this.scene.environment = null;
        this.envTarget?.dispose();
        this.envTarget = null;
        this.pmrem?.dispose();
        this.pmrem = null;
        this.texture.dispose();
    }
}
