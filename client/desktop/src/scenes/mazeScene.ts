import { MockBlockData } from '@engine/core/mocks/BlockMocks';

/**
 * mazeScene — a PLAYABLE LABYRINTH authored almost entirely as ONE SPP (b6) row.
 *
 * This is the "SPP-as-skeleton" workflow made concrete: a seeded depth-first
 * maze generator emits a grid of string-particle cells, and the engine's
 * Expander turns that single b6 source into ~100 standard a1 walls + a b8 goal
 * trigger — every one of them with native collision / LOD, no per-wall authoring.
 * The classical-Athenian dressing (marble columns, a propylon gateway, a votive
 * monument at the heart) is layered on top with a handful of a2 boxes — the
 * "augment with other adjuncts" half of the workflow.
 *
 *   SPP (b6)  →  the maze walls + the goal volume     (the structure)
 *   a2 boxes  →  columns / entablature / monument      (the Athenian skin)
 *
 * Determinism matters: a block is rebuilt every time it streams in, so the maze
 * MUST regenerate identically each time — hence a seeded PRNG, never Math.random.
 *
 * SPP X=East Y=North Z=Alt. Cells are level-1 (2 m) → 2 m corridors, 2 m walls.
 * Faces are [state, variant] in ParticleFace order [Top,Bottom,Front(S),Back(N),
 * Left(W),Right(E)]; state 1=Closed 0=Open. Interior walls are authored on the
 * POSITIVE faces (Right=E, Back=N) of the lower-coordinate cell, because the
 * Expander auto-drops a NEGATIVE face (Left/Front/Bottom) whenever a same-level
 * neighbour adjoins it — so the wall between two cells must live on exactly one
 * of them.
 */

/** Maze block — one block WEST of the demo spawn ([2048,2048]). Not a game zone. */
export const MAZE_BLOCK: [number, number] = [2047, 2048];

/** A good spot to drop a player so they START the maze (just inside the gate). */
export const MAZE_ENTRY: [number, number, number] = [8, 2.5, 3];

const G = 7;                     // 7×7 cells
const STRIDE = 2;                // level-1 cell = 2 m
const LEVEL = 1;
const ORIGIN: [number, number, number] = [1, 1, 0]; // 1 m margin inside the 16 m block
const ENTRANCE_X = 3;            // entrance column (the south gate)
const GOAL: [number, number] = [3, 3]; // the labyrinth's heart

const WHITE = 10;                // box resource → 0xeeeeee marble
const DARK = 1;                  // box resource → 0x555555 (entablature / finial)

/** mulberry32 — a tiny deterministic PRNG so the maze is identical every load. */
function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Carve a "perfect" maze (one unique path between any two cells) with an
 * iterative recursive-backtracker. Returns the interior wall state: eastWall[x][y]
 * is the wall between (x,y) and (x+1,y); northWall between (x,y) and (x,y+1).
 */
function carveMaze(): { eastWall: boolean[][]; northWall: boolean[][] } {
    const eastWall = Array.from({ length: G }, () => Array(G).fill(true));
    const northWall = Array.from({ length: G }, () => Array(G).fill(true));
    const visited = Array.from({ length: G }, () => Array(G).fill(false));
    const rng = makeRng(0xa15ec0de);              // fixed seed → stable labyrinth

    const stack: Array<[number, number]> = [[0, 0]];
    visited[0][0] = true;
    while (stack.length) {
        const [cx, cy] = stack[stack.length - 1];
        const nbrs: Array<{ nx: number; ny: number; dir: 'E' | 'W' | 'N' | 'S' }> = [];
        if (cx + 1 < G && !visited[cx + 1][cy]) nbrs.push({ nx: cx + 1, ny: cy, dir: 'E' });
        if (cx - 1 >= 0 && !visited[cx - 1][cy]) nbrs.push({ nx: cx - 1, ny: cy, dir: 'W' });
        if (cy + 1 < G && !visited[cx][cy + 1]) nbrs.push({ nx: cx, ny: cy + 1, dir: 'N' });
        if (cy - 1 >= 0 && !visited[cx][cy - 1]) nbrs.push({ nx: cx, ny: cy - 1, dir: 'S' });
        if (!nbrs.length) { stack.pop(); continue; }

        const pick = nbrs[Math.floor(rng() * nbrs.length)];
        // Knock down the shared wall (always recorded on the lower-coord cell).
        if (pick.dir === 'E') eastWall[cx][cy] = false;
        else if (pick.dir === 'W') eastWall[pick.nx][pick.ny] = false;
        else if (pick.dir === 'N') northWall[cx][cy] = false;
        else northWall[pick.nx][pick.ny] = false;
        visited[pick.nx][pick.ny] = true;
        stack.push([pick.nx, pick.ny]);
    }
    return { eastWall, northWall };
}

