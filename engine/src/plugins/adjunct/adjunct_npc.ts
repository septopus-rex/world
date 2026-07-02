import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct.js';
import { AdjunctType } from '../../core/types/AdjunctType';
import { Coords } from '../../core/utils/Coords.js';

/**
 * NPC adjunct (ba) — an autonomous agent authored as world content (F2, spec
 * docs/plan/specs/npc-agents.md).
 *
 * The authored row is the agent's HOME + source: NPCSystem attaches a
 * BehaviorComponent to the materialized entity and drives it (state machine +
 * movement) at runtime. Roaming mutates only the runtime TransformComponent —
 * stdData keeps the home, so drafts persist the ANCHOR, and a block reload
 * respawns the agent at home (nothing derivable is persisted).
 *
 * visual is an OBJECT slot (precedent: trigger's events slot):
 *   { shape?: 'box'|'sphere', size?: [x,y,z], color?: 0xRRGGBB }  — simple body
 *   { module: <resourceId>, size?: [x,y,z] }                       — 3D model
 * A module visual rides the full placeholder→swap pipeline and the avatar
 * animation contract (walk/idle clips by name, fallback chains).
 */
export const NpcMeta: ComponentMeta = {
    name: "npc",
    short: "NP",
    typeId: AdjunctType.Npc,
    desc: "Autonomous agent (visual + data-driven behavior state machine)",
    version: "1.0.0"
};

const NpcTransform: AdjunctTransform = {
    stdToRenderData(stds: STDObject[], _elevation: number): RenderObject[] {
        return stds.map((row, index) => {
            const visual = (row.visual ?? {}) as any;
            const size: [number, number, number] = Array.isArray(visual.size)
                ? visual.size : [0.6, 0.6, 1.7];
            if (visual.module != null) {
                return {
                    type: "module",
                    index,
                    resource: String(visual.module),
                    params: {
                        size: Coords.getBoxDimensions(size),
                        position: [row.ox, row.oy, row.oz],
                        rotation: [0, 0, 0],
                    },
                } as RenderObject;
            }
            return {
                type: visual.shape === 'sphere' ? 'sphere' : 'box',
                index,
                params: {
                    size: Coords.getBoxDimensions(size),
                    position: [row.ox, row.oy, row.oz],
                    rotation: [0, 0, 0],
                },
                material: { color: typeof visual.color === 'number' ? visual.color : 0xcc8844 },
            } as RenderObject;
        });
    }
};

const NpcAttribute: AdjunctAttribute = {
    /** Slot map: [pos, visual, behavior, seed] — spec §1. */
    deserialize: (data: any[]): STDObject => {
        const visual = (data[1] && typeof data[1] === 'object') ? data[1] : {};
        const size: [number, number, number] = Array.isArray((visual as any).size)
            ? (visual as any).size : [0.6, 0.6, 1.7];
        return {
            // Body extents drive the render marker; agents don't rotate via raw.
            x: size[0], y: size[1], z: size[2],
            rx: 0, ry: 0, rz: 0,
            ox: data[0]?.[0] ?? 0, oy: data[0]?.[1] ?? 0, oz: data[0]?.[2] ?? 0,
            visual,
            behavior: (data[2] && typeof data[2] === 'object') ? data[2] : null,
            seed: (data[3] ?? 0) >>> 0,
        };
    },
    serialize: (std: STDObject) => ([
        [std.ox, std.oy, std.oz],
        std.visual ?? {},
        std.behavior ?? null,
        std.seed ?? 0,
    ]),
};

const menu = {
    sidebar: (std: STDObject) => ({
        position: [
            { type: "number", key: "ox", value: std.ox, label: "X (home)" },
            { type: "number", key: "oy", value: std.oy, label: "Y (home)" },
            { type: "number", key: "oz", value: std.oz, label: "Z (home)" },
        ],
        agent: [
            { type: "json", key: "visual", value: JSON.stringify(std.visual ?? {}), label: "Visual" },
            { type: "json", key: "behavior", value: JSON.stringify(std.behavior ?? null, null, 2), label: "Behavior (states)" },
            { type: "number", key: "seed", value: std.seed, label: "Seed" },
        ],
    }),
};

export const AdjunctNpc: AdjunctDefinition = {
    hooks: {
        reg: () => NpcMeta,
        init: () => ({ chain: "", value: null })
    },
    transform: NpcTransform,
    attribute: NpcAttribute,
    menu: menu as any,
};
