import * as THREE from 'three';
import { RenderObject, MaterialConfig } from '../core/types/Adjunct';
import { applyBoxWorldUV } from './TextureScale';

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
            case 'tube':
                // Catmull-Rom sweep through params.path — rails / pipes / coaster
                // track. Path-dependent, so NOT cached (and NOT tagged shared, so
                // removeHandle disposes it). size[0]=radius, size[1]=radial segs.
                object = new THREE.Mesh(
                    this.buildTube(params.path, w, params.size[1], params.closed),
                    this.getMaterial(material)
                );
                break;
            case 'light':
                object = this.createLight(data as any);
                break;
            case 'box':
            default:
                object = new THREE.Mesh(
                    // `material.fit` → map the texture 0..1 onto each face (a fitted
                    // label/decal: signs, mahjong tile faces) instead of size-derived
                    // tiling (which is for walls/floors and would crop a small face).
                    this.getGeometry('box', w, h, d, !!material?.fit),
                    this.getMaterial(material)
                );
                break;
        }

        // Apply Transform
        object.position.set(params.position[0], params.position[1], params.position[2]);
        object.rotation.set(params.rotation[0], params.rotation[1], params.rotation[2]);

        // Shadows: solid meshes cast + receive. Transparent surfaces (water,
        // ghosted stops) only receive — a translucent box throwing a hard
        // shadow reads as a bug.
        if ((object as THREE.Mesh).isMesh) {
            const transparent = material?.opacity !== undefined && material.opacity < 1;
            object.castShadow = !transparent && !data.invisible;
            object.receiveShadow = true;
        }

        // Invisible-but-raycastable (touch trigger volumes): Three's Raycaster
        // ignores visibility, so visible=false costs nothing to render yet still
        // intersects on the raycast layer.
        if (data.invisible) object.visible = false;

        return object;
    }

    /**
     * Get or create a cached geometry instance.
     */
    private static getGeometry(type: string, w: number, h: number, d: number, fitUV: boolean = false): THREE.BufferGeometry {
        // fitUV boxes keep BoxGeometry's natural 0..1 UVs (full image per face), so
        // they need a distinct cache entry from the size-tiled box of the same dims.
        const key = `${type}:${w},${h},${d}${fitUV ? ':fit' : ''}`;
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
                    // Size-derived UV tiling: constant texel density regardless of
                    // face size (kills the old low-texel-density "mosaic"). Pure
                    // function of (w,h,d) → safe with the size-keyed geo cache, and
                    // harmless for colour-only materials (they ignore UVs). A fitted
                    // label opts out → the whole image maps 0..1 onto each face.
                    if (!fitUV) applyBoxWorldUV(geo, [w, h, d]);
                    break;
            }
            // Tag as shared: this geometry instance is reused by reference across
            // every block/adjunct of the same size, so RenderEngine.removeHandle
            // must NOT dispose it on eviction (that corrupts all other live blocks).
            // It is freed only by MeshFactory.clearCache() on full teardown.
            geo.userData.shared = true;
            this._geoCache.set(key, geo);
        }
        return geo;
    }

    /**
     * Build a tube geometry by sweeping a Catmull-Rom curve through `path`
     * (object-local control points). Used for rails, pipes, and coaster track.
     * Path-dependent → built fresh per instance (not cached); a degenerate path
     * (<2 points) falls back to a tiny box so a malformed adjunct never throws.
     */
    private static buildTube(
        path: [number, number, number][] | undefined,
        radius: number,
        radialSegments: number,
        closed?: boolean,
    ): THREE.BufferGeometry {
        const r = radius > 0 ? radius : 0.2;
        if (!path || path.length < 2) {
            return new THREE.BoxGeometry(r, r, r);
        }
        const pts = path.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        const curve = new THREE.CatmullRomCurve3(pts, !!closed, 'catmullrom', 0.5);
        // Denser tubular sampling on longer paths keeps curves smooth; a closed
        // loop has one extra (wrap-around) span to sample. Clamp radial segs.
        const spans = closed ? path.length : path.length - 1;
        const tubularSegments = Math.max(8, spans * 12);
        const radial = Math.max(3, Math.floor(radialSegments) || 8);
        return new THREE.TubeGeometry(curve, tubularSegments, r, radial, !!closed);
    }

    /**
     * Get or create a cached material instance.
     */
    private static getMaterial(config?: MaterialConfig): THREE.MeshStandardMaterial {
        const color = config?.color ?? 0xcccccc;
        const opacity = config?.opacity ?? 1;

        // Textured surfaces get a FRESH, un-cached, un-shared material. AdjunctFactory
        // assigns its .map async per surface; the .map TEXTURE is shared + ref-counted
        // by ResourceManager and survives material.dispose(). A fresh material is
        // disposed cleanly on eviction — unlike a process-wide cached material, which
        // would dangle (pointing at a freed texture) after its texture is released.
        if (config?.texture) {
            return new THREE.MeshStandardMaterial({
                color, transparent: opacity < 1, opacity, side: THREE.DoubleSide,
                // Cast shadows from BACK faces only. With side=DoubleSide, Three would
                // otherwise default shadowSide=DoubleSide → a surface's own FRONT face
                // lands in the shadow map and self-shadows it, producing grazing-angle
                // moiré "waves" on flat ground/walls. Back-face-only depth is the
                // textbook cure (geometry here is solid/closed), so the bias can stay
                // small without peter-panning.
                shadowSide: THREE.BackSide,
            });
        }

        // Colour-only materials are cached + shared by reference; tag them shared so
        // removeHandle never disposes one still used by another block (freed only by
        // clearCache on teardown).
        const key = `${color},${opacity}`;
        let mat = this._matCache.get(key);
        if (!mat) {
            mat = new THREE.MeshStandardMaterial({
                color,
                transparent: opacity < 1,
                opacity,
                side: THREE.DoubleSide,
                // Back-face-only shadow casting — see the textured branch above: kills
                // the flat-surface self-shadow moiré that side=DoubleSide otherwise
                // bakes into the shadow map.
                shadowSide: THREE.BackSide,
            });
            mat.userData.shared = true;
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
