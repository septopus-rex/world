import * as THREE from 'three';
import { RenderObject, MaterialConfig } from '../core/types/Adjunct';

/**
 * MeshFactory is the central unit for transforming protocol-agnostic RenderObjects
 * into Three.js Scene Graph objects.
 *
 * OPTIMIZATION: Geometry and material instances are cached and reused.
 */
export class MeshFactory {
    // Geometry cache keyed by "type:w,h,d"
    private static _geoCache = new Map<string, THREE.BufferGeometry>();
    // Material cache keyed by "color,opacity"
    private static _matCache = new Map<string, THREE.MeshStandardMaterial>();

    /**
     * Creates a Three.js Object3D from a RenderObject definition.
     */
    public static create(data: RenderObject): THREE.Object3D {
        const { type, params, material } = data;
        const [w, h, d] = params.size;

        let object: THREE.Object3D;
        switch (type) {
            case 'grid':
                // Grid helpers are unique, no caching
                object = new THREE.GridHelper(params.size[0], params.size[1], material?.color ?? 0x444444, material?.color ?? 0x888888);
                break;
            case 'wirebox': {
                // Wireboxes use EdgesGeometry which wraps a BoxGeometry — cache the base
                const boxGeoWire = this.getGeometry('box', w, h, d);
                const edges = new THREE.EdgesGeometry(boxGeoWire);
                const lineMaterial = new THREE.LineBasicMaterial({
                    color: material?.color ?? 0xffffff,
                    transparent: (material?.opacity !== undefined && material.opacity < 1),
                    opacity: material?.opacity ?? 1
                });
                object = new THREE.LineSegments(edges, lineMaterial);
                break;
            }
            case 'sphere':
                object = new THREE.Mesh(
                    this.getGeometry('sphere', w, h, d),
                    this.getMaterial(material)
                );
                break;
            case 'plane':
                object = new THREE.Mesh(
                    this.getGeometry('plane', w, h, d),
                    this.getMaterial(material)
                );
                break;
            case 'cylinder':
            case 'cone':
                object = new THREE.Mesh(
                    this.getGeometry('cylinder', w, h, d),
                    this.getMaterial(material)
                );
                break;
            case 'light':
                object = this.createLight(data as any);
                break;
            case 'box':
            default:
                object = new THREE.Mesh(
                    this.getGeometry('box', w, h, d),
                    this.getMaterial(material)
                );
                break;
        }

        // Apply Transform
        object.position.set(params.position[0], params.position[1], params.position[2]);
        object.rotation.set(params.rotation[0], params.rotation[1], params.rotation[2]);

        return object;
    }

    /**
     * Get or create a cached geometry instance.
     */
    private static getGeometry(type: string, w: number, h: number, d: number): THREE.BufferGeometry {
        const key = `${type}:${w},${h},${d}`;
        let geo = this._geoCache.get(key);
        if (!geo) {
            switch (type) {
                case 'sphere':
                    geo = new THREE.SphereGeometry(w / 2, 32, 32);
                    break;
                case 'plane':
                    geo = new THREE.PlaneGeometry(w, h);
                    break;
                case 'cylinder':
                    geo = new THREE.CylinderGeometry(w, h, d, 32);
                    break;
                case 'box':
                default:
                    geo = new THREE.BoxGeometry(w, h, d);
                    break;
            }
            this._geoCache.set(key, geo);
        }
        return geo;
    }

    /**
     * Get or create a cached material instance.
     */
    private static getMaterial(config?: MaterialConfig): THREE.MeshStandardMaterial {
        const color = config?.color ?? 0xcccccc;
        const opacity = config?.opacity ?? 1;
        const key = `${color},${opacity}`;
        let mat = this._matCache.get(key);
        if (!mat) {
            mat = new THREE.MeshStandardMaterial({
                color,
                transparent: opacity < 1,
                opacity,
                side: THREE.DoubleSide
            });
            this._matCache.set(key, mat);
        }
        return mat;
    }

    /**
     * Creates a Three.js Light group from a RenderObject with light-specific fields.
     * Expects data.lightType (0=point, 1=spot, 2=directional),
     * data.intensity, data.distance, data.angle, data.shadow.
     */
    private static createLight(data: any): THREE.Object3D {
        const color = data.material?.color ?? 0xffffff;
        const intensity = data.intensity ?? 1;
        const distance = data.distance ?? 0;
        const shadow = data.shadow ?? 0;

        const group = new THREE.Group();
        let light: THREE.Light;

        switch (data.lightType) {
            case 1: { // spot
                const spot = new THREE.SpotLight(color, intensity);
                spot.distance = distance;
                spot.angle = data.angle ?? Math.PI / 3;
                spot.penumbra = 0.3;
                if (shadow) {
                    spot.castShadow = true;
                    spot.shadow.mapSize.width = 1024;
                    spot.shadow.mapSize.height = 1024;
                    spot.shadow.camera.near = 0.1;
                    spot.shadow.camera.far = distance || 100;
                }
                group.add(spot.target);
                spot.target.position.set(0, -1, 0);
                light = spot;
                break;
            }
            case 2: { // directional
                const dir = new THREE.DirectionalLight(color, intensity);
                if (shadow) {
                    dir.castShadow = true;
                    dir.shadow.mapSize.width = 1024;
                    dir.shadow.mapSize.height = 1024;
                }
                group.add(dir.target);
                dir.target.position.set(0, -1, 0);
                light = dir;
                break;
            }
            case 0: // point
            default: {
                const point = new THREE.PointLight(color, intensity, distance);
                if (shadow) {
                    point.castShadow = true;
                    point.shadow.mapSize.width = 1024;
                    point.shadow.mapSize.height = 1024;
                    point.shadow.camera.near = 0.1;
                    point.shadow.camera.far = distance || 100;
                }
                light = point;
                break;
            }
        }

        group.add(light);

        // Small visible helper sphere for edit-mode positioning
        const helper = new THREE.Mesh(
            this.getGeometry('sphere', 0.3, 0.3, 0.3),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
        );
        helper.raycast = () => {};
        group.add(helper);

        return group;
    }

    /**
     * Clear all caches (call on dispose).
     */
    public static clearCache(): void {
        for (const geo of this._geoCache.values()) geo.dispose();
        for (const mat of this._matCache.values()) mat.dispose();
        this._geoCache.clear();
        this._matCache.clear();
    }
}
