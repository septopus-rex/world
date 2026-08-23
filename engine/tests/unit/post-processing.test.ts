import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PostProcessingPass } from '../../src/render/PostProcessingPass';

describe('PostProcessingPass', () => {
    it('initializes gracefully and supports toggling enabled & bloom', () => {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

        // Mock WebGLRenderer in headless test environment
        const mockRenderer = {
            render: () => { },
            setSize: () => { },
            getPixelRatio: () => 1,
            capabilities: { isWebGL2: true },
            domElement: { width: 800, height: 600 }
        } as unknown as THREE.WebGLRenderer;

        const pass = new PostProcessingPass(mockRenderer, scene, camera, 800, 600, {
            enabled: true,
            bloom: {
                enabled: true,
                threshold: 0.8,
                strength: 0.4,
                radius: 0.3
            }
        });

        expect(pass).toBeDefined();

        // Control API tests
        pass.setEnabled(false);
        expect(pass.isEnabled).toBe(false);

        pass.setEnabled(true);
        pass.setBloomEnabled(false);
        pass.setBloomParams(0.9, 0.5, 0.2);
        pass.setSize(1024, 768);

        // Fallback execution should not throw
        expect(() => pass.render()).not.toThrow();

        // Cleanup
        expect(() => pass.dispose()).not.toThrow();
    });
});
