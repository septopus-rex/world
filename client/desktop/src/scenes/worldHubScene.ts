import type { AuthoredLevel } from '@engine/core/services/AuthoredLevel';
import { AdjunctType } from '@engine/core/types/AdjunctType';
import { buildDemoScene } from './demoScene';
import xianjianLevelJson from '../levels/xianjian.level.json';

/**
 * worldHubScene — a unified "world" that stitches the two existing experiences
 * behind teleport portals (specs/teleport-portal.md), reached via `?level=world`.
 *
 *   START → hub block [2026,705]
 *     ├─ 走进西门 → 传送到 演示场景 (the demo showcase, kept at [2048,2048])
 *     └─ 走进东门 → 传送到 灵草记《仙剑》 (the xianjian mini-RPG, relocated here)
 *   each destination carries a "返回中枢" portal back to the hub.
 *
 * Why a NEW level and not the default start: teleport is INTRA-world (an anchor
 * in one data source), so hub + demo + xianjian must share one data source. The
 * demo default world and `?level=xianjian` both live at block [2048,2048] and are
 * exercised by ~15 e2e specs; moving the default spawn to the hub would break
 * them. A self-contained `?level=world` composes copies here and leaves both
 * untouched. Portals are pure b8 recipes: a walk-in trigger fires player.teleport
 * at an ANCHOR NAME; the destination declares a b8 slot-6 anchor. Xianjian has
 * zero absolute adj-id coupling, so it relocates by shifting its block coords.
 */

const T = AdjunctType.Trigger; // 0x00b8
const BOX = AdjunctType.Box;    // 0x00a2
const BOOK = AdjunctType.Book;  // 0x00e4

export const HUB_BLOCK: [number, number] = [2026, 705];
export const DEMO_DEST: [number, number] = [2048, 2048];
export const XIANJIAN_VILLAGE: [number, number] = [2030, 705]; // path=+1, summit=+2 in Y

const teleport = (anchor: string, block: [number, number]) =>
    ({ type: 'player', method: 'teleport', target: anchor, params: [block] });

/** Find (or create) the group for a typeId in a block raw's adjuncts and append rows. */
function pushGroup(raw: any[], typeId: number, rows: any[]): void {
    const groups: any[] = Array.isArray(raw[2]) ? raw[2] : (raw[2] = []);
    const g = groups.find((grp: any) => grp[0] === typeId);
    if (g) g[1].push(...rows);
    else groups.push([typeId, rows]);
}

/**
 * A portal: a glowing floor pad + a non-solid arch (never blocks the walk) + a
 * walk-in trigger that teleports + a floating book sign. `cx,cy` = pad centre
 * (Septopus, block-local meters). Returns the rows to fold into a block.
 */
function portal(cx: number, cy: number, color: number, anchor: string, dest: [number, number], title: string, pages: string[]) {
    return {
        // a2 boxes — pad is thin/non-solid; the arch bars are non-solid visuals.
        boxes: [
            [[2.0, 2.0, 0.08], [cx, cy, 0.05], [0, 0, 0], color, [1, 1], 0, 0],   // floor pad
            [[0.25, 0.25, 3.0], [cx, cy - 1.0, 1.5], [0, 0, 0], color, [1, 1], 0, 0], // left bar
            [[0.25, 0.25, 3.0], [cx, cy + 1.0, 1.5], [0, 0, 0], color, [1, 1], 0, 0], // right bar
            [[0.25, 2.25, 0.25], [cx, cy, 3.0], [0, 0, 0], color, [1, 1], 0, 0],   // top bar
        ],
        // b8 walk-in trigger → player.teleport at the anchor name.
        trigger: [[2.0, 2.0, 3], [cx, cy, 1.5], [0, 0, 0], 1, 0, [
            { type: 'in', actions: [teleport(anchor, dest)] },
        ]],
        // e4 book sign floating in the arch.
        book: [[0.7, 0.2, 0.9], [cx, cy, 3.6], [0, 0, 0], color, [1, 1], null, null, pages, title],
    };
}

