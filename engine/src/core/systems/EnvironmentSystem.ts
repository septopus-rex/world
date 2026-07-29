import { World, ISystem, EntityId } from '../World';
import { RenderHandle } from '../types/Adjunct';
import { EnvironmentStateComponent } from '../components/EnvironmentComponents';

import { GlobalConfig } from '../GlobalConfig';

/**
 * Procedural Environmental Data derived from Blockchain hashes.
 */
export class EnvironmentSystem implements ISystem {
    private envEntity: EntityId | null = null;

    // Internal visual state references (opaque handles)
    private sunLight: RenderHandle | null = null;
    private ambientLight: RenderHandle | null = null;
    private particleSystem: RenderHandle | null = null;

    // Chain CALENDAR (day-and-above only — see §"sub-day time" below for
    // hour/minute/second): WORLD DATA first (world doc `time` section — the
    // injected config wins, base-data-audit D7), GlobalConfig only as the
    // protocol default when a world doc omits it.
    private timeConfig = {
        speed: GlobalConfig.time.speed,
        day: 60 * 60 * 24,
        month: 60 * 60 * 24 * 30,
        year: 60 * 60 * 24 * 30 * 12,
        startHeight: GlobalConfig.time.epoch
    };
    // Sub-day LOCAL clock (chain-independent — see below): how many real
    // seconds one full simulated day/night cycle takes.
    private localTimeConfig = {
        daySeconds: GlobalConfig.time.localDaySeconds
    };
    private timeConfigured = false;
    private syncTimeFromConfig(world: World): void {
        if (this.timeConfigured) return;
        const t = (world.config as any)?.time;
        if (t) {
            if (Number.isFinite(Number(t.speed))) this.timeConfig.speed = Number(t.speed);
            if (Number.isFinite(Number(t.epoch))) this.timeConfig.startHeight = Number(t.epoch);
            if (Number.isFinite(Number(t.localDaySeconds)) && Number(t.localDaySeconds) > 0) {
                this.localTimeConfig.daySeconds = Number(t.localDaySeconds);
            }
        }
        this.timeConfigured = true;
    }
    // Sub-day LOCAL clock accumulator, in simulated seconds-into-the-day
    // [0..86400). Starts near noon so the very first rendered frame (before
    // any update() has run) matches the component's initial hour:12 default.
    private localSeconds = 12 * 60 * 60;

    // Deterministic weather mapping — NORMATIVE cross-engine contract:
    // protocol/{cn,en}/world.md §3.1 (hash slice positions, category table,
    // mod-4 grade, storm predicate). Do not change without updating the spec.
    private weatherCategories = ["clear", "cloud", "rain", "snow"] as const;
    private hashSlices = {
        categoryRange: [10, 2], // Substring start, length (post-0x, spec §3.1)
        gradeRange: [12, 2]
    };

    // Lightning: a flash envelope that pops during thunderstorms (rain + grade≥1)
    // and decays. Deterministic (timer-driven, no RNG) so headless steps repeat.
    private flashLevel = 0;       // current [0..1] brightness pop
    private strikeTimer = 0;      // seconds since the last strike
    private baseAmbient = 0.05;   // day/night ambient base, before the flash boost
    private static readonly LIGHTNING = {
        baseInterval: 8,   // seconds between strikes at grade 1 (scales 1/grade)
        decay: 0.35,       // seconds for a flash to fade to black
        ambientBoost: 1.5, // added to ambient at full flash
        sunBoost: 2.0,     // added to directional intensity at full flash
    };

    // Day/night visual tuning. Two instabilities are handled here:
    //  • binary pop at the horizon → a smoothstep over a twilight band of sun
    //    elevation (sin units) fades intensity instead of snapping at sunY=0;
    //  • any residual jump in hour/minute (e.g. a world's `localDaySeconds`
    //    override taking effect, or the one-time settle at boot) → the VISUAL
    //    sun angle and intensities CHASE their targets at `chase` per second,
    //    so a jump glides over ~a second instead of teleporting the sun. In
    //    steady state this is now mostly a no-op: hour/minute come from the
    //    LOCAL sub-day clock (below), which already advances smoothly frame to
    //    frame — the chain calendar (year/month/day) can still jump on a new
    //    block, but it no longer drives hour/minute, so it no longer moves the
    //    sun. (Shadows are ON by default since 2026-07-25; the grazing-angle
    //    moiré was cured by shadow-frustum density, not by this cycle.)
    private static readonly DAYLIGHT = {
        twilight: 0.12,               // half-width of the sunrise/sunset band
        sunDay: 1.9, sunNight: 0.1,   // directional intensity range
        // Ambient is much lower than the pre-IBL 0.4/0.1: the sky's PMREM
        // environment (render/SkyEnvironment) now supplies the bounce/fill term
        // WITH direction to it. A flat ambient on top of that is pure wash — it
        // was what erased every shading gradient and made surfaces read as paper
        // cut-outs. Sun intensity goes up to compensate, so the lit/unlit contrast
        // (i.e. the sense of a light source) is carried by the sun, not by fill.
        ambDay: 0.05, ambNight: 0.02, // ambient intensity range
        chase: 2.5,                   // 1/s — visual catch-up rate on clock jumps
    };

