import * as THREE from 'three';
import { World, ISystem, EntityId } from '../World';
import { EnvironmentStateComponent } from '../components/EnvironmentComponents';
import { TransformComponent } from '../components/PlayerComponents';

/**
 * Procedural Environmental Data derived from Blockchain hashes.
 * Merges legacy core/time.js and core/weather.js
 */
export class EnvironmentSystem implements ISystem {
    private envEntity: EntityId | null = null;

    // Internal visual state references
    private sunLight: THREE.DirectionalLight | null = null;
    private ambientLight: THREE.AmbientLight | null = null;
    private particleSystem: THREE.Points | null = null;

    // Legacy Time Config (Speed multipliers)
    private timeConfig = {
        speed: 1, // Global simulation speed
        minute: 60,
        hour: 60 * 60,
        day: 60 * 60 * 24,
        month: 60 * 60 * 24 * 30,
        year: 60 * 60 * 24 * 30 * 12,
        startHeight: 0 // Baseline block
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

        // Try to attach to World's existing lights
        this.sunLight = (world.scene.children as any[]).find(c => c instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
        this.ambientLight = (world.scene.children as any[]).find(c => c instanceof THREE.AmbientLight) as THREE.AmbientLight;

        this.initWeatherParticles(world.scene);
    }

    /**
     * External Entry point provided by Solana/Bitcoin chain parser
     * Simulates the old `vbw_time.calc` and `vbw_weather.calc`
     */
    public onNewBlock(world: World, height: number, hash: string, intervalSeconds: number): void {
        const state = world.getComponent<EnvironmentStateComponent>(this.envEntity!, "EnvironmentStateComponent")!;

        if (state.currentHeight === height) return; // Prevent double trigger

        state.currentHeight = height;
        state.currentHash = hash;

        this.simulateTimeBreakdown(state, height, intervalSeconds);
        this.simulateWeatherHash(state, hash);
    }

    private simulateTimeBreakdown(state: EnvironmentStateComponent, height: number, interval: number): void {
        let diff = Math.max(0, (height - this.timeConfig.startHeight)) * interval * this.timeConfig.speed;

        if (diff >= this.timeConfig.year) {
            state.year = Math.floor(diff / this.timeConfig.year);
            diff %= this.timeConfig.year;
        }
        if (diff >= this.timeConfig.month) {
            state.month = Math.floor(diff / this.timeConfig.month);
            diff %= this.timeConfig.month;
        }
        if (diff >= this.timeConfig.day) {
            state.day = Math.floor(diff / this.timeConfig.day);
            diff %= this.timeConfig.day;
        }
        if (diff >= this.timeConfig.hour) {
            state.hour = Math.floor(diff / this.timeConfig.hour);
            diff %= this.timeConfig.hour;
        }
        if (diff >= this.timeConfig.minute) {
            state.minute = Math.floor(diff / this.timeConfig.minute);
            diff %= this.timeConfig.minute;
        }
        state.second = Math.floor(diff);
    }

    private simulateWeatherHash(state: EnvironmentStateComponent, hash: string): void {
        if (!hash || hash.length < 20) return;

        // Extract bytes just like legacy system
        const catSlice = hash.substring(this.hashSlices.categoryRange[0] + 2, this.hashSlices.categoryRange[0] + 2 + this.hashSlices.categoryRange[1]);
        const gradeSlice = hash.substring(this.hashSlices.gradeRange[0] + 2, this.hashSlices.gradeRange[0] + 2 + this.hashSlices.gradeRange[1]);

        const catVal = parseInt(`0x${catSlice}`) || 0;
        const gradeVal = parseInt(`0x${gradeSlice}`) || 0;

        state.weatherCategory = this.weatherCategories[catVal % this.weatherCategories.length];

        // Simple grade 0-3
        state.weatherGrade = gradeVal % 4;
    }

    // --- VISUAL RENDERING LOOP ---

    public update(world: World, dt: number): void {
        const state = world.getComponent<EnvironmentStateComponent>(this.envEntity!, "EnvironmentStateComponent")!;

        // 1. Time progression Visuals (Sun position & Ambient Color)
        if (this.sunLight && this.ambientLight) {
            // Calculate a 0 to 1 value for the day (0 = midnight, 0.5 = noon, 1.0 = midnight)
            const timePercent = (state.hour * 60 + state.minute) / (24 * 60);

            // Simple sun arc over Z axis
            const tilt = Math.PI * 2 * timePercent - Math.PI / 2;
            this.sunLight.position.set(Math.cos(tilt) * 50, Math.sin(tilt) * 50, 0);

            // Intensity and color change (Night is dark blue, Day is bright white)
            if (timePercent > 0.25 && timePercent < 0.75) {
                // Day Time
                this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, 1.5, dt * 2);
                this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientLight.intensity, 0.6, dt * 2);
            } else {
                // Night Time
                this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, 0, dt * 2);
                this.ambientLight.intensity = THREE.MathUtils.lerp(this.ambientLight.intensity, 0.1, dt * 2);
            }
        }

        // 2. Weather Visuals (Rain / Snow Particle updating)
        if (this.particleSystem) {
            const isPrecipitation = state.weatherCategory === "rain" || state.weatherCategory === "snow";
            this.particleSystem.visible = isPrecipitation && state.weatherGrade > 0;

            if (this.particleSystem.visible) {
                const positions = this.particleSystem.geometry.attributes.position.array as Float32Array;
                const fallSpeed = state.weatherCategory === "rain" ? 15 : 5;

                for (let i = 1; i < positions.length; i += 3) { // Y values
                    positions[i] -= fallSpeed * dt;
                    if (positions[i] < 0) positions[i] = 40; // loop back to "sky"
                }
                this.particleSystem.geometry.attributes.position.needsUpdate = true;

                // Render Rain around the active camera (Player Entity)
                const playerEntities = world.queryEntities("CameraComponent");
                if (playerEntities.length > 0) {
                    const pTrans = world.getComponent<TransformComponent>(playerEntities[0], "TransformComponent");
                    if (pTrans) {
                        // Center the rainstorm right above the player
                        this.particleSystem.position.set(pTrans.position[0] - 25, pTrans.position[1], pTrans.position[2] - 25);
                    }
                }
            }
        }
    }

    private initWeatherParticles(scene: THREE.Scene): void {
        const particleCount = 2000;
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            vertices[i * 3 + 0] = Math.random() * 50; // x spread
            vertices[i * 3 + 1] = Math.random() * 40; // y spread height
            vertices[i * 3 + 2] = Math.random() * 50; // z spread
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        // Simple white particle material
        const material = new THREE.PointsMaterial({
            color: 0x88CCFF,
            size: 0.2,
            transparent: true,
            opacity: 0.6,
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.particleSystem.visible = false;
        scene.add(this.particleSystem);
    }
}
