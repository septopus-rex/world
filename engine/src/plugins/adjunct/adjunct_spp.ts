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
 * SPP adjunct (b6) — the SPP SOURCE row (renamed from `particle`, 2026-07-06).
 *
 * Carries a String-Particle CHUNK: a set of cells + a theme reference. The
 * protocol's atomic unit is the "String Particle" (one cell); this adjunct is
 * the block-local container for a chunk of them, so it is named after the
 * protocol (`spp`) rather than a single cell.
 *
 * Raw row (dev-period plaintext; L2 binary lands with the CollapseCodec):
 *   [ origin, cells, theme ]
 *     origin [x,y,z] Septopus meters relative to the block origin
 *     cells  SppCell[] (see core/spp/Expander.ts)
 *     theme  StyleRef — a built-in theme id, or a CID/URL of an external
 *            StylePack (see core/spp/Variants.ts + StylePack loading)
 *
 * This adjunct renders NOTHING itself: BlockSystem expands it into standard
 * a1/b8 rows whose entities carry `derivedFrom` (skipped by BlockSerializer —
 * only this source row persists). Spec: docs/plan/specs/spp-integration.md +
 * spp-protocol-full.md.
 */
export const SppMeta: ComponentMeta = {
    name: "spp",
    short: "SPP",
    typeId: AdjunctType.Spp,
    desc: "SPP spatial definition (string-particle chunk; expands to standard adjuncts)",
    version: "1.0.0"
};

export const SppTransform: AdjunctTransform = {
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

export const SppAttribute: AdjunctAttribute = {
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

export const AdjunctSpp: AdjunctDefinition = {
    hooks: {
        reg: () => SppMeta,
        init: () => ({ chain: "", value: null })
    },
    transform: SppTransform,
    attribute: SppAttribute,
    menu: {
        sidebar: (std: STDObject) => ({
            spp: [
                { type: "string", key: "theme", value: std.theme, label: "Theme", desc: "StylePack id / CID / URL" },
                { type: "json", key: "cells", value: JSON.stringify(std.cells ?? []), label: "Cells", desc: "SppCell[] (multi-cell editing)" },
            ],
        }),
        contextMenu: (_std: STDObject) => [
            { label: "✏️ Edit Faces", action: "edit" },
            { label: "🗑️ Delete", action: "delete", variant: "danger" as const },
        ],
        // Per-face state/variant editor for the first cell. Codes (open/solid/
        // doorway/window) fold back into cells[0].faces in the edit path
        // (normalizeSppFaces) and re-expand live.
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
