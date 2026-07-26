import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applySurfaceDetail, setSurfaceDetailOrigin, MACRO_DEFAULT } from '../../src/render/SurfaceDetail';
import { MeshFactory } from '../../src/render/MeshFactory';
import { isolateMaterial } from '../../src/render/MaterialUtils';

// SurfaceDetail injects into the STOCK MeshStandardMaterial shader via
// onBeforeCompile. There is no GPU here, so what these tests pin is the part
// that silently rots: the CHUNK ANCHORS. Running the hook over three's real
// ShaderLib.standard source means a three upgrade that renames or drops
// `<map_fragment>` / `<project_vertex>` turns this file red instead of shipping
// a scene where the injection quietly did nothing.

/** Run a material's onBeforeCompile over three's real standard shader source. */
function compile(mat: THREE.Material) {
    const shader = {
        uniforms: {} as Record<string, { value: unknown }>,
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    (mat.onBeforeCompile as any)(shader, {} as any);
    return shader;
}

/**
 * Was SurfaceDetail applied? three's Material BASE CLASS already defines
 * onBeforeCompile (empty fn) and customProgramCacheKey (returns ''), so
 * "untouched" is never `undefined` — the injected cache key prefix is the only
 * honest signal.
 */
function injected(mat: THREE.Material): boolean {
    return mat.customProgramCacheKey!().startsWith('sd:');
}

function texturedMaterial(size: [number, number, number]): THREE.MeshStandardMaterial {
    const mesh = MeshFactory.create({
        type: 'box',
        params: { size, position: [0, 0, 0], rotation: [0, 0, 0] },
        material: { color: 0xeeeeee, texture: '1' },
    } as any) as THREE.Mesh;
    return mesh.material as THREE.MeshStandardMaterial;
}

describe('SurfaceDetail — shader injection', () => {
    it('hooks onBeforeCompile and a distinct program cache key', () => {
        const mat = new THREE.MeshStandardMaterial();
        applySurfaceDetail(mat);
        expect(injected(mat)).toBe(true);
        // Two materials with different options must NOT share a compiled program.
        const other = new THREE.MeshStandardMaterial();
        applySurfaceDetail(other, { detile: true });
        expect(mat.customProgramCacheKey!()).not.toBe(other.customProgramCacheKey!());
    });

    it('replaces the real map_fragment anchor and adds the macro pass', () => {
        // The anchors must exist in the stock source to begin with.
        expect(THREE.ShaderLib.standard.fragmentShader).toContain('#include <map_fragment>');
        expect(THREE.ShaderLib.standard.vertexShader).toContain('#include <project_vertex>');

        const mat = new THREE.MeshStandardMaterial();
        applySurfaceDetail(mat);
        const shader = compile(mat);

        expect(shader.fragmentShader).not.toContain('#include <map_fragment>'); // consumed
        expect(shader.fragmentShader).toContain('sdFbm');
        expect(shader.fragmentShader).toContain('diffuseColor *= sampledDiffuseColor;');
        // three's inline video sRGB decode must survive the rewrite — e3 video
        // screens go through the same map path.
        expect(shader.fragmentShader).toContain('DECODE_VIDEO_TEXTURE');
        // Vertex side carries render-space position to the fragment stage.
        expect(shader.vertexShader).toContain('varying vec3 vSdPos;');
        expect(shader.vertexShader).toContain('vSdPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    });

    it('de-tiling is opt-in and gated by a define', () => {
        const plain = new THREE.MeshStandardMaterial();
        applySurfaceDetail(plain);
        expect(plain.defines?.SD_DETILE).toBeUndefined();

        const detiled = new THREE.MeshStandardMaterial();
        applySurfaceDetail(detiled, { detile: true });
        expect(detiled.defines?.SD_DETILE).toBeDefined();
        // Both compile the same source; the define picks the branch.
        expect(compile(detiled).fragmentShader).toContain('#ifdef SD_DETILE');
    });

    it('shares ONE origin uniform across every material (floating-origin rebase)', () => {
        const a = new THREE.MeshStandardMaterial();
        const b = new THREE.MeshStandardMaterial();
        applySurfaceDetail(a);
        applySurfaceDetail(b, { detile: true });
        const sa = compile(a), sb = compile(b);
        // Same object identity — one write in RenderEngine reaches all shaders.
        expect(sa.uniforms.sdOrigin).toBe(sb.uniforms.sdOrigin);

        setSurfaceDetailOrigin(new THREE.Vector3(1024, 0, -2048));
        expect(sa.uniforms.sdOrigin.value).toMatchObject({ x: 1024, y: 0, z: -2048 });
        setSurfaceDetailOrigin(new THREE.Vector3(0, 0, 0)); // restore for other tests
    });

    it('per-material macro strength rides its own uniform', () => {
        const mat = new THREE.MeshStandardMaterial();
        applySurfaceDetail(mat, { macro: 0.4 });
        expect(compile(mat).uniforms.sdMacro.value).toBe(0.4);

        const def = new THREE.MeshStandardMaterial();
        applySurfaceDetail(def);
        expect(compile(def).uniforms.sdMacro.value).toBe(MACRO_DEFAULT);
    });

    it('is idempotent, and a no-op when both passes are off', () => {
        const mat = new THREE.MeshStandardMaterial();
        applySurfaceDetail(mat);
        const first = mat.onBeforeCompile;
        applySurfaceDetail(mat);
        expect(mat.onBeforeCompile).toBe(first); // not re-hooked

        const bare = new THREE.MeshStandardMaterial();
        applySurfaceDetail(bare, { macro: 0, detile: false });
        expect(injected(bare)).toBe(false); // never touched
    });
});

describe('SurfaceDetail — MeshFactory wiring', () => {
    it('applies to big textured surfaces, de-tiling only the big FLAT ones', () => {
        // 16×16 m ground slab (Septopus [16,16,0.2] → Three [16, 0.2, 16]).
        const ground = texturedMaterial([16, 0.2, 16]);
        expect(injected(ground)).toBe(true);
        expect(ground.defines?.SD_DETILE).toBeDefined();

        // A 16 m long wall: big enough to look flat-coloured, so it takes macro
        // variation — but its min horizontal span is the thickness, and rotating
        // a brick texture would read as broken, so NO de-tiling.
        const wall = texturedMaterial([16, 3, 0.2]);
        expect(injected(wall)).toBe(true);
        expect(wall.defines?.SD_DETILE).toBeUndefined();

        // A crate gets neither. World-keyed noise would tint a prop this small
        // UNIFORMLY — randomly light-and-dark boxes, worse than the problem.
        const crate = texturedMaterial([1, 1, 1]);
        expect(injected(crate)).toBe(false);
        expect(crate.defines?.SD_DETILE).toBeUndefined();
    });

    it('leaves the SHARED colour-only material cache uninjected', () => {
        // A per-surface onBeforeCompile on a cached material would leak its
        // program variant to every other surface using that colour.
        const mesh = MeshFactory.create({
            type: 'box',
            params: { size: [16, 0.2, 16], position: [0, 0, 0], rotation: [0, 0, 0] },
            material: { color: 0x4a7c3f },
        } as any) as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        expect(mat.userData.shared).toBe(true);
        expect(injected(mat)).toBe(false);
    });

    it('survives a runtime recolour (isolateMaterial clone-on-write)', () => {
        const mesh = MeshFactory.create({
            type: 'box',
            params: { size: [16, 0.2, 16], position: [0, 0, 0], rotation: [0, 0, 0] },
            material: { color: 0xeeeeee, texture: '1' },
        } as any) as THREE.Mesh;
        const key = (mesh.material as THREE.MeshStandardMaterial).customProgramCacheKey!();
        const cloned = isolateMaterial(mesh);
        expect(cloned.customProgramCacheKey!()).toBe(key);
        expect(compile(cloned).fragmentShader).toContain('sdFbm');
    });
});
