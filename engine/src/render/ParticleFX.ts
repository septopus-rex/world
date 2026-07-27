import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';

/** Precipitation kind driven by EnvironmentSystem; `null` = nothing falling. */
export type WeatherKind = 'rain' | 'snow' | null;

/** Per-handle mutable state for the weather volume (parked on `points.userData`). */
interface WeatherState {
    kind: Exclude<WeatherKind, null>;
    /** Per-particle 0..1 constant — varies speed, size-alpha and sway phase so the
     *  volume doesn't read as one rigid sheet. */
    seeds: Float32Array;
    /** Box-local min corner, ABSOLUTE world. Delta-compensating against this is what
     *  makes the precipitation stay put in the world while the box follows you. */
    ax: number; ay: number; az: number;
    anchored: boolean;
    time: number;
    rainMat: THREE.PointsMaterial;
    snowMat: THREE.PointsMaterial;
}

const smoothstep = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/**
 * Point-cloud particle effects (render/ParticleFX) — the weather volume
 * (rain/snow following the player) and one-shot radial bursts (item pickups
 * etc.). Owns only geometry/material construction and per-frame integration;
 * lifetime/visibility policy stays with the driving systems (EnvironmentSystem
 * / ParticleEffectSystem), and disposal goes through the facade's removeHandle
 * like any other handle.
 *
 * THE SPRITE IS NOT OPTIONAL. A PointsMaterial with no `map` draws each particle
 * as an opaque SCREEN-ALIGNED SQUARE — which is exactly what rain looked like
 * until 2026-07-27: a cloud of little boxes. Both sprites here are generated
 * procedurally into a DataTexture (no asset to ship, no DOM needed): a soft
 * round flake and a tapered vertical streak.
 *
 * The other three things this file gets deliberately right, none of which are
 * free to re-break:
 *  · Particles FALL. The volume used to be re-centred on the player every frame
 *    and never integrated, so it was a static box of dots welded to the camera.
 *  · Positions are BOX-LOCAL, delta-compensated by the anchor's movement each
 *    frame. Storing absolute coords in a float32 attribute would put rain at
 *    ~32 km out on a 4 mm quantisation grid (the very reason FloatingOrigin
 *    exists); storing plain local coords without the delta would drag the whole
 *    downpour along with you, killing the parallax that sells it as weather.
 *  · Alpha is per-particle (vec4 vertex colours) and fades NEAR the camera. With
 *    world-space size attenuation a 0.5 m streak 40 cm from the lens covers a
 *    third of the screen; the near fade is what keeps precipitation off your
 *    face. The far end of the same ramp dissolves the box's cubic boundary into
 *    a sphere, so you never see the edge of the volume.
 */
export class ParticleFX {
    /** All particles live under worldRoot so the floating origin applies. */
    constructor(private readonly worldRoot: THREE.Group) { }

    /**
     * Volume shape + per-kind look. Public so the regression tests can assert
     * against the declared box instead of re-hardcoding its dimensions.
     *
     * SIZE THE BOX BY WHAT REACHES THE FRUSTUM, not by how many particles sound
     * like a lot. Only the wedge of the volume inside the view cone and inside
     * the fade radius is ever on screen — at the first tuning (4000 in a 44 m
     * box) that came to ~200 particles, most of them alpha-faded, so a grade-3
     * DOWNPOUR rendered as a dozen visible streaks. Tightening the box while
     * growing the pool is what buys density; both matter, and the ratio between
     * them is the thing to keep an eye on.
     */
    static readonly WEATHER = {
        /** Pool size; the DRAWN count scales with weather grade (see `density`). */
        pool: 9000,
        span: 34,           // horizontal box edge (m)
        height: 30,         // vertical box (m)
        below: 6,           // how far the box reaches below the anchor's feet
        nearIn: 0.8,        // fully transparent closer than this to the camera (m)
        nearOut: 4.0,       // fully opaque past this
        rain: {
            color: 0xbcd6ea, size: 0.6, opacity: 0.55,
            speed: 20, drift: 0.8, sway: 0,
            density: [0.2, 0.42, 0.7, 1.0],
        },
        snow: {
            // Flakes need real screen area to read as snow: at 0.17 m a flake
            // 10 m out is a ~4 px smudge, which is indistinguishable from nothing.
            color: 0xffffff, size: 0.26, opacity: 0.9,
            speed: 1.3, drift: 0.15, sway: 0.7,
            density: [0.14, 0.26, 0.4, 0.55],
        },
    };

    // Sprites are per-instance (one RenderEngine per page); a process-level static
    // would be shared across worlds, which this codebase has been bitten by before.
    private roundSprite: THREE.Texture | null = null;
    private streakSprite: THREE.Texture | null = null;

    /** Soft round flake — radial falloff, no hard rim. */
    private getRoundSprite(): THREE.Texture {
        return this.roundSprite ??= this.paint(64, 64, (u, v) => {
            const r = Math.hypot(u - 0.5, v - 0.5) * 2;      // 0 centre → 1 edge
            return Math.pow(Math.max(0, 1 - r), 1.6);
        });
    }

