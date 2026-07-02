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

    // Time Config (Synced with GlobalConfig)
    private timeConfig = {
        speed: GlobalConfig.time.speed,
        minute: 60,
        hour: 60 * 60,
        day: 60 * 60 * 24,
        month: 60 * 60 * 24 * 30,
        year: 60 * 60 * 24 * 30 * 12,
        startHeight: GlobalConfig.time.epoch
    };

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

    // TEMPORARY: freeze lighting to an even, constant flat light — no day/night
    // swing, no lightning flashes (and shadows are off in RenderEngine). The
    // dynamic lighting was distractingly unstable; this parks it so other work can
    // proceed. Flip to false to restore the full day/night + weather cycle.
    static readonly FLAT_LIGHTING = true;
    private static readonly FLAT = { sun: 0.55, ambient: 0.9 };

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

        this.simulateTimeBreakdown(state, height, intervalSeconds);
        this.simulateWeatherHash(state, hash);
    }

    // NORMATIVE time derivation (protocol/{cn,en}/world.md §3.1): fixed-unit
    // calendar over elapsed = (height − epoch) × interval × speed.
    private simulateTimeBreakdown(state: EnvironmentStateComponent, height: number, interval: number): void {
        let diff = Math.max(0, (height - this.timeConfig.startHeight)) * interval * this.timeConfig.speed;
        // Always assign every unit (the old engine reset lower units too). The
        // earlier port only assigned when diff >= unit, so at a day boundary
        // (diff % day == small) hour/minute stayed STALE instead of resetting to 0,
        // freezing the sun. Unconditional assignment keeps the clock continuous.
        state.year = Math.floor(diff / this.timeConfig.year); diff %= this.timeConfig.year;
        state.month = Math.floor(diff / this.timeConfig.month); diff %= this.timeConfig.month;
        state.day = Math.floor(diff / this.timeConfig.day); diff %= this.timeConfig.day;
        state.hour = Math.floor(diff / this.timeConfig.hour); diff %= this.timeConfig.hour;
        state.minute = Math.floor(diff / this.timeConfig.minute); diff %= this.timeConfig.minute;
        state.second = Math.floor(diff);
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
        const state = world.getComponent<EnvironmentStateComponent>(this.envEntity!, "EnvironmentStateComponent")!;

        // 1. Time progression Visuals (+ lightning flash folded in)
        if (this.sunLight && this.ambientLight) {
            if (EnvironmentSystem.FLAT_LIGHTING) {
                // Parked: constant, even light from a fixed sun — no swing, no flash.
                world.renderEngine.updateDirectionalLight(
                    this.sunLight, 0xffffff, EnvironmentSystem.FLAT.sun, 50, 100, 50);
                world.renderEngine.updateAmbientLight(
                    this.ambientLight, 0xffffff, EnvironmentSystem.FLAT.ambient);
            } else {
                const timePercent = (state.hour * 60 + state.minute) / (24 * 60);
                const angle = timePercent * Math.PI * 2 - Math.PI / 2;

                const sunX = Math.cos(angle) * 100;
                const sunY = Math.sin(angle) * 100;
                const sunZ = 50;

                const isDay = sunY > 0;
                const baseIntensity = isDay ? 1.0 : 0.1;
                this.baseAmbient = isDay ? 0.4 : 0.1;

                // Advance the lightning envelope BEFORE applying lights so a strike
                // brightens the same frame.
                const flash = this.updateLightning(state, dt);

                world.renderEngine.updateDirectionalLight(
                    this.sunLight, 0xffffff, baseIntensity + flash * EnvironmentSystem.LIGHTNING.sunBoost, sunX, sunY, sunZ);
                world.renderEngine.updateAmbientLight(
                    this.ambientLight, 0xffffff, this.baseAmbient + flash * EnvironmentSystem.LIGHTNING.ambientBoost);
            }
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
