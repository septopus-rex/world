import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface PostProcessingConfig {
    enabled?: boolean;
    ao?: {
        enabled?: boolean;
        radius?: number;
        distanceExponent?: number;
        thickness?: number;
        scale?: number;
    };
    bloom?: {
        enabled?: boolean;
        threshold?: number;
        strength?: number;
        radius?: number;
    };
}

/**
 * PostProcessingPass encapsulates the post-processing pipeline:
 * - RenderPass (Base scene render)
 * - GTAOPass (Ground Truth Ambient Occlusion for natural contact shadows)
 * - UnrealBloomPass (Selective glow for emissive surfaces & lights)
 * - OutputPass (Tone mapping & sRGB color management)
 *
 * Includes graceful degradation for headless test environments or low-end devices.
 */
export class PostProcessingPass {
    private composer: EffectComposer | null = null;
    private renderPass: RenderPass | null = null;
    private gtaoPass: GTAOPass | null = null;
    private bloomPass: UnrealBloomPass | null = null;
    private outputPass: OutputPass | null = null;

    private _enabled: boolean = true;
    private _aoEnabled: boolean = true;
    private _bloomEnabled: boolean = true;
    private _isSupported: boolean = true;

    constructor(
        private readonly renderer: THREE.WebGLRenderer,
        private readonly scene: THREE.Scene,
        private readonly camera: THREE.Camera,
        width: number,
        height: number,
        config?: PostProcessingConfig
    ) {
        this._enabled = config?.enabled ?? true;
        this._aoEnabled = config?.ao?.enabled ?? true;
        this._bloomEnabled = config?.bloom?.enabled ?? true;

        try {
            const w = Math.max(1, width);
            const h = Math.max(1, height);

            // Create render target with HDR half-float precision for natural bloom luminance
            const renderTarget = new THREE.WebGLRenderTarget(w, h, {
                type: THREE.HalfFloatType,
                format: THREE.RGBAFormat,
                colorSpace: THREE.SRGBColorSpace,
            });

            this.composer = new EffectComposer(this.renderer, renderTarget);

            // 1. Base scene render pass
            this.renderPass = new RenderPass(this.scene, this.camera);
            this.composer.addPass(this.renderPass);

            // 2. Ambient Occlusion pass (GTAO) for realistic contact shadow depth
            if (this._aoEnabled && typeof GTAOPass === 'function') {
                try {
                    this.gtaoPass = new GTAOPass(this.scene, this.camera, w, h);
                    this.gtaoPass.output = GTAOPass.OUTPUT.Default;
                    this.gtaoPass.enabled = this._aoEnabled;
                    if (config?.ao?.radius !== undefined) (this.gtaoPass as any).radius = config.ao.radius;
                    if (config?.ao?.distanceExponent !== undefined) (this.gtaoPass as any).distanceExponent = config.ao.distanceExponent;
                    if (config?.ao?.thickness !== undefined) (this.gtaoPass as any).thickness = config.ao.thickness;
                    if (config?.ao?.scale !== undefined) (this.gtaoPass as any).scale = config.ao.scale;
                    if (this.gtaoPass.blendIntensity !== undefined) {
                        this.gtaoPass.blendIntensity = 1.0;
                    }
                    this.composer.addPass(this.gtaoPass);
                } catch {
                    this.gtaoPass = null;
                }
            }

            // 3. Selective bloom pass (high threshold so only emissive/intense highlights glow)
            const threshold = config?.bloom?.threshold ?? 0.85;
            const strength = config?.bloom?.strength ?? 0.45;
            const radius = config?.bloom?.radius ?? 0.5;
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(w, h),
                strength,
                radius,
                threshold
            );
            this.bloomPass.enabled = this._bloomEnabled;
            this.composer.addPass(this.bloomPass);

            // 4. Output pass for tone-mapping & correct sRGB conversion
            this.outputPass = new OutputPass();
            this.composer.addPass(this.outputPass);
        } catch {
            // Headless / mock environment fallback
            this._isSupported = false;
            this.composer = null;
        }
    }

    /**
     * Whether post-processing is currently active and supported.
     */
    public get isEnabled(): boolean {
        return this._enabled && this._isSupported && this.composer !== null;
    }

    public setEnabled(enabled: boolean): void {
        this._enabled = enabled;
    }

    public setAoEnabled(enabled: boolean): void {
        this._aoEnabled = enabled;
        if (this.gtaoPass) {
            this.gtaoPass.enabled = enabled;
        }
    }

    public setBloomEnabled(enabled: boolean): void {
        this._bloomEnabled = enabled;
        if (this.bloomPass) {
            this.bloomPass.enabled = enabled;
        }
    }

    public setBloomParams(threshold: number, strength: number, radius: number): void {
        if (this.bloomPass) {
            this.bloomPass.threshold = threshold;
            this.bloomPass.strength = strength;
            this.bloomPass.radius = radius;
        }
    }

    /**
     * Updates viewport size for all render targets and passes.
     */
    public setSize(width: number, height: number): void {
        if (!this.composer) return;
        try {
            const w = Math.max(1, width);
            const h = Math.max(1, height);
            this.composer.setSize(w, h);
            if (this.gtaoPass) {
                this.gtaoPass.setSize(w, h);
            }
            if (this.bloomPass) {
                this.bloomPass.resolution.set(w, h);
            }
        } catch {
            // Ignore resize errors in mock/stub environments
        }
    }

    /**
     * Executes the post-processing pipeline.
     */
    public render(): void {
        if (this.composer && this.isEnabled) {
            try {
                this.composer.render();
                return;
            } catch {
                // If composer render fails (e.g. mock WebGL in headless tests), fall through to plain render
                this._isSupported = false;
            }
        }
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Dispose all internal render targets and passes.
     */
    public dispose(): void {
        if (this.composer) {
            try {
                this.composer.renderTarget1?.dispose();
                this.composer.renderTarget2?.dispose();
                this.gtaoPass?.dispose();
                this.bloomPass?.dispose();
            } catch {
                // Ignore disposal errors on mock/stub targets
            }
            this.composer = null;
        }
        this.renderPass = null;
        this.gtaoPass = null;
        this.bloomPass = null;
        this.outputPass = null;
    }
}
