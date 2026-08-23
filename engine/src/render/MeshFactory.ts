import * as THREE from 'three';
import { RenderObject, MaterialConfig } from '../core/types/Adjunct';
import { applyBoxWorldUV } from './TextureScale';
import { applySurfaceDetail } from './SurfaceDetail';

/**
 * MeshFactory is the central unit for transforming protocol-agnostic RenderObjects
 * into Three.js Scene Graph objects.
 *
 * OPTIMIZATION: Geometry and material instances are cached and reused.
 */
export class MeshFactory {
    // REF-COUNTED caches (hardening ①): shared entries used to live forever —
    // at content scale every unique size/colour is a cache entry, so the old
    // "freed only on full teardown" policy grew without bound. Each create()
    // acquires (+1); RenderEngine.disposeMeshResources releases (−1) via
    // MeshFactory.release(); the entry is disposed + evicted at zero. Mirrors
    // ResourceManager's model/texture refcounting.
    // Geometry cache keyed by "type:w,h,d"
    private static _geoCache = new Map<string, { res: THREE.BufferGeometry; refs: number }>();
    // Material cache keyed by "color,opacity"
    private static _matCache = new Map<string, { res: THREE.MeshStandardMaterial; refs: number }>();

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
                // EdgesGeometry COPIES what it needs from the base box, so build a
                // throwaway base and dispose it immediately — going through the
                // ref-counted cache here would acquire a reference nothing ever
                // releases (the mesh only holds the edges, not the base).
                const boxGeoWire = new THREE.BoxGeometry(w, h, d);
                const edges = new THREE.EdgesGeometry(boxGeoWire);
                boxGeoWire.dispose();
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
                    this.getMaterial(material, [w, h, d])
                );
                break;
            case 'plane':
                object = new THREE.Mesh(
                    this.getGeometry('plane', w, h, d),
                    this.getMaterial(material, [w, h, d])
                );
                break;
            case 'sign':
                // Unlit textured plane (a8): lies FLAT at rotation 0 (normal up,
                // texture V+ = north — see adjunct_sign.ts orientation contract).
                object = new THREE.Mesh(
                    this.getGeometry('sign', w, h, d),
                    this.getMaterial(material, [w, h, d])
                );
                break;
            case 'cylinder':
            case 'cone':
                object = new THREE.Mesh(
                    this.getGeometry('cylinder', w, h, d),
                    this.getMaterial(material, [w, h, d])
                );
                break;
            case 'wedge':
                // Slope/ramp collider visual (b4 stop shape 3). Geometry rises toward
                // local −Z (north at yaw 0) — MUST stay in lockstep with
                // MovementCollider.topYAt, which is the collision side of this plane.
                object = new THREE.Mesh(
                    this.getGeometry('wedge', w, h, d),
                    this.getMaterial(material, [w, h, d])
                );
                break;
            case 'tube':
                // Catmull-Rom sweep through params.path — rails / pipes / coaster
                // track. Path-dependent, so NOT cached (and NOT tagged shared, so
                // removeHandle disposes it). size[0]=radius, size[1]=radial segs.
                object = new THREE.Mesh(
                    this.buildTube(params.path, w, params.size[1], params.closed),
                    this.getMaterial(material, [w, h, d])
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
                    this.getMaterial(material, [w, h, d])
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
            object.castShadow = !transparent && !data.invisible && data.type !== 'sign';
            object.receiveShadow = data.type !== 'sign'; // unlit — light/shadow irrelevant
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
        let entry = this._geoCache.get(key);
        if (!entry) {
            let geo: THREE.BufferGeometry;
            switch (type) {
                case 'sphere':
                    geo = new THREE.SphereGeometry(w / 2, 32, 32);
                    break;
                case 'plane':
                    geo = new THREE.PlaneGeometry(w, h);
                    break;
                case 'sign':
                    // Engine dims are [w=E, h=Alt, d=N]; the sign plane spans E×N.
                    // rotateX(-90°) lays it flat facing up, mapping the plane's
                    // local +y (texture V+) onto world −z = NORTH: an arrow drawn
                    // upright in the image points travel-north in the world.
                    geo = new THREE.PlaneGeometry(w, d);
                    geo.rotateX(-Math.PI / 2);
                    break;
                case 'cylinder':
                    geo = new THREE.CylinderGeometry(w, h, d, 32);
                    break;
                case 'wedge':
                    geo = buildWedgeGeometry(w, h, d);
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
            // Tag as shared: reused by reference across every block/adjunct of the
            // same size, so eviction must go through release() (refcount), never a
            // direct dispose (that would corrupt all other live users).
            geo.userData.shared = true;
            geo.userData.cacheKind = 'geo';
            geo.userData.cacheKey = key;
            entry = { res: geo, refs: 0 };
            this._geoCache.set(key, entry);
        }
        entry.refs++;
        return entry.res;
    }

    /**
     * Release one reference to a cached (shared) geometry/material — the
     * counterpart of the acquire inside create(). Disposes + evicts the entry
     * when the last user releases. Safe to call with anything: non-cached
     * resources (no cacheKey) and stale tags (cache cleared/rebuilt) are no-ops.
     */
    public static release(res: any): void {
        const key = res?.userData?.cacheKey;
        if (!key) return;
        const map: Map<string, { res: any; refs: number }> =
            res.userData.cacheKind === 'geo' ? this._geoCache : this._matCache;
        const entry = map.get(key);
        if (!entry || entry.res !== res) return; // stale tag — not the live entry
        if (--entry.refs <= 0) {
            map.delete(key);
            entry.res.dispose();
        }
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
     * Should this surface get macro variation at all? Gate: its LARGEST face is
     * at least ~12 m² (roughly 3.5 m square). Big surfaces — ground slabs, long
     * walls, plazas — are the ones that read as one flat colour and need it.
     *
     * Small props must be EXCLUDED, and not just to save a program variant: the
     * noise is keyed to world position, so a 1 m crate sits entirely inside one
     * lobe and gets tinted UNIFORMLY — a scene of randomly light-and-dark boxes,
     * which is worse than the problem being fixed. Measured, not assumed: at
     * strength 0.5 the diagnostic screenshot showed exactly that.
     */
    private static wantsMacro(w: number, h: number, d: number): boolean {
        const [, mid, max] = [w, h, d].sort((a, b) => a - b);
        return mid * max >= 12;
    }

    /**
     * Should this surface get the de-tiling pass (SurfaceDetail)? "Big and flat"
     * = a floor/platform/plaza: its texture has no inherent direction, so mixing
     * in a rotated second phase is free realism. A wall of the same length fails
     * the test (its thin axis is the min span), which is deliberate — rotating a
     * brick texture reads as broken, and a wall's regular repetition is CORRECT.
     * Dims are Three [w(x), h(y=up), d(z)] in metres.
     */
    private static wantsDetile(w: number, h: number, d: number): boolean {
        const span = Math.min(w, d);
        return span >= 8 && h <= span * 0.25;
    }

    /**
     * Get or create a cached material instance. `dims` (Three [w,h,d] metres) is
     * used only to decide the de-tiling pass for textured surfaces.
     */
    private static getMaterial(config?: MaterialConfig, dims?: [number, number, number]): THREE.MeshStandardMaterial | THREE.MeshBasicMaterial {
        const color = config?.color ?? 0xcccccc;
        const opacity = config?.opacity ?? 1;
        // PBR response. Three's own defaults are roughness=1 / metalness=0 — a
        // perfectly matte Lambert-alike with NO specular response at all, which is
        // why untextured scenes read as polystyrene: every surface returns the same
        // flat diffuse regardless of view angle. 0.85 keeps a faint sheen that
        // catches the sun and the sky IBL (SkyEnvironment) at grazing angles.
        // Per-surface overrides come from the palette (core/utils/Palette).
        const roughness = config?.roughness ?? 0.85;
        const metalness = config?.metalness ?? 0;

        // Unlit (a8 sign / decals): MeshBasicMaterial — reads identically from any
        // angle at any time of day. Same lifecycle split as the lit path below:
        // textured = fresh per-surface material, colour-only = cached + shared.
        if (config?.unlit) {
            if (config?.texture) {
                return new THREE.MeshBasicMaterial({
                    color, transparent: opacity < 1, opacity, side: THREE.DoubleSide,
                });
            }
            const ukey = `unlit:${color},${opacity}`;
            let uentry = this._matCache.get(ukey) as { res: any; refs: number } | undefined;
            if (!uentry) {
                const mat = new THREE.MeshBasicMaterial({
                    color, transparent: opacity < 1, opacity, side: THREE.DoubleSide,
                });
                mat.userData.shared = true;
                mat.userData.cacheKind = 'mat';
                mat.userData.cacheKey = ukey;
                uentry = { res: mat, refs: 0 };
                this._matCache.set(ukey, uentry as any);
            }
            uentry.refs++;
            return uentry.res;
        }

        // Textured / PBR surfaces get a FRESH, un-cached, un-shared material. AdjunctFactory
        // assigns its maps async per surface; textures are shared + ref-counted
        // by ResourceManager and survive material.dispose(). A fresh material is
        // disposed cleanly on eviction — unlike a process-wide cached material, which
        // would dangle (pointing at a freed texture) after its texture is released.
        const hasMaps = !!(config?.texture || config?.normalMap || config?.roughnessMap ||
            config?.metalnessMap || config?.aoMap || config?.emissiveMap || config?.ormMap);
        if (hasMaps) {
            const emissive = config?.emissive !== undefined ? new THREE.Color(config.emissive) : undefined;
            const mat = new THREE.MeshStandardMaterial({
                color, transparent: opacity < 1, opacity, side: THREE.DoubleSide,
                roughness, metalness,
                ...(emissive ? { emissive } : {}),
                // Cast shadows from BACK faces only. With side=DoubleSide, Three would
                // otherwise default shadowSide=DoubleSide → a surface's own FRONT face
                // lands in the shadow map and self-shadows it, producing grazing-angle
                // moiré "waves" on flat ground/walls. Back-face-only depth is the
                // textbook cure (geometry here is solid/closed), so the bias can stay
                // small without peter-panning.
                shadowSide: THREE.BackSide,
            });
            // Surface detail (SurfaceDetail.ts): macro variation on big textured
            // surfaces, plus de-tiling on the big FLAT ones (a strict subset).
            // Safe on the un-cached textured path — a per-surface onBeforeCompile
            // on a SHARED material would leak its program variant to every other
            // user of that colour.
            if (dims && this.wantsMacro(dims[0], dims[1], dims[2])) {
                applySurfaceDetail(mat, { detile: this.wantsDetile(dims[0], dims[1], dims[2]) });
            }
            return mat;
        }

        // Colour-only materials are cached + shared by reference; tagged shared so
        // eviction goes through release() (refcount) — disposed + evicted when the
        // last user releases, never while another block still renders with it.
        const key = `${color},${opacity},${roughness},${metalness}`;
        let entry = this._matCache.get(key);
        if (!entry) {
            const mat = new THREE.MeshStandardMaterial({
                color,
                transparent: opacity < 1,
                opacity,
                side: THREE.DoubleSide,
                roughness,
                metalness,
                // Back-face-only shadow casting — see the textured branch above: kills
                // the flat-surface self-shadow moiré that side=DoubleSide otherwise
                // bakes into the shadow map.
                shadowSide: THREE.BackSide,
            });
            mat.userData.shared = true;
            mat.userData.cacheKind = 'mat';
            mat.userData.cacheKey = key;
            entry = { res: mat, refs: 0 };
            this._matCache.set(key, entry);
        }
        entry.refs++;
        return entry.res;
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
     * Clear all caches (full teardown — RenderEngine.dispose). Disposes every
     * cached resource regardless of refcount; stale userData tags on already-
     * handed-out resources become no-ops in release() (entry mismatch).
     */
    public static clearCache(): void {
        for (const e of this._geoCache.values()) e.res.dispose();
        for (const e of this._matCache.values()) e.res.dispose();
        this._geoCache.clear();
        this._matCache.clear();
    }

    /** Diagnostics: live cache entry counts (for stress tests / stats overlays). */
    public static cacheStats(): { geometries: number; materials: number } {
        return { geometries: this._geoCache.size, materials: this._matCache.size };
    }
}

/**
 * Wedge (right triangular prism) — the slope-stop ramp. Pivot at the bounding-
 * box centre; the top face is the inclined plane from the FULL height at the
 * local-north edge (z = −d/2) down to the floor at the local-south edge
 * (z = +d/2); the back (north) face is vertical. The collision twin of this
 * plane is MovementCollider.topYAt — change one, change both.
 * Non-indexed so computeVertexNormals yields flat per-face shading.
 */
function buildWedgeGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    // 6 corners: bottom rectangle A-D, top edge E,F above the north edge.
    const A = [-hx, -hy, -hz], B = [hx, -hy, -hz], C = [hx, -hy, hz], D = [-hx, -hy, hz];
    const E = [-hx, hy, -hz], F = [hx, hy, -hz];
    const tris = [
        A, C, D, A, B, C, // bottom (−Y)
        A, E, F, A, F, B, // back, vertical north face (−Z)
        E, D, C, E, C, F, // inclined top (+Y/+Z-ish)
        A, D, E,          // west side (−X)
        B, F, C,          // east side (+X)
    ];
    const pos = new Float32Array(tris.length * 3);
    tris.forEach((v, i) => pos.set(v, i * 3));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Cheap planar UVs (top-down) — stops are untextured, this just keeps any
    // future textured material from hitting a missing-attribute path.
    const uv = new Float32Array(tris.length * 2);
    tris.forEach((v, i) => { uv[i * 2] = (v[0] + hx) / w; uv[i * 2 + 1] = (v[2] + hz) / d; });
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
}
