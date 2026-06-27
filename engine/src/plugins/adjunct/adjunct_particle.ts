import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct.js';
import { AdjunctType } from '../../core/types/AdjunctType';
import { codeFromFace } from '../../core/spp/faceCodes.js';

/**
 * String-particle adjunct (b6) — the SPP SOURCE row.
 *
 * Raw row (dev-period plaintext; L2 binary lands with M3):
 *   [ origin, cells, theme ]
 *     origin [x,y,z] SPP meters relative to the block origin
 *     cells  SppCell[] (see core/spp/Expander.ts)
 *     theme  variant-theme id (VariantRegistry)
 *
 * This adjunct renders NOTHING itself: BlockSystem expands it into standard
 * a1/b8 rows whose entities carry `derivedFrom` (skipped by BlockSerializer —
 * only this source row persists). Spec: docs/plan/specs/spp-integration.md.
 */
export const ParticleMeta: ComponentMeta = {
    name: "particle",
    short: "SP",
    typeId: AdjunctType.Particle,
    desc: "String-particle spatial definition (expands to standard adjuncts)",
    version: "1.0.0"
};

export const ParticleTransform: AdjunctTransform = {
    stdToRenderData(stds: STDObject[], _elevation: number): RenderObject[] {
        // Hidden marker only — the visible world comes from the EXPANDED rows.
        return stds.map((row, index) => ({
            type: "box",
            index,
            hidden: true,
            params: {
                size: [0.1, 0.1, 0.1],
                position: [row.ox, row.oy, row.oz],
                rotation: [0, 0, 0],
            },
        }));
    }
};

export const ParticleAttribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: 0.1, y: 0.1, z: 0.1,
        ox: data[0]?.[0] ?? 0, oy: data[0]?.[1] ?? 0, oz: data[0]?.[2] ?? 0,
        rx: 0, ry: 0, rz: 0,
        cells: data[1] ?? [],
        theme: data[2] ?? 'basic',
    }),
    serialize: (std: STDObject) => [
        [std.ox, std.oy, std.oz],
        std.cells ?? [],
        std.theme ?? 'basic',
    ]
};

export const AdjunctParticle: AdjunctDefinition = {
    hooks: {
        reg: () => ParticleMeta,
        init: () => ({ chain: "", value: null })
    },
    transform: ParticleTransform,
    attribute: ParticleAttribute,
    menu: {
        sidebar: (std: STDObject) => ({
            particle: [
                { type: "string", key: "theme", value: std.theme, label: "Theme", desc: "Variant theme id" },
                { type: "json", key: "cells", value: JSON.stringify(std.cells ?? []), label: "Cells", desc: "SppCell[] (multi-cell editing)" },
            ],
        }),
        contextMenu: (_std: STDObject) => [
            { label: "✏️ Edit Faces", action: "edit" },
            { label: "🗑️ Delete", action: "delete", variant: "danger" as const },
        ],
        // Per-face state/variant editor for the first cell. Codes (open/solid/
        // doorway/window) fold back into cells[0].faces in the edit path
        // (normalizeParticleFaces) and re-expand live.
        form: (std: STDObject) => {
            const faces = (std.cells?.[0]?.faces) ?? [];
            const options = [
                { label: "Solid", value: "solid" },
                { label: "Doorway", value: "doorway" },
                { label: "Window", value: "window" },
                { label: "Open", value: "open" },
            ];
            const face = (key: string, label: string, j: number) => ({
                key, label, type: "select" as const, value: codeFromFace(faces[j]), options,
            });
            return [{
                title: "Cell Faces",
                fields: [
                    face("faceTop", "Top", 0),
                    face("faceBottom", "Bottom", 1),
                    face("faceFront", "Front (S)", 2),
                    face("faceBack", "Back (N)", 3),
                    face("faceLeft", "Left (W)", 4),
                    face("faceRight", "Right (E)", 5),
                ],
            }];
        },
    } as any,
};
