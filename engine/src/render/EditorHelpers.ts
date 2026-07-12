import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';
import { MeshFactory } from './MeshFactory';

/**
 * Editor-only helper visuals (render/EditorHelpers) — the selection wirebox,
 * the block-boundary highlight (4 tinted edge planes + wireframe volume) and
 * the ground grid. Pure construction: everything raycast-inert, built via
 * MeshFactory, parented to worldRoot (or the given parent) so the floating
 * origin applies. Positioning/lifetime stays with EditHelperManager.
 */
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

    /** Block-boundary highlight: 4 colour-coded edge planes + wireframe volume. */
    public blockHighlight(parent: RenderHandle, bw: number, bl: number, bh: number): RenderHandle {
        const group = new THREE.Group();
        (parent as THREE.Object3D).add(group);
        const planeHeight = 0.2;
        const opacity = 0.3;

        // Position the group at the center of the block's floor volume
        group.position.set(bw / 2, 0, -bl / 2);

        const planeConfigs = [
            { pos: [0, planeHeight / 2, -bl / 2], rot: [0, 0, 0], color: 0xffff00, size: bw },
            { pos: [0, planeHeight / 2, bl / 2], rot: [0, Math.PI, 0], color: 0xff0000, size: bw },
            { pos: [bw / 2, planeHeight / 2, 0], rot: [0, -Math.PI / 2, 0], color: 0x0000ff, size: bl },
            { pos: [-bw / 2, planeHeight / 2, 0], rot: [0, Math.PI / 2, 0], color: 0x00ff00, size: bl }
        ];

        planeConfigs.forEach(p => {
            const mesh = MeshFactory.create({
                type: 'plane',
                params: {
                    size: [p.size, planeHeight, 0],
                    position: p.pos as [number, number, number],
                    rotation: p.rot as [number, number, number]
                },
                material: { color: p.color, opacity: opacity }
            });
            mesh.raycast = () => { };
            group.add(mesh);
        });

        // Add a Wireframe Volume Box
        const helper = MeshFactory.create({
            type: 'wirebox',
            params: {
                size: [bw, bh, bl],
                position: [0, bh / 2, 0],
                rotation: [0, 0, 0]
            },
            material: { color: 0xffffff, opacity: 0.5 }
        });
        helper.raycast = () => { };
        group.add(helper);

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
