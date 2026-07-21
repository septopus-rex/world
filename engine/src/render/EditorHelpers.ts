import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';
import { MeshFactory } from './MeshFactory';

/**
 * Editor-only helper visuals (render/EditorHelpers) — the selection wirebox,
 * the block-boundary highlight (4 direction-coded edge slabs + 4 corner sky
 * rays) and the ground grid. Pure construction: everything raycast-inert,
 * built via MeshFactory, parented to worldRoot (or the given parent) so the
 * floating origin applies. Positioning/lifetime stays with EditHelperManager.
 */

/**
 * Compass-direction colour convention, shared visual language with the
 * client's MiniCompass (whose north-seeking needle is red): anything that
 * paints a cardinal direction uses these. Septopus north = engine −Z.
 */
export const DIRECTION_COLORS = {
    north: 0xef4444, // red    — matches the compass needle
    east: 0x3b82f6,  // blue
    south: 0xfacc15, // yellow
    west: 0x22c55e,  // green
} as const;

export class EditorHelpers {
    private readonly _tmpBox3 = new THREE.Box3();
    private readonly _tmpSize = new THREE.Vector3();

    constructor(private readonly worldRoot: THREE.Group) { }

    /** Wireframe box hugging the target's bounds (+5%), for edit selection. */
    public selectionHighlight(target: RenderHandle, color: number = 0x00ffff): RenderHandle {
        this._tmpBox3.setFromObject(target as THREE.Object3D);
        this._tmpBox3.getSize(this._tmpSize);
        const helper = MeshFactory.create({
            type: 'wirebox',
            params: {
                size: [this._tmpSize.x * 1.05, this._tmpSize.y * 1.05, this._tmpSize.z * 1.05],
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            material: { color: color, opacity: 1.0 }
        });
        helper.raycast = () => { }; // Ignore selection rays
        this.worldRoot.add(helper);
        return helper;
    }

    /** Block-boundary highlight: 4 direction-coded edge slabs (50 cm, colours =
     *  DIRECTION_COLORS so the boundary doubles as a compass) + 4 corner sky
     *  rays (stacked fading segments, edit-accent cyan) that mark the block
     *  from afar — the edit session stays locked while the creator walks into
     *  neighbouring blocks to inspect the build. */
    public blockHighlight(parent: RenderHandle, bw: number, bl: number, bh: number): RenderHandle {
        const group = new THREE.Group();
        group.name = 'edit-block-highlight';
        (parent as THREE.Object3D).add(group);
        const slabHeight = 0.5;
        const opacity = 0.3;

        // Position the group at the center of the block's floor volume
        group.position.set(bw / 2, 0, -bl / 2);

        // Septopus north = engine −Z (Coords contract, world.md §5).
        const planeConfigs = [
            { dir: 'north', pos: [0, slabHeight / 2, -bl / 2], rot: [0, 0, 0], color: DIRECTION_COLORS.north, size: bw },
            { dir: 'south', pos: [0, slabHeight / 2, bl / 2], rot: [0, Math.PI, 0], color: DIRECTION_COLORS.south, size: bw },
            { dir: 'east', pos: [bw / 2, slabHeight / 2, 0], rot: [0, -Math.PI / 2, 0], color: DIRECTION_COLORS.east, size: bl },
            { dir: 'west', pos: [-bw / 2, slabHeight / 2, 0], rot: [0, Math.PI / 2, 0], color: DIRECTION_COLORS.west, size: bl }
        ];

        planeConfigs.forEach(p => {
            const mesh = MeshFactory.create({
                type: 'plane',
                params: {
                    size: [p.size, slabHeight, 0],
                    position: p.pos as [number, number, number],
                    rotation: p.rot as [number, number, number]
                },
                material: { color: p.color, opacity: opacity }
            });
            mesh.name = `boundary-${p.dir}`;
            mesh.raycast = () => { };
            group.add(mesh);
        });

        // Corner sky rays: three stacked thin segments per corner with fading
        // opacity — a beacon that reads from neighbouring blocks. Materials are
        // cached by colour+opacity, so 12 meshes share 3 materials.
        const raySegments = [
            { y0: 0, opacity: 0.4 },
            { y0: bh, opacity: 0.2 },
            { y0: bh * 2, opacity: 0.08 },
        ];
        for (const cx of [-bw / 2, bw / 2]) {
            for (const cz of [-bl / 2, bl / 2]) {
                for (const seg of raySegments) {
                    const ray = MeshFactory.create({
                        type: 'box',
                        params: {
                            size: [0.12, bh, 0.12],
                            position: [cx, seg.y0 + bh / 2, cz],
                            rotation: [0, 0, 0]
                        },
                        material: { color: 0x00ffff, opacity: seg.opacity }
                    });
                    ray.name = 'corner-ray';
                    ray.raycast = () => { };
                    group.add(ray);
                }
            }
        }

        return group;
    }

    /** Ground grid (edit-mode spatial reference). */
    public gridHelper(size: number, divisions: number, color2: number = 0x888888): RenderHandle {
        const grid = MeshFactory.create({
            type: 'grid',
            params: {
                size: [size, divisions, 0],
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            material: { color: color2 } // Using color2 as primary for factory logic simplicity
        });
        grid.raycast = () => { };
        this.worldRoot.add(grid);
        return grid;
    }
}
