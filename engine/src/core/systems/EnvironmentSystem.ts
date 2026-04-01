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

    // Legacy Weather Mapping (Deterministic categories)
    private weatherCategories = ["clear", "cloud", "rain", "snow"] as const;
    private hashSlices = {
        categoryRange: [10, 2], // Substring start, length
        gradeRange: [12, 2]
    };

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
    }

    public onNewBlock(world: World, height: number, hash: string, intervalSeconds: number): void {
        const state = world.getComponent<EnvironmentStateComponent>(this.envEntity!, "EnvironmentStateComponent")!;
        if (state.currentHeight === height) return;

        state.currentHeight = height;
        state.currentHash = hash;

        this.simulateTimeBreakdown(state, height, intervalSeconds);
        this.simulateWeatherHash(state, hash);
    }

    private simulateTimeBreakdown(state: EnvironmentStateComponent, height: number, interval: number): void {
        let diff = Math.max(0, (height - this.timeConfig.startHeight)) * interval * this.timeConfig.speed;
        if (diff >= this.timeConfig.year) { state.year = Math.floor(diff / this.timeConfig.year); diff %= this.timeConfig.year; }
        if (diff >= this.timeConfig.month) { state.month = Math.floor(diff / this.timeConfig.month); diff %= this.timeConfig.month; }
        if (diff >= this.timeConfig.day) { state.day = Math.floor(diff / this.timeConfig.day); diff %= this.timeConfig.day; }
        if (diff >= this.timeConfig.hour) { state.hour = Math.floor(diff / this.timeConfig.hour); diff %= this.timeConfig.hour; }
        if (diff >= this.timeConfig.minute) { state.minute = Math.floor(diff / this.timeConfig.minute); diff %= this.timeConfig.minute; }
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

        // 1. Time progression Visuals
        if (this.sunLight && this.ambientLight) {
            const timePercent = (state.hour * 60 + state.minute) / (24 * 60);
            const angle = timePercent * Math.PI * 2 - Math.PI / 2;

            const sunX = Math.cos(angle) * 100;
            const sunY = Math.sin(angle) * 100;
            const sunZ = 50;

            const isDay = sunY > 0;
            const intensity = isDay ? 1.0 : 0.1;
            const ambient = isDay ? 0.4 : 0.1;

            world.renderEngine.updateDirectionalLight(this.sunLight, 0xffffff, intensity, sunX, sunY, sunZ);
            world.renderEngine.updateAmbientLight(this.ambientLight, 0xffffff, ambient);
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
}
