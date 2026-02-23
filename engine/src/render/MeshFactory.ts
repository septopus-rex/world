import * as THREE from 'three';
import { RenderObject, MaterialConfig } from '../core/types/Adjunct';

/**
 * MeshFactory is the central unit for transforming protocol-agnostic RenderObjects
 * into Three.js Scene Graph objects.
 */
export class MeshFactory {
    /**
     * Creates a Three.js Object3D from a RenderObject definition.
     */
    public static create(data: RenderObject): THREE.Object3D {
        const { type, params, material } = data;
        const [w, h, d] = params.size;

        let geometry: THREE.BufferGeometry;
        switch (type) {
            case 'sphere':
                geometry = new THREE.SphereGeometry(w / 2, 32, 32);
                break;
            case 'plane':
                geometry = new THREE.PlaneGeometry(w, h);
                break;
            case 'cylinder':
            case 'cone':
                // For cylinder/cone, we interpret size as [radiusTop, radiusBottom, height]
                // Note: THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
                geometry = new THREE.CylinderGeometry(w, h, d, 32);
                break;
            case 'box':
            default:
                geometry = new THREE.BoxGeometry(w, h, d);
                break;
        }

        const meshMaterial = this.createMaterial(material);
        const mesh = new THREE.Mesh(geometry, meshMaterial);

        // Apply Transform
        mesh.position.set(params.position[0], params.position[1], params.position[2]);
        mesh.rotation.set(params.rotation[0], params.rotation[1], params.rotation[2]);

        return mesh;
    }

    /**
     * Creates a Three.js Material from a MaterialConfig.
     */
    private static createMaterial(config?: MaterialConfig): THREE.Material {
        const mat = new THREE.MeshStandardMaterial({
            color: config?.color ?? 0xcccccc,
            transparent: (config?.opacity !== undefined && config.opacity < 1),
            opacity: config?.opacity ?? 1,
            side: THREE.DoubleSide // Important for planes
        });

        // In a real implementation, texture loading from config.resource would happen here
        return mat;
    }
}