/** Fold a portal's pad/arch/book into a block raw (used for return portals). */
function foldPortal(raw: any[], p: ReturnType<typeof portal>): void {
    pushGroup(raw, BOX, p.boxes);
    pushGroup(raw, T, [p.trigger]);
    pushGroup(raw, BOOK, [p.book]);
}

/** A b8 anchor row (slot 6) — a legal teleport destination, no events. */
const anchorRow = (cx: number, cy: number, name: string) =>
    [[2, 2, 2], [cx, cy, 1], [0, 0, 0], 1, 0, [], { name }];

/** The hub block: clean ground + two outbound portals + a return anchor. */
function hubBlockRaw(): any[] {
    const ground = [[16, 16, 0.4], [8, 8, -0.2], [0, 0, 0], 0, [1, 1], 0, 1]; // walkable plane, top z=0
    const west = portal(5, 8, 2, 'showcase', DEMO_DEST, '前往 · 演示场景', [
        '西门 · 演示场景',
        '穿过这道门,前往演示场景——会动的门、触发器、可拾取物品、书本、弦粒子小屋都在那边。',
        '（走进传送门即可前往。）',
    ]);
    const east = portal(11, 8, 3, 'xianjian', XIANJIAN_VILLAGE, '前往 · 灵草记', [
        '东门 · 灵草记《仙剑》',
        '穿过这道门,进入微缩仙剑「灵草记」:村庄接任务 → 上山 → 战妖狼 → 采药 → 回村交任务。',
        '（走进传送门即可前往。）',
    ]);
    return [0, 1, [
        [BOX, [ground, ...west.boxes, ...east.boxes]],
        [T, [west.trigger, east.trigger, anchorRow(8, 8, 'hub')]],
        [BOOK, [west.book, east.book]],
    ], [], 0];
}

const RETURN_PAGES = ['返回 · 传送中枢', '穿过这道门,回到传送中枢,再选去处。', '（走进即可返回。）'];

/** Demo showcase block, kept at [2048,2048], with an arrival anchor + a return portal. */
function demoBlockRaw(): any[] {
    const raw = buildDemoScene(DEMO_DEST[0], DEMO_DEST[1]);
    pushGroup(raw, T, [anchorRow(8, 7, 'showcase')]);         // land here (clear, just S of spawn)
    // Return portal due E of the arrival (same N=7) so walking straight east lands it.
    foldPortal(raw, portal(13, 7, 1, 'hub', HUB_BLOCK, '返回 · 中枢', RETURN_PAGES));
    return raw;
}

/** Xianjian's 3 blocks relocated near the hub; the village start gets an
 *  arrival anchor + a return portal. Deep-cloned so `?level=xianjian` stays pristine. */
function xianjianBlocks(): Array<{ x: number; y: number; raw: any[] }> {
    const src: Array<{ x: number; y: number; raw: any[] }> = (xianjianLevelJson as any).blocks;
    const dx = XIANJIAN_VILLAGE[0] - src[0].x, dy = XIANJIAN_VILLAGE[1] - src[0].y;
    return src.map((b, i) => {
        const raw = JSON.parse(JSON.stringify(b.raw)); // pure-data clone, never mutate the import
        if (i === 0) {
            pushGroup(raw, T, [anchorRow(8, 2, 'xianjian')]);  // arrive at the village entrance
            // Return portal in the SE corner — off the northbound quest path so a
            // walk-in never fires while the player heads up the mountain.
            foldPortal(raw, portal(13, 2, 1, 'hub', HUB_BLOCK, '返回 · 中枢', RETURN_PAGES));
        }
        return { x: b.x + dx, y: b.y + dy, raw };
    });
}

/** Build the unified `?level=world` AuthoredLevel programmatically. */
export function buildWorldLevel(): AuthoredLevel {
    return {
        format: 'septopus.world.level',
        version: 1,
        name: 'world',
        start: { block: HUB_BLOCK, position: [8, 8, 3], rotation: [0, 0, 0] },
        blocks: [
            { x: HUB_BLOCK[0], y: HUB_BLOCK[1], raw: hubBlockRaw() },
            { x: DEMO_DEST[0], y: DEMO_DEST[1], raw: demoBlockRaw() },
            ...xianjianBlocks(),
        ],
    };
}
