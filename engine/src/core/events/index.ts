/**
 * core/events — frame-scoped typed event queue (event-bus spec PR-1).
 *
 * STATUS: queue only. No call sites are migrated yet — the legacy
 * World.on/emitSimple bus runs unchanged alongside. Later PRs migrate
 * channels one by one (see docs/plan/specs/event-bus-design.md §7).
 *
 * ── Consumer contract ────────────────────────────────────────────────────────
 * 1. STALE-TARGET DEFENSE: with the pull model an event may be read after its
 *    target entity was destroyed. Every consumer that resolves `ev.target`
 *    must tolerate getComponent() returning undefined and skip. Contract, not
 *    advice.
 * 2. READ CADENCE: a reader that reads every frame never loses events. A
 *    system paused by mode-gating calls reader.clear() before resuming (or
 *    accepts the lag warning + jump-to-oldest). Events live exactly 2
 *    beginFrame() calls.
 * 3. CROSS-CHANNEL ORDER: within one channel, strict emit order. Across
 *    channels on the system side, order = your read order. Consumers needing
 *    strict causal interleaving subscribe at the boundary — flushBoundary
 *    dispatches in global (frame, seq) order.
 * 4. SAME-FRAME VISIBILITY: systems registered after an emitter see its events
 *    the same frame; earlier-registered systems see them next frame.
 */
export * from './EventTypes';
export { EventQueue } from './EventQueue';
export { EventReader } from './EventReader';
export { adjKey, blkKey } from './TargetKeys';
