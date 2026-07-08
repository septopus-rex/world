import type { AuthoredLevel } from '@engine/core/services/AuthoredLevel';
import { AdjunctType } from '@engine/core/types/AdjunctType';
import demoBlockJson from '../blocks/demo.block.json';
import hubBlockJson from '../blocks/hub.block.json';
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

/** A portal's pad/arch/book + an arrival anchor, as adjunct GROUPS to overlay into
 *  a composed block (the include `overlay` shape). Replaces the old foldPortal
 *  mutation — pure data now. */
function portalOverlay(anchor: any[], p: ReturnType<typeof portal>): Array<[number, any[]]> {
    return [
        [BOX, [...p.boxes]],
        [T, [anchor, p.trigger]],
        [BOOK, [p.book]],
    ];
}

/** A b8 anchor row (slot 6) — a legal teleport destination, no events. */
const anchorRow = (cx: number, cy: number, name: string) =>
    [[2, 2, 2], [cx, cy, 1], [0, 0, 0], 1, 0, [], { name }];

// The hub block (ground + two outbound portals + a return anchor) is FROZEN
// DATA at src/blocks/hub.block.json — content must not be re-authored in TS
// here (see scenes/README.md). portal()/anchorRow() above remain ONLY for the
// two return-portal OVERLAYS injected into the included sub-levels.

const RETURN_PAGES = ['返回 · 传送中枢', '穿过这道门,回到传送中枢,再选去处。', '（走进即可返回。）'];

/** Build the unified `?level=world` AuthoredLevel — now via the pure-DATA
 *  `include` composition primitive (full-data-migration.md P1), replacing the old
 *  hand-cloned/shifted/injected TS (demoBlockRaw / xianjianBlocks / foldPortal).
 *  Own block = the hub; demo + relocated xianjian come in as `include`s, each
 *  overlaid with an arrival anchor + a return portal. The offset only shifts block
 *  KEYS — relocation is safe because xianjian carries zero absolute adj-id coupling
 *  (block-local / block-relative refs, the sibling P1 change). */
export function buildWorldLevel(): AuthoredLevel {
    // Demo wrapped as a one-block sub-level; content still from demoScene (migrating
    // that CONTENT to data is P2). Stays at its own coords → offset [0,0].
    const demoLevel: AuthoredLevel = {
        format: 'septopus.world.level', version: 1, name: 'demo-embed',
        start: { block: DEMO_DEST, position: [8, 8, 3], rotation: [0, 0, 0] },
        blocks: [{ x: DEMO_DEST[0], y: DEMO_DEST[1], raw: JSON.parse(JSON.stringify(demoBlockJson)) as any }],
    };
    const xianjian = xianjianLevelJson as unknown as AuthoredLevel;
    const src0 = xianjian.blocks[0];
    const xjOffset: [number, number] = [XIANJIAN_VILLAGE[0] - src0.x, XIANJIAN_VILLAGE[1] - src0.y];

    const demoReturn = portal(13, 7, 1, 'hub', HUB_BLOCK, '返回 · 中枢', RETURN_PAGES);
    const xjReturn = portal(13, 2, 1, 'hub', HUB_BLOCK, '返回 · 中枢', RETURN_PAGES);

    return {
        format: 'septopus.world.level',
        version: 1,
        name: 'world',
        start: { block: HUB_BLOCK, position: [8, 8, 3], rotation: [0, 0, 0] },
        blocks: [{ x: HUB_BLOCK[0], y: HUB_BLOCK[1], raw: JSON.parse(JSON.stringify(hubBlockJson)) as any }],
        include: [
            {
                level: demoLevel, offset: [0, 0],
                overlay: { [`${DEMO_DEST[0]}_${DEMO_DEST[1]}`]: portalOverlay(anchorRow(8, 7, 'showcase'), demoReturn) },
            },
            {
                level: xianjian, offset: xjOffset,
                overlay: { [`${XIANJIAN_VILLAGE[0]}_${XIANJIAN_VILLAGE[1]}`]: portalOverlay(anchorRow(8, 2, 'xianjian'), xjReturn) },
            },
        ],
    };
}