    /**
     * OVERCAST — one scalar [0..1] derived from (category, grade), and the ONLY
     * channel by which weather touches light. `clear` must map to exactly 0, so
     * the tuned clear-day baseline (画面基线, sun 1.9 / amb 0.05 / IBL 0.32)
     * survives bit-for-bit and this whole feature is inert in fair weather.
     *
     * WHY ONE SCALAR ISN'T ENOUGH ON ITS OWN — it must drive FOUR targets, not
     * just scale the sun. Dimming only the sun gives a dark scene that still has
     * a blue sky and hard sun shadows, which reads as "sunset", not "storm".
     * What actually says overcast:
     *   · sun DOWN hard (under heavy cloud the direct beam is nearly gone), which
     *     also makes the shadows fade out on their own — no shadow code needed;
     *   · sky/IBL UP and GREY — the light becomes omnidirectional, and the blue
     *     has to go, or you get a downpour under a summer sky (the bug report);
     *   · fog IN — rain cuts visibility. Only `near` moves; `far` stays pinned to
     *     metrics.streamingReach or the streaming-window boundary shows again.
     *
     * Values are RENDERER-DEFINED (protocol/{cn,en}/world.md §3.2 — only the
     * category/grade derivation is the cross-engine contract), so tune freely;
     * `clear → 0` is the one line that isn't free.
     */
    private static readonly OVERCAST: Record<string, { base: number; perGrade: number }> = {
        clear: { base: 0, perGrade: 0 },
        cloud: { base: 0.18, perGrade: 0.09 },  // 0.18 … 0.45
        rain: { base: 0.55, perGrade: 0.12 },   // 0.55 … 0.91
        snow: { base: 0.45, perGrade: 0.10 },   // 0.45 … 0.75
    };
    /** How far each target moves at overcast = 1. */
    private static readonly OVERCAST_GAIN = {
        sunCut: 0.92,    // sun × (1 − this·oc) → 8 % of the direct beam left
        ambAdd: 0.06,    // ambient 0.05 → 0.11 (fill rises as the beam dies)
        fogNear: 0.45,   // fog near pulled in by this fraction (far NEVER moves)
    };
    private visAngle: number | null = null; // smoothed sun angle (radians)
    private visSun = 1.9;                   // smoothed directional intensity
    private visAmb = 0.05;                  // smoothed ambient intensity
    private visOvercast = 0;                // smoothed overcast [0..1]
    /** Last smoothstepped day factor (0 = night … 1 = full day) — the same value the
     *  sun, sky and IBL ride on. Read-only observation surface for Engine
     *  .environmentInfo() and the HUD clock; nothing here consumes it. */
    private visDayF = 1;
    /** @see visDayF */
    public get dayFactor(): number { return this.visDayF; }
    /** Fog far plane = the streaming reach; fixed at construction, never weathered. */
    private fogFar = 0;
    /** Cached player entity for the fill light's anchor (see updatePlayerLight). */
    private playerEntity: number | null = null;

