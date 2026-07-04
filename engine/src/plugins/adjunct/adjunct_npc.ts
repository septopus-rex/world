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
    /** Slot map: [pos, visual, behavior, seed, hp?, dialogue?, interact?, touch?]
     *  — npc spec §1, combat spec §1.2 (hp), dialogue spec §1 (dialogue document).
     *
     *  interact (slot 6, combat §1.4 — the player's ATTACK VERB, data-declared):
     *    { when?: JSONLogic, cooldown?: s (default 0.4), actions: TriggerAction[] }
     *    Clicking the agent runs `actions` through the actuator (sourceEntity =
     *    the agent, so `damage target:'self'` is "the player hits me"). Only
     *    consulted when the agent has NO dialogue document — a talkable NPC's
     *    click belongs to DialogueSystem.
     *
     *  touch (slot 7, combat §1.5 — contact damage that FOLLOWS the live agent):
     *    { damage: n, interval?: s (default 1), radius?: m (default 1.2) }
     *    NPCSystem ticks it off the same distToPlayer it already derives, so a
     *    `follow` chaser bites whoever it catches; lands as the Game-mode-gated
     *    actuator damage channel. */
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
            // hp > 0 = damageable (combat spec §1.2); absent/0 = invulnerable ambience.
            hp: typeof data[4] === 'number' && data[4] > 0 ? data[4] : 0,
            // Dialogue document (dialogue spec §1); null = not talkable.
            dialogue: (data[5] && typeof data[5] === 'object') ? data[5] : null,
            interact: (data[6] && typeof data[6] === 'object' && Array.isArray(data[6].actions)) ? data[6] : null,
            touch: (data[7] && typeof data[7] === 'object' && Number(data[7].damage) > 0) ? data[7] : null,
        };
    },
    serialize: (std: STDObject) => ([
        [std.ox, std.oy, std.oz],
        std.visual ?? {},
        std.behavior ?? null,
        std.seed ?? 0,
        std.hp ?? 0,
        std.dialogue ?? null,
        std.interact ?? null,
        std.touch ?? null,
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
