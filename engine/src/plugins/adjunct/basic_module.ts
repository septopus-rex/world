import * as THREE from 'three';
import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct';
import { ContextMenuItem, FormGroup } from '../../core/types/EditTask';
import { Coords } from '../../core/utils/Coords';

/**
 * Module adjunct (type-id 0x00a4) — the 3D-MODEL adjunct.
 *
 * Unlike box/wall (geometry described inline), a module references a ready-made
 * 3D model file by an integer RESOURCE_ID and is positioned/sized in the world.
 * The raw model file is loaded ONCE per id and instanced many times — see
 * ResourceManager. This adjunct only describes the placement + which resource;
 * it never carries geometry.
 *
 * Render flow (placeholder-then-swap, the deterministic port of the old engine's
 * replaceFun): createMesh synchronously returns a tinted placeholder box (so the
 * frame never blocks on a network load); AdjunctFactory then asks ResourceManager
 * to load the model and swaps a real clone in when it resolves.
 *
 * CANONICAL SLOT MAP (resolves the old engine's slot inconsistency, where
 * raw_std read `stop` from d[4] while the definition labeled slot4=animation):
 *   0 = size triple   [sx, sy, sz]   (E, N, Alt)
 *   1 = offset triple [ox, oy, oz]
 *   2 = rotation      [rx, ry, rz]
 *   3 = RESOURCE_ID   (the model file reference — the ONLY linkage to the file)
 *   4 = animate       (animation option index; load+position only this migration)
 *   5 = stop          (collidable flag)
 * Module has NO texture slot (unlike box, which uses slot3=resource, slot4=repeat).
 */
export const ModuleMeta: ComponentMeta = {
    name: "module",
    short: "MD",
    typeId: 0x00a4,
    desc: "3D model loaded from storage by resource id",
    version: "1.0.0"
};

/** Tint for the loading placeholder box (the old engine's module placeholder color). */
const PLACEHOLDER_COLOR = 0x3456f3;

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => {
        const resourceId = data[3] ?? 0;
        return {
            x: data[0]?.[0] ?? 1, y: data[0]?.[1] ?? 1, z: data[0]?.[2] ?? 1,
            ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
            rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
            module: resourceId,                 // numeric id (legacy std field)
            resource: String(resourceId),       // string id (new RenderObject.resource)
            animate: data[4] ?? null,
            stop: data[5] ?? null
        };
    },
    serialize: (std: STDObject) => {
        return [
            [std.x, std.y, std.z],
            [std.ox, std.oy, std.oz],
            [std.rx, std.ry, std.rz],
            std.module ?? Number(std.resource) ?? 0,
            std.animate,
            std.stop
        ];
    }
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[]): RenderObject[] => {
        return stds.map((row, index) => ({
            type: "module",
            index,
            params: {
                // Authored size of the placeholder; the real model is scaled to
                // fit these dimensions on swap (decision: honor std size).
                size: Coords.getBoxDimensions([row.x, row.y, row.z]),
                position: [row.ox, row.oy, row.oz],
                rotation: [row.rx, row.ry, row.rz],
            },
            material: { color: PLACEHOLDER_COLOR, opacity: 0.6 },
            resource: String(row.resource ?? row.module ?? ''),
            module: row.module,
            animate: row.animate,
            stop: row.stop ? { opacity: 0.5, color: 0xffffff } : undefined
        }));
    },

    /**
     * Synchronously build the LOADING PLACEHOLDER (a tinted box sized to the
     * authored dimensions). Returned immediately so the build frame never blocks;
     * AdjunctFactory schedules the async model load + swap. Uses a fresh
     * (un-shared) geometry/material so disposing the placeholder on swap is clean
     * and never touches MeshFactory's shared primitive caches.
     */
    createMesh: (data: RenderObject): THREE.Object3D => {
        const [w, h, d] = data.params.size;
        const geo = new THREE.BoxGeometry(w || 1, h || 1, d || 1);
        const mat = new THREE.MeshStandardMaterial({
            color: data.material?.color ?? PLACEHOLDER_COLOR,
            transparent: true,
            opacity: data.material?.opacity ?? 0.6,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = {
            isPlaceholder: true,
            adjunct: 'module',
            resource: data.resource ?? ''
        };
        return mesh;
    }
};

const menu = {
    sidebar: (std: STDObject) => ({
        size: [
            { type: "number", key: "x", value: std.x, label: "X" },
            { type: "number", key: "y", value: std.y, label: "Y" },
            { type: "number", key: "z", value: std.z, label: "Z" },
        ],
        position: [
            { type: "number", key: "ox", value: std.ox, label: "X Offset" },
            { type: "number", key: "oy", value: std.oy, label: "Y Offset" },
            { type: "number", key: "oz", value: std.oz, label: "Z Offset" },
        ],
    }),
    contextMenu: (_std: STDObject): ContextMenuItem[] => [
        { label: "✏️ Edit Properties", action: "edit" },
        { label: "🗑️ Delete", action: "delete", variant: "danger" as const }
    ],
    form: (std: STDObject): FormGroup[] => [
        {
            title: "Model",
            fields: [
                { key: "resource", label: "Model Resource ID", type: "number" as const, value: Number(std.resource ?? std.module ?? 0), min: 0, step: 1 }
            ]
        },
        {
            title: "Size",
            fields: [
                { key: "x", label: "Width (E)", type: "number" as const, value: std.x, min: 0.1, step: 0.1 },
                { key: "y", label: "Depth (N)", type: "number" as const, value: std.y, min: 0.1, step: 0.1 },
                { key: "z", label: "Height", type: "number" as const, value: std.z, min: 0.1, step: 0.1 },
            ]
        },
        {
            title: "Position",
            fields: [
                { key: "ox", label: "X Offset", type: "number" as const, value: std.ox, step: 0.5 },
                { key: "oy", label: "Y Offset", type: "number" as const, value: std.oy, step: 0.5 },
                { key: "oz", label: "Z Offset", type: "number" as const, value: std.oz, step: 0.5 },
            ]
        }
    ]
};

export const AdjunctModule: AdjunctDefinition = {
    hooks: {
        reg: () => ModuleMeta,
        init: () => ({ chain: "", value: null })
    },
    transform,
    attribute,
    menu: menu as any
};