    constructor(world: World) {
        // Create singleton Environment Entity
        this.envEntity = world.createEntity();

        world.addComponent<EnvironmentStateComponent>(this.envEntity, "EnvironmentStateComponent", {
            currentHeight: 0,
            currentHash: "",
            year: 0, month: 0, day: 0, hour: 12, minute: 0, second: 0,
            weatherCategory: "clear",
            weatherGrade: 0
        });

        // Initialize lights and particles via RenderEngine
        this.sunLight = world.renderEngine.setDirectionalLight(0xfff6e8, 1.9, 50, 100, 50);
        this.ambientLight = world.renderEngine.setAmbientLight(0xffffff, 0.05);
        this.particleSystem = world.renderEngine.createWeatherParticles();

        // Sky-matched distance fog, sized so it CLOSES BEFORE the streaming window
        // does. Blocks load in a bounded (2·extend+1)² square, so the region ends at
        // a hard chunk boundary against the sky; the fog's job is to be already
        // opaque there, whichever direction you look.
        //
        // `far` = world.metrics.streamingReach(ext) — the guaranteed radius, and the
        // SINGLE definition BlockLODSystem derives from too. Read that method before
        // touching this: it is the whole argument for why a square window and a
        // radial mask can never be made to coincide, and why the answer is to fog
        // out inside the window rather than to keep enlarging the radius to chase
        // the corners.
        //
        // History, so it is not re-litigated a third time: `far` was first
        // ext·blockWidth·1.2 (38.4 m), which left the corner blocks (45.3 m) past it
        // — painted pure sky, so the window read as an "井" from above. The fix
        // (2026-07-27) enlarged it to ext·hypot(bw,bl)·1.2 = 54.3 m, which reached
        // the corner CENTRES but not the corner tips (60.5 m), AND pushed the fog
        // well past the nearest window face (32 m) — so the ground now visibly
        // ENDED at 36 % haze in the orthogonal directions. One bug traded for its
        // mirror image. Neither radius was ever going to work.
        const ext = (world.config.player as any)?.extend ?? 2;
        const reach = world.metrics.streamingReach(ext);
        this.fogFar = reach;
        world.renderEngine.setFog(reach * 0.5, reach);
    }

    public onNewBlock(world: World, height: number, hash: string, intervalSeconds: number): void {
        const state = world.getComponent<EnvironmentStateComponent>(this.envEntity!, "EnvironmentStateComponent")!;
        if (state.currentHeight === height) return;

        state.currentHeight = height;
        state.currentHash = hash;

        this.simulateCalendarFromChain(state, height, intervalSeconds);
        this.simulateWeatherHash(state, hash);
    }

    // NORMATIVE chain CALENDAR derivation (protocol/{cn,en}/world.md §3.1):
    // fixed-unit year/month/day over elapsed = (height − epoch) × interval ×
    // speed. Chain-driven and semantic (must match across engines) — but ONLY
    // down to day granularity. Hour/minute/second are NOT part of this: they
    // are a separate LOCAL simulation (see `localSeconds` / update() below),
    // so the sun still visibly rises and sets between blocks instead of
    // freezing at whatever hour the chain math happens to land on (with the
    // "1 Bitcoin block = 1 day" convention, interval is an exact day multiple,
    // so a chain-only hour would ALWAYS compute to 0 — frozen at midnight).
    private simulateCalendarFromChain(state: EnvironmentStateComponent, height: number, interval: number): void {
        let diff = Math.max(0, (height - this.timeConfig.startHeight)) * interval * this.timeConfig.speed;
        // Always assign every unit (the old engine reset lower units too). The
        // earlier port only assigned when diff >= unit, so at a year boundary
        // month/day stayed STALE instead of resetting to 0. Unconditional
        // assignment keeps the calendar continuous.
        state.year = Math.floor(diff / this.timeConfig.year); diff %= this.timeConfig.year;
        state.month = Math.floor(diff / this.timeConfig.month); diff %= this.timeConfig.month;
        state.day = Math.floor(diff / this.timeConfig.day);
    }

    private simulateWeatherHash(state: EnvironmentStateComponent, hash: string): void {
        if (!hash || hash.length < 20) return;
        const catSlice = hash.substring(this.hashSlices.categoryRange[0] + 2, this.hashSlices.categoryRange[0] + 2 + this.hashSlices.categoryRange[1]);
        const gradeSlice = hash.substring(this.hashSlices.gradeRange[0] + 2, this.hashSlices.gradeRange[0] + 2 + this.hashSlices.gradeRange[1]);
        const catVal = parseInt(`0x${catSlice}`) || 0;
        const gradeVal = parseInt(`0x${gradeSlice}`) || 0;
        state.weatherCategory = this.weatherCategories[catVal % this.weatherCategories.length];
        state.weatherGrade = gradeVal % 4;
    }

