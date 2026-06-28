import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute,
} from '../../core/types/Adjunct.js';
import { AdjunctType } from '../../core/types/AdjunctType';
import { motifTemplateIds } from '../../core/motif/MotifTemplates.js';

/**
 * Motif adjunct (c2) — a generative content SOURCE row.
 *
 * Raw row (dev-period plaintext):
 *   [ origin, template, seed, params? ]
 *     origin   [x,y,z] SPP meters relative to the block origin
 *     template generator id (MotifTemplates: totem / cluster / arch …)
 *     seed     deterministic PRNG seed — (template, seed) reproduce content
 *     params?  optional per-template overrides ({ count, spread, span, … })
 *
 * Like b6 particle this renders NOTHING itself: BlockSystem expands it into
 * standard a2 box rows whose entities carry `derivedFrom` (skipped by
 * BlockSerializer — only this source row persists). Editing the seed/template
 * and re-expanding swaps the whole arrangement. This is the "iNFT" idea made
 * native: a compact, content-addressable descriptor that deterministically
 * blooms into a lot of varied world content. Chain publication stays an
 * orthogonal concern (IChainPublisher) — the engine knows nothing about it.
 */
export const MotifMeta: ComponentMeta = {
    name: 'motif',
    short: 'MO',
    typeId: AdjunctType.Motif,
    desc: 'Generative content (seed + template → standard adjuncts)',
    version: '1.0.0',
};

export const MotifTransform: AdjunctTransform = {
    stdToRenderData(stds: STDObject[], _elevation: number): RenderObject[] {
        // Hidden marker only — the visible content comes from the EXPANDED rows.
        return stds.map((row, index) => ({
            type: 'box',
            index,
            hidden: true,
            params: {
                size: [0.1, 0.1, 0.1],
                position: [row.ox, row.oy, row.oz],
                rotation: [0, 0, 0],
            },
        }));
    },
};

export const MotifAttribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: 0.1, y: 0.1, z: 0.1,
        ox: data[0]?.[0] ?? 0, oy: data[0]?.[1] ?? 0, oz: data[0]?.[2] ?? 0,
        rx: 0, ry: 0, rz: 0,
        template: data[1] ?? 'totem',
        seed: data[2] ?? 0,
        params: data[3] ?? null,
    }),
    serialize: (std: STDObject) => [
        [std.ox, std.oy, std.oz],
        std.template ?? 'totem',
        std.seed ?? 0,
        std.params ?? null,
    ],
};

export const AdjunctMotif: AdjunctDefinition = {
    hooks: {
        reg: () => MotifMeta,
        init: () => ({ chain: '', value: null }),
    },
    transform: MotifTransform,
    attribute: MotifAttribute,
    menu: {
        sidebar: (std: STDObject) => ({
            motif: [
                { type: 'string', key: 'template', value: std.template, label: 'Template', desc: 'Generator id' },
                { type: 'number', key: 'seed', value: std.seed, label: 'Seed', desc: 'Deterministic variety' },
            ],
        }),
        contextMenu: (_std: STDObject) => [
            { label: '✏️ Edit Properties', action: 'edit' },
            { label: '🗑️ Delete', action: 'delete', variant: 'danger' as const },
        ],
        form: (std: STDObject) => {
            const options = motifTemplateIds().map((id) => ({ label: id, value: id }));
            return [{
                title: 'Motif',
                fields: [
                    { key: 'template', label: 'Template', type: 'select' as const, value: std.template ?? 'totem', options },
                    { key: 'seed', label: 'Seed', type: 'number' as const, value: std.seed ?? 0, step: 1 },
                ],
            }];
        },
    } as any,
};