    /** Vertical rain streak — narrow horizontal gaussian, tapered at both ends.
     *  Point sprites are screen-aligned and this engine's camera never rolls, so a
     *  vertical streak in texture space is a vertical streak on screen. */
    private getStreakSprite(): THREE.Texture {
        return this.streakSprite ??= this.paint(32, 64, (u, v) => {
            const across = Math.exp(-Math.pow((u - 0.5) / 0.11, 2));  // thin core
            const along = Math.pow(Math.sin(Math.PI * v), 0.6);       // taper both ends
            return across * along;
        });
    }

    /** White RGB + procedural alpha, straight into a DataTexture. Deliberately NOT
     *  a canvas: a DataTexture needs no DOM, so the sprites exist under headless
     *  vitest too and the "is there actually a sprite?" regression is unit-testable
     *  instead of e2e-only. */
    private paint(w: number, h: number, alphaAt: (u: number, v: number) => number): THREE.Texture {
        const data = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
                data[i + 3] = Math.round(255 * Math.min(1, Math.max(0, alphaAt((x + 0.5) / w, (y + 0.5) / h))));
            }
        }

        const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
        tex.colorSpace = THREE.SRGBColorSpace;
        // DataTexture defaults to NEAREST on both filters — a 64² sprite blown up
        // over a near particle would be visibly blocky, i.e. squares again.
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        return tex;
    }

    private weatherMaterial(cfg: typeof ParticleFX.WEATHER.rain, map: THREE.Texture): THREE.PointsMaterial {
        return new THREE.PointsMaterial({
            color: cfg.color,
            size: cfg.size,
            map,
            transparent: true,
            opacity: cfg.opacity,
            // Particles must not occlude each other (or the depth-tested scene) — a
            // transparent square that writes depth punches a hole in whatever is
            // drawn after it.
            depthWrite: false,
            sizeAttenuation: true,
            // vec4 colour attribute → per-particle ALPHA, written on the CPU each
            // frame by updateWeather (we already walk every particle to integrate
            // the fall, so the fade costs nothing extra and needs no custom shader).
            vertexColors: true,
            fog: true,
        });
    }

    /** Ambient weather volume (pool of points in a 44×30×44 box, hidden until driven). */
    public createWeather(): RenderHandle {
        const W = ParticleFX.WEATHER;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(W.pool * 3);
        const colors = new Float32Array(W.pool * 4);
        const seeds = new Float32Array(W.pool);

        for (let i = 0; i < W.pool; i++) {
            positions[i * 3 + 0] = Math.random() * W.span;
            positions[i * 3 + 1] = Math.random() * W.height;
            positions[i * 3 + 2] = Math.random() * W.span;
            colors[i * 4 + 0] = 1; colors[i * 4 + 1] = 1; colors[i * 4 + 2] = 1;
            colors[i * 4 + 3] = 0; // faded in on the first driven frame
            seeds[i] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

        const state: WeatherState = {
            kind: 'rain',
            seeds,
            ax: 0, ay: 0, az: 0, anchored: false,
            time: 0,
            rainMat: this.weatherMaterial(W.rain, this.getStreakSprite()),
            snowMat: this.weatherMaterial(W.snow, this.getRoundSprite()),
        };

        const points = new THREE.Points(geometry, state.rainMat);
        points.userData.weather = state;
        // The box is always centred on the viewer, so culling it is pointless — and
        // the cached bounding sphere would be stale anyway (positions move every frame).
        points.frustumCulled = false;
        points.visible = false;
        this.worldRoot.add(points);
        return points;
    }

    /**
     * Integrate one weather frame: follow the anchor, fall, wrap, fade.
     *
     * @param x,y,z        anchor (the player), ABSOLUTE world coords
     * @param kind         'rain' | 'snow' | null (null hides the volume)
     * @param grade        0..3 storm grade — scales drawn particle count and speed
     * @param camX,camY,camZ camera position, ABSOLUTE world — centre of the near
     *                     fade. Defaults to the anchor (first person ≈ the same
     *                     point); in third person the lens sits metres behind the
     *                     player, and fading around the PLAYER would leave a
     *                     full-size streak parked on the camera.
     */
    public updateWeather(
        handle: RenderHandle,
        x: number, y: number, z: number,
        kind: WeatherKind = null,
        grade = 0,
        dt = 0,
        camX = x, camY = y, camZ = z,
    ): void {
        const points = handle as THREE.Points;
        const st = points.userData?.weather as WeatherState | undefined;
        if (!st) { points.visible = false; return; }

        if (!kind) { points.visible = false; return; }
        const W = ParticleFX.WEATHER;
        const cfg = kind === 'rain' ? W.rain : W.snow;

        if (st.kind !== kind) {
            st.kind = kind;
            points.material = kind === 'rain' ? st.rainMat : st.snowMat;
        }

        // Anchor the box's MIN CORNER, so local coords stay in [0, span) — small
        // enough that float32 attributes keep sub-millimetre precision even 32 km
        // from the world origin.
        const ax = x - W.span / 2, ay = y - W.below, az = z - W.span / 2;
        // How far the anchor moved since last frame. Subtracting it from every
        // local position keeps each particle where it was IN THE WORLD — without
        // this the whole downpour translates with you and reads as fog, not rain.
        // First driven frame (or after a hide) has no meaningful delta.
        const dx = st.anchored ? ax - st.ax : 0;
        const dy = st.anchored ? ay - st.ay : 0;
        const dz = st.anchored ? az - st.az : 0;
        st.ax = ax; st.ay = ay; st.az = az; st.anchored = true;
        points.position.set(ax, ay, az);
        points.visible = true;

        const g = Math.min(3, Math.max(0, Math.round(grade)));
        const drawn = Math.max(1, Math.round(W.pool * cfg.density[g]));
        points.geometry.setDrawRange(0, drawn);

        st.time += dt;
        const pos = points.geometry.attributes.position.array as Float32Array;
        const col = points.geometry.attributes.color.array as Float32Array;
        const seeds = st.seeds;

        // Camera in box-local space — the near/far alpha ramp is measured from here.
        const clx = camX - ax, cly = camY - ay, clz = camZ - az;
        // Fade to nothing BEFORE the nearest box face (span/2 = 22 m), not merely
        // before the corners: anything still visible at the face draws the box's
        // flat wall across your view. Costs some draw distance, buys a volume with
        // no perceptible boundary at all.
        const farIn = W.span * 0.32, farOut = W.span * 0.46;
        const fall = cfg.speed * (1 + g * 0.12) * dt;
        const drift = cfg.drift * (1 + g * 0.5) * dt;

        for (let i = 0; i < drawn; i++) {
            const s = seeds[i];
            const p = i * 3;

            let px = pos[p] - dx;
            let py = pos[p + 1] - dy - fall * (0.75 + 0.5 * s);
            let pz = pos[p + 2] - dz;

            px += drift;
            if (cfg.sway > 0) {
                // Snow tumbles instead of dropping: two out-of-phase sinusoids give a
                // per-flake drift that never repeats visibly across the volume.
                px += Math.sin(st.time * 0.9 + s * 6.283) * cfg.sway * dt;
                pz += Math.cos(st.time * 0.7 + s * 12.566) * cfg.sway * dt;
            }

            // Modulo wrap — O(1) for ANY displacement, so a teleport (or a portal
            // jump across the map) re-scatters the volume in a single frame instead
            // of chasing the anchor one box-width at a time.
            px -= W.span * Math.floor(px / W.span);
            pz -= W.span * Math.floor(pz / W.span);
            py -= W.height * Math.floor(py / W.height);

            pos[p] = px; pos[p + 1] = py; pos[p + 2] = pz;

            const ddx = px - clx, ddy = py - cly, ddz = pz - clz;
            const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
            col[i * 4 + 3] = smoothstep(W.nearIn, W.nearOut, d)
                * (1 - smoothstep(farIn, farOut, d))
                * (0.6 + 0.4 * s);
        }

        points.geometry.attributes.position.needsUpdate = true;
        points.geometry.attributes.color.needsUpdate = true;
    }

    /** One-shot radial burst: velocities are returned for the caller to integrate. */
    public createBurst(particleCount: number, color: number): { handle: RenderHandle, velocities: Float32Array } {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const speed = Math.random() * 15 + 5;
            velocities[i * 3 + 0] = speed * Math.sin(phi) * Math.cos(theta);
            velocities[i * 3 + 1] = speed * Math.cos(phi) + 5;
            velocities[i * 3 + 2] = speed * Math.sin(phi) * Math.sin(theta);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.25,
            // Same reason as the weather volume: without a sprite an additive point
            // is a glowing SQUARE. A soft round falloff is what makes a burst read
            // as sparks rather than as confetti.
            map: this.getRoundSprite(),
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false; // positions are integrated every frame
        this.worldRoot.add(points);

        return { handle: points, velocities };
    }

    /** Integrate one burst frame: ballistic positions + caller-driven fade. */
    public updateBurst(handle: RenderHandle, dt: number, velocities: Float32Array, opacity: number): void {
        const points = handle as THREE.Points;
        const positions = points.geometry.attributes.position.array as Float32Array;

        for (let i = 0; i < velocities.length / 3; i++) {
            positions[i * 3 + 0] += velocities[i * 3 + 0] * dt;
            positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
            positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
            velocities[i * 3 + 1] -= 9.8 * dt; // Gravity
        }

        points.geometry.attributes.position.needsUpdate = true;
        (points.material as THREE.PointsMaterial).opacity = opacity;
    }
}
