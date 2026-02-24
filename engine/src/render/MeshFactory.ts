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

        let object: THREE.Object3D;
        switch (type) {
            case 'grid':
                // For grid, params.size[0] is size, params.size[1] is divisions
                object = new THREE.GridHelper(params.size[0], params.size[1], material?.color ?? 0x444444, material?.color ?? 0x888888);
                break;
            case 'wirebox':
                const boxGeoWire = new THREE.BoxGeometry(w, h, d);
                const edges = new THREE.EdgesGeometry(boxGeoWire);
                const lineMaterial = new THREE.LineBasicMaterial({
                    color: material?.color ?? 0xffffff,
                    transparent: (material?.opacity !== undefined && material.opacity < 1),
                    opacity: material?.opacity ?? 1
                });
                object = new THREE.LineSegments(edges, lineMaterial);
                break;
            case 'sphere':
                const sphereGeo = new THREE.SphereGeometry(w / 2, 32, 32);
                object = new THREE.Mesh(sphereGeo, this.createMaterial(material));
                break;
            case 'plane':
                const planeGeo = new THREE.PlaneGeometry(w, h);
                object = new THREE.Mesh(planeGeo, this.createMaterial(material));
                break;
            case 'cylinder':
            case 'cone':
                const cylGeo = new THREE.CylinderGeometry(w, h, d, 32);
                object = new THREE.Mesh(cylGeo, this.createMaterial(material));
                break;
            case 'box':
            default:
                const boxGeoBase = new THREE.BoxGeometry(w, h, d);
                object = new THREE.Mesh(boxGeoBase, this.createMaterial(material));
                break;
        }

        // Apply Transform
        object.position.set(params.position[0], params.position[1], params.position[2]);
        object.rotation.set(params.rotation[0], params.rotation[1], params.rotation[2]);

        return object;
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