/** Build the b6 cell list from the carved maze. */
function mazeCells(): any[] {
    const { eastWall, northWall } = carveMaze();
    const cells: any[] = [];
    for (let gx = 0; gx < G; gx++) {
        for (let gy = 0; gy < G; gy++) {
            const rightSolid = gx === G - 1 ? true : eastWall[gx][gy];   // E (+X), boundary always solid
            const backSolid = gy === G - 1 ? true : northWall[gx][gy];   // N (+Y), boundary always solid
            const leftSolid = gx === 0;                                  // W (-X) boundary only (interior auto-dropped)
            let frontSolid = gy === 0;                                   // S (-Y) boundary only
            // South gate: open the entrance cell's outer wall.
            if (gx === ENTRANCE_X && gy === 0) frontSolid = false;

            const faces: Array<[number, number]> = [
                [0, 0],                       // Top    — open (no roof; open sky)
                [0, 0],                       // Bottom — open (stand on the ground)
                [frontSolid ? 1 : 0, 0],      // Front (S)
                [backSolid ? 1 : 0, 0],       // Back  (N)
                [leftSolid ? 1 : 0, 0],       // Left  (W)
                [rightSolid ? 1 : 0, 0],      // Right (E)
            ];

            const cell: any = { position: [gx, gy, 0], level: LEVEL, faces };
            if (gx === GOAL[0] && gy === GOAL[1]) {
                // The goal volume: stepping into the heart sets a one-time flag.
                cell.trigger = [{
                    type: 'in', oneTime: true,
                    actions: [{ type: 'flag', method: '', target: 'maze_solved', params: [true] }],
                }];
            }
            cells.push(cell);
        }
    }
    return cells;
}

/** A square marble column: stepped base + shaft + capital (3 stacked a2 boxes). */
function column(px: number, py: number, shaftH: number): any[] {
    const baseH = 0.35, capH = 0.35;
    return [
        [[0.85, 0.85, baseH], [px, py, baseH / 2], [0, 0, 0], WHITE, [1, 1], 0, 1],
        [[0.55, 0.55, shaftH], [px, py, baseH + shaftH / 2], [0, 0, 0], WHITE, [1, 1], 0, 1],
        [[0.85, 0.85, capH], [px, py, baseH + shaftH + capH / 2], [0, 0, 0], WHITE, [1, 1], 0, 1],
    ];
}

export function buildMazeScene(bx: number, by: number): any[] {
    const data = MockBlockData(bx, by);

    // ── The maze itself: ONE b6 row → engine expands to ~100 a1 walls + goal b8.
    data.raw[2].push([0x00b6, [[ORIGIN, mazeCells(), 'basic']]]);

    // ── Athenian dressing (a2 boxes layered on the SPP skeleton).
    const maxXY = ORIGIN[0] + G * STRIDE; // 1 + 14 = 15 → maze spans local [1,15]
    const gateX = ORIGIN[0] + ENTRANCE_X * STRIDE + STRIDE / 2; // entrance centre, x = 8
    const cx = ORIGIN[0] + GOAL[0] * STRIDE + STRIDE / 2;       // goal-cell centre, x = 8
    const cy = ORIGIN[1] + GOAL[1] * STRIDE + STRIDE / 2;       // goal-cell centre, y = 8

    const boxes: any[] = [];

    // Propylon: a four-column gateway across the south entrance + a dark
    // entablature spanning their tops (a hexastyle-feeling temple front).
    const colH = 4.3, colTop = 0.35 + colH + 0.35; // ≈ 5.0 m
    const gateY = ORIGIN[1] - 0.5;                   // just south of the facade
    for (const px of [gateX - 3.5, gateX - 1.6, gateX + 1.6, gateX + 3.5]) {
        boxes.push(...column(px, gateY, colH));
    }
    boxes.push([[8.2, 0.9, 0.55], [gateX, gateY, colTop + 0.275], [0, 0, 0], DARK, [1, 1], 0, 1]); // architrave

    // Four corner columns frame the temenos (the sacred precinct).
    for (const [px, py] of [[0.55, 0.55], [maxXY - 0.55, 0.55], [0.55, maxXY - 0.55], [maxXY - 0.55, maxXY - 0.55]]) {
        boxes.push(...column(px, py, 4.6)); // taller corners ≈ 5.3 m
    }

    // Votive monument at the heart — a stepped marble base + a tall shaft that
    // rises above the 2 m walls as a beacon, topped by a dark finial.
    boxes.push(
        [[0.9, 0.9, 0.3], [cx, cy, 0.15], [0, 0, 0], WHITE, [1, 1], 0, 1],
        [[0.65, 0.65, 0.3], [cx, cy, 0.45], [0, 0, 0], WHITE, [1, 1], 0, 1],
        [[0.42, 0.42, 4.0], [cx, cy, 0.6 + 2.0], [0, 0, 0], WHITE, [1, 1], 0, 1], // shaft top ≈ 4.6 m
        [[0.6, 0.6, 0.25], [cx, cy, 4.6 + 0.125], [0, 0, 0], DARK, [1, 1], 0, 1], // finial
    );

    data.raw[2].push([0x00a2, boxes]);
    // No data.raw[4] — the maze is a normal explorable block, not a game zone.
    return data.raw;
}
