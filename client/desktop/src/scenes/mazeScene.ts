/**
 * mazeScene — constants only. The Athenian labyrinth CONTENT is FROZEN DATA at
 * src/levels/maze-block.json: one b6 SPP row (49 level-1 cells, carved once by a
 * FIXED-seed backtracker — "one-shot generation → freeze to JSON",
 * full-data-migration.md P2/P3) + the a2 marble dressing. The engine still
 * expands the b6 source at load (only the source row persists); the old
 * carveMaze/buildMazeScene TS generator is retired.
 */

/** Maze block — two west of the demo spawn (registry collision-free). */
export const MAZE_BLOCK: [number, number] = [2046, 2048];

/** A good spot to drop a player so they START the maze (just inside the gate). */
export const MAZE_ENTRY: [number, number, number] = [8, 2.5, 3];
