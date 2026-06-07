import { describe } from 'vitest';

/**
 * L3 — headless integration.
 *
 * P1 persistence (the planned IndexedDB DraftStore + ExportService). When P1
 * lands, add devDep `fake-indexeddb` and implement:
 *
 *   import 'fake-indexeddb/auto'; // registers globalThis.indexedDB in Node
 *   - write a draft -> read back identical
 *   - re-open the same DB (simulate a page refresh) -> draft still present
 *   - ExportService.toJSON(world) -> fromJSON(...) round-trips
 *
 * These ARE the P1 acceptance criteria and run fully in Node.
 */
describe.todo('DraftStore — IndexedDB round-trip + refresh persistence (P1, needs fake-indexeddb)');
describe.todo('ExportService — JSON export/import round-trip (P1)');

/**
 * Headless World boot now works (renderer DI + step done) — see
 * integration/headless-boot.test.ts which boots a real World with a NullRenderEngine
 * and steps it. Event-bus assertions (world:block_ready, world:mode_changed) are now
 * implementable via makeHeadlessEngine + engine.on(...); left as the next fill-in.
 */
describe.todo('World boot emits world:block_ready / world:mode_changed (now implementable)');
