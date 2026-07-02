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
 * Spawner adjunct (b9) — authored runtime generation (F1, spec
 * docs/plan/specs/scheduler-and-spawn.md §1.2): "every `interval` seconds,
 * spawn `template` here, keeping at most `maxAlive` alive".
 *
 * The spawner itself renders nothing in normal play (hidden marker, same
 * convention as a walk-through b8 trigger); SpawnerSystem arms it on the
 * world scheduler (SIMULATION time) when its block loads and disarms on
 * eviction — re-entry re-arms (timers are never persisted, spec §2.2).
 * Spawned entities are tagged derivedFrom this spawner: serializer-skipped,
 * die with the block, counted against maxAlive.
 */
export const SpawnerMeta: ComponentMeta = {
    name: "spawner",
    short: "SP",
    typeId: AdjunctType.Spawner,
    desc: "Timed runtime generator (template + interval + maxAlive)",
    version: "1.0.0"
};

const SpawnerTransform: AdjunctTransform = {
    stdToRenderData(stds: STDObject[], _elevation: number): RenderObject[] {
        return stds.map((row, index) => ({
            type: "box",
            index,
            hidden: true, // never rendered in play; edit helpers visualize it
            params: {
                size: Coords.getBoxDimensions([0.4, 0.4, 0.4]),
                position: [row.ox, row.oy, row.oz],
                rotation: [0, 0, 0],
            },
        }));
    }
};

const SpawnerAttribute: AdjunctAttribute = {
    /**
     * Slot map: [pos, template, interval, maxAlive, autoStart, seed]
     *   pos       [E, N, Alt] — spawner anchor (block-local)
     *   template  [typeId, rawRow] — rawRow's position slot is RELATIVE to pos
     *   interval  seconds (simulation time) between spawn attempts
     *   maxAlive  cap of simultaneously alive spawned entities
     *   autoStart 1 = arm on block load (0 reserved for v2 actuator control)
     *   seed      uint32, reserved (deterministic template randomization, v2)
     */
    deserialize: (data: any[]): STDObject => ({
        // Fixed marker extents / no rotation — the spawner is an anchor, not a body.
        x: 0.4, y: 0.4, z: 0.4,
        rx: 0, ry: 0, rz: 0,
        ox: data[0]?.[0] ?? 0, oy: data[0]?.[1] ?? 0, oz: data[0]?.[2] ?? 0,
        template: Array.isArray(data[1]) ? data[1] : null,
        interval: typeof data[2] === 'number' && data[2] > 0 ? data[2] : 5,
        maxAlive: typeof data[3] === 'number' && data[3] > 0 ? data[3] : 1,
        autoStart: data[4] ?? 1,
        seed: (data[5] ?? 0) >>> 0,
    }),
    serialize: (std: STDObject) => ([
        [std.ox, std.oy, std.oz],
        std.template ?? null,
        std.interval ?? 5,
        std.maxAlive ?? 1,
        std.autoStart ?? 1,
        std.seed ?? 0,
    ]),
};

const menu = {
    sidebar: (std: STDObject) => ({
        position: [
            { type: "number", key: "ox", value: std.ox, label: "X Offset" },
            { type: "number", key: "oy", value: std.oy, label: "Y Offset" },
            { type: "number", key: "oz", value: std.oz, label: "Z Offset" },
        ],
        spawner: [
            { type: "number", key: "interval", value: std.interval, label: "Interval (s)" },
            { type: "number", key: "maxAlive", value: std.maxAlive, label: "Max alive" },
            { type: "json", key: "template", value: JSON.stringify(std.template ?? null), label: "Template [typeId, rawRow]" },
        ],
    }),
};

export const AdjunctSpawner: AdjunctDefinition = {
    hooks: {
        reg: () => SpawnerMeta,
        init: () => ({ chain: "", value: null })
    },
    transform: SpawnerTransform,
    attribute: SpawnerAttribute,
    menu: menu as any,
};
