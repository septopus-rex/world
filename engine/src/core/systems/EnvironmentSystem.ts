import { World, ISystem, EntityId } from '../World';
import { RenderHandle } from '../types/Adjunct';
import { EnvironmentStateComponent } from '../components/EnvironmentComponents';
import { Coords } from '../utils/Coords';

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
    private baseAmbient = 0.4;    // day/night ambient base, before the flash boost
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
    //    sun. (Shadows remain off in RenderEngine — grazing-angle moiré needs
    //    bias tuning; independent of this cycle.)
    private static readonly DAYLIGHT = {
        twilight: 0.12,               // half-width of the sunrise/sunset band
        sunDay: 1.0, sunNight: 0.1,   // directional intensity range
        ambDay: 0.4, ambNight: 0.1,   // ambient intensity range
        chase: 2.5,                   // 1/s — visual catch-up rate on clock jumps
    };
    private visAngle: number | null = null; // smoothed sun angle (radians)
    private visSun = 1.0;                   // smoothed directional intensity
    private visAmb = 0.4;                   // smoothed ambient intensity

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
        this.sunLight = world.renderEngine.setDirectionalLight(0xffffff, 1.0, 50, 100, 50);
        this.ambientLight = world.renderEngine.setAmbientLight(0xffffff, 0.4);
        this.particleSystem = world.renderEngine.createWeatherParticles();

        // Sky-matched distance fog sized to the block-streaming window: blocks load
        // in a bounded (2*extend+1)² square, so the region's far edge is a hard chunk
        // boundary against the sky. Fade it out (opaque ~ the window radius) so the
        // staircase silhouette dissolves instead of showing a jagged void edge.
        const ext = (world.config.player as any)?.extend ?? 2;
        const radius = ext * Coords.BLOCK_SIZE;                 // nearest boundary ≈ this
        world.renderEngine.setFog(radius * 0.5, radius * 1.2);
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
            const targetSun = D.sunNight + (D.sunDay - D.sunNight) * dayF;
            const targetAmb = D.ambNight + (D.ambDay - D.ambNight) * dayF;
            this.visSun += (targetSun - this.visSun) * blend;
            this.visAmb += (targetAmb - this.visAmb) * blend;
            this.baseAmbient = this.visAmb;

            // Advance the lightning envelope BEFORE applying lights so a strike
            // brightens the same frame.
            const flash = this.updateLightning(state, dt);

            world.renderEngine.updateDirectionalLight(
                this.sunLight, 0xffffff, this.visSun + flash * EnvironmentSystem.LIGHTNING.sunBoost, sunX, sunY, sunZ);
            world.renderEngine.updateAmbientLight(
                this.ambientLight, 0xffffff, this.visAmb + flash * EnvironmentSystem.LIGHTNING.ambientBoost);
        }

        // 2. Weather Visuals
        if (this.particleSystem) {
            const isRaining = state.weatherCategory === 'rain';
            const playerEntities = world.queryEntities("CameraComponent");
            if (playerEntities.length > 0) {
                const trans = world.getComponent<any>(playerEntities[0], "TransformComponent");
                if (trans) {
                    world.renderEngine.updateWeatherParticles(
                        this.particleSystem,
                        trans.position[0],
                        trans.position[1],
                        trans.position[2],
                        isRaining
                    );
                }
            } else {
                world.renderEngine.updateWeatherParticles(this.particleSystem, 0, 0, 0, false);
            }
        }
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