    public update(world: World, dt: number): void {
        this.syncTimeFromConfig(world); // once, after the world doc is injected
        const state = world.getComponent<EnvironmentStateComponent>(this.envEntity!, "EnvironmentStateComponent")!;

        // Sub-day time: a LOCAL, chain-INDEPENDENT clock — hour/minute/second
        // are simulated continuously (advances by dt every frame, same idiom
        // as the lightning timer below), NOT derived from block height/hash.
        // The chain calendar (year/month/day, simulateCalendarFromChain above)
        // only calibrates WHICH DAY it officially is; the sun's actual
        // moment-to-moment position keeps cycling between blocks — which
        // arrive irregularly, ~10 real minutes apart on average for Bitcoin —
        // instead of freezing at a fixed hour. Deterministic across headless
        // steps (dt-accumulated, no Date.now()).
        const daySeconds = 60 * 60 * 24;
        this.localSeconds = (this.localSeconds + dt * (daySeconds / this.localTimeConfig.daySeconds)) % daySeconds;
        state.hour = Math.floor(this.localSeconds / 3600);
        state.minute = Math.floor((this.localSeconds % 3600) / 60);
        state.second = Math.floor(this.localSeconds % 60);

        // 1. Time progression Visuals (+ lightning flash folded in)
        if (this.sunLight && this.ambientLight) {
            const D = EnvironmentSystem.DAYLIGHT;
            const timePercent = (state.hour * 60 + state.minute) / (24 * 60);
            const target = timePercent * Math.PI * 2 - Math.PI / 2;

            // Chase the target angle along the SHORTEST arc — a ticker jump
            // (or a big calendar leap) glides instead of teleporting the sun.
            if (this.visAngle === null) this.visAngle = target;
            let dA = target - this.visAngle;
            dA = ((dA + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
            const blend = Math.min(1, dt * D.chase);
            this.visAngle += dA * blend;

            const sunX = Math.cos(this.visAngle) * 100;
            const sunY = Math.sin(this.visAngle) * 100;
            const sunZ = 50;

            // Smoothstep across the twilight band of sun elevation — dawn/dusk
            // fade instead of the old binary isDay pop.
            const s = Math.sin(this.visAngle);
            const t = Math.min(1, Math.max(0, (s + D.twilight) / (2 * D.twilight)));
            const dayF = t * t * (3 - 2 * t);
            this.visDayF = dayF;

            // Weather → light, through ONE scalar (see OVERCAST). Chased on the
            // same envelope as everything else here: weather flips on a block
            // tick, which is a step change, and an un-chased one would snap the
            // whole scene's exposure in a single frame.
            const G = EnvironmentSystem.OVERCAST_GAIN;
            this.visOvercast += (this.overcastTarget(state) - this.visOvercast) * blend;
            const oc = this.visOvercast;

            const targetSun = (D.sunNight + (D.sunDay - D.sunNight) * dayF) * (1 - G.sunCut * oc);
            const targetAmb = D.ambNight + (D.ambDay - D.ambNight) * dayF + G.ambAdd * oc;
            this.visSun += (targetSun - this.visSun) * blend;
            this.visAmb += (targetAmb - this.visAmb) * blend;
            this.baseAmbient = this.visAmb;

            // Rain/snow cuts visibility: pull the haze IN. `far` is deliberately
            // re-sent unchanged — it is metrics.streamingReach, and the moment it
            // drifts the streaming window's own boundary becomes visible again
            // (docs/architecture/performance.md). Weather may fog you in; it may
            // never fog you out past the loaded world.
            if (this.fogFar > 0) {
                world.renderEngine.setFogRange?.(this.fogFar * 0.5 * (1 - G.fogNear * oc), this.fogFar);
            }

            // Advance the lightning envelope BEFORE applying lights so a strike
            // brightens the same frame.
            const flash = this.updateLightning(state, dt);

            // Sun colour warms as it approaches the horizon — the atmosphere's
            // longer path scatters the blue out. Cheap, and it is what sells a
            // sunset as a sunset rather than "the same white sun, dimmer".
            const sunColor = dayF > 0.85 ? 0xfff6e8 : lerpRgb(0xff9a4d, 0xfff6e8, Math.min(1, dayF / 0.85));
            world.renderEngine.updateDirectionalLight(
                this.sunLight, sunColor, this.visSun + flash * EnvironmentSystem.LIGHTNING.sunBoost, sunX, sunY, sunZ);
            world.renderEngine.updateAmbientLight(
                this.ambientLight, 0xffffff, this.visAmb + flash * EnvironmentSystem.LIGHTNING.ambientBoost);

            // Sky + IBL follow the SAME smoothstepped day factor as the lights, so
            // the visible sky, the environment light and the sun all cross the
            // twilight band together (a lit scene under a noon sky was the tell).
            // `oc` rides along for the same reason one level up: a downpour under
            // a clear blue sky was the bug that started this.
            world.renderEngine.setSkyPhase?.(dayF, oc);

            // The player's own lights (render/PlayerLighting): an avatar fill that
            // makes the night navigable, plus the hand torch. Driven from HERE
            // because this is where the day factor lives — `1 − dayF` is the same
            // curve the sun sets on, so the fill rises exactly as the sun leaves.
            // A heavy overcast is dark too, so it counts toward "night" at a
            // fraction of its weight (a storm at noon is dim, not nocturnal).
            this.updatePlayerLight(world, Math.min(1, (1 - dayF) + 0.35 * oc));
        }

        // 2. Weather Visuals — BOTH precipitating categories drive the volume.
        // 'snow' used to fall through to hidden (only `isRaining` was checked), so
        // a quarter of the weather cycle rendered nothing at all. Grade rides along
        // too: it scales particle count and fall speed, so a grade-0 drizzle and a
        // grade-3 downpour no longer look identical. Density/appearance are
        // renderer-defined (protocol/{cn,en}/world.md §3.2) — only the CATEGORY and
        // GRADE derivation above is the cross-engine contract.
        if (this.particleSystem) {
            const kind = state.weatherCategory === 'rain' ? 'rain'
                : state.weatherCategory === 'snow' ? 'snow'
                    : null;
            const playerEntities = world.queryEntities("CameraComponent");
            const trans = playerEntities.length > 0
                ? world.getComponent<any>(playerEntities[0], "TransformComponent")
                : null;
            if (trans) {
                world.renderEngine.updateWeatherParticles(
                    this.particleSystem,
                    trans.position[0], trans.position[1], trans.position[2],
                    kind, state.weatherGrade, dt,
                );
            } else {
                world.renderEngine.updateWeatherParticles(this.particleSystem, 0, 0, 0, null, 0, dt);
            }
        }
    }

    /**
     * Point the player's fill light at the player and tell it how dark it is.
     * The entity lookup is cached: it is a per-frame call, and the player is the
     * one entity that never churns. A world without a player (headless block
     * tests, the minimap-only rigs) simply never anchors — the lights sit at the
     * origin at zero intensity, which costs nothing.
     */
    private updatePlayerLight(world: World, night: number): void {
        if (this.playerEntity == null) {
            this.playerEntity = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0] ?? null;
            if (this.playerEntity == null) return;
        }
        const t = world.getComponent<any>(this.playerEntity, 'TransformComponent');
        if (!t) { this.playerEntity = null; return; }   // entity went away — re-look-up next frame
        world.renderEngine.setPlayerLightAnchor?.(t.position[0], t.position[1], t.position[2], night);
    }

    /**
     * Overcast [0..1] for the current weather — the single scalar that couples
     * weather to light. Unknown categories fall back to clear (0), so a future
     * category added to the protocol darkens nothing until it is tuned here
     * rather than crashing or guessing.
     */
    private overcastTarget(state: EnvironmentStateComponent): number {
        const e = EnvironmentSystem.OVERCAST[state.weatherCategory] ?? EnvironmentSystem.OVERCAST.clear;
        const grade = Math.min(3, Math.max(0, Math.round(state.weatherGrade || 0)));
        return Math.min(1, Math.max(0, e.base + e.perGrade * grade));
    }

    /**
     * Advance the lightning flash envelope and return the current level [0..1].
     * Strikes fire on a grade-scaled timer during a thunderstorm (rain, grade≥1);
     * each strike snaps the level to 1 and then decays. Deterministic — no RNG —
     * so deterministic stepping reproduces the same storm.
     */
    private updateLightning(state: EnvironmentStateComponent, dt: number): number {
        const L = EnvironmentSystem.LIGHTNING;
        const stormy = state.weatherCategory === 'rain' && state.weatherGrade >= 1;

        if (stormy) {
            this.strikeTimer += dt;
            const interval = L.baseInterval / state.weatherGrade; // heavier storm → more strikes
            if (this.strikeTimer >= interval) {
                this.strikeTimer = 0;
                this.flashLevel = 1; // STRIKE
            }
        } else {
            this.strikeTimer = 0;
        }

        if (this.flashLevel > 0) {
            this.flashLevel = Math.max(0, this.flashLevel - dt / L.decay);
        }
        state.lightning = this.flashLevel;
        return this.flashLevel;
    }
}

/** Blend two 0xRRGGBB colours (core-side, no Three import allowed here). */
function lerpRgb(a: number, b: number, t: number): number {
    const k = Math.min(1, Math.max(0, t));
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    return ((Math.round(ar + (br - ar) * k) << 16)
        | (Math.round(ag + (bg - ag) * k) << 8)
        | Math.round(ab + (bb - ab) * k));
}
