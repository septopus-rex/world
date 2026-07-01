/**
 * EventTypes — the typed envelope + event-name → payload map for the frame-
 * scoped event queue (event-bus spec PR-1; docs/plan/specs/event-bus-design.md §2.1).
 *
 * PR-1 lands the QUEUE ONLY: no call sites are migrated, the legacy
 * World.on/emitSimple bus keeps running unchanged. Names below are the target
 * taxonomy (`category.event`); rows light up as later PRs migrate channels.
 */
import type { EntityId } from '../World';
import type { SystemMode } from '../types/SystemMode';

/** Event name → payload shape. Adding an event = adding a row (compile-time). */
export interface EventMap {
    // ── system ──
    'system.init': { worldIndex: number };
    'system.launch': Record<string, never>;
    'system.mode': { mode: SystemMode; oldMode: SystemMode };
    'system.preload': { scope: 'all' | 'block' };
    // ── block ──
    'block.in': { block: [number, number]; key: string; prev: [number, number] | null };
    'block.out': { block: [number, number]; key: string; next: [number, number] };
    'block.loaded': { x: number; y: number; adjunctCount: number; isDraft: boolean };
    'block.unload': { x: number; y: number; adjunctIds: string[] };
    'block.need': { center: [number, number]; key: string };
    // ── trigger ──
    'trigger.fired': { eventType: 'in' | 'out' | 'hold' | 'touch'; pass: boolean; actionCount: number; oneTimeConsumed: boolean };
    'trigger.touch': { point: [number, number, number]; distance: number };
    // ── stop ──
    'stop.on': { face: 'top'; adjunctId?: string };
    'stop.leave': { adjunctId?: string };
    'stop.beside': { axis: 0 | 2; adjunctId?: string };
    // ── game (zone gating: derived from block.game; see GameZoneSystem) ──
    'game.zone_enter': { block: [number, number]; key: string; game: number };
    'game.zone_exit': { block: [number, number]; key: string };
    /** Player left the active game's block under a 'confirm' exitPolicy: the round
     *  is kept alive and the interpreter is asked to confirm leaving (vs the silent
     *  auto-exit of 'ephemeral'). See docs/systems/game-mode-entry.md §2. */
    'game.leave_intent': { block: [number, number]; key: string };
    /** A game session opened (entered Game mode + `start` resolved). */
    'game.started': { game: string; session: any };
    /** A game session closed (left Game mode + `end` resolved). */
    'game.ended': { game: string; result: any };
    // ── player ──
    'player.state': { block: [number, number]; position: number[]; rotation: number[] };
    'player.fall': { drop: number; position: [number, number, number] };
    'player.death': { drop: number; position: [number, number, number] };
    'player.recover': { position: [number, number, number]; depth: number };
    'player.rotate': { yaw: number; pitch: number; deltaYaw: number };
    // ── resource ──
    'resource.parsed': { kind: 'model' | 'texture'; id: string };
    'resource.failed': { kind: 'model' | 'texture'; id: string; error: string };
    // ── error (typed-error general channel; WorldEventSink → core/errors) ──
    'engine.error': { code: string; severity: 'fatal' | 'error' | 'warn' | 'debug';
                      message: string; userMessage?: string; kind?: string; id?: string };
    // ── interact ──
    'interact.primary': { metadata: unknown; distance: number; point: [number, number, number] };
    'interact.context': { metadata: unknown; distance: number; point: [number, number, number]; screenPos: [number, number] };
    'interact.miss': Record<string, never>;
    // ── item / inventory / effect ──
    'item.pickup': { itemId: string; amount: number; metadata?: unknown };
    'item.consume': { itemId: string; amount: number };
    'item.spawn_drop': { itemId: string; amount: number; position: [number, number, number] };
    'item.picked': { itemId: string; templateId: number; seed: number; count: number };
    'item.dropped': { itemId: string; templateId: number; seed: number; count: number };
    'inventory.updated': { entity: EntityId; inventory: unknown };
    'inventory.full': { entity: EntityId; itemId: string };
    'effect.spawn': { position: [number, number, number]; type: string };
    // ── edit ──
    'edit.draft_saved': { blockKey: string };
    'edit.upload_request': { drafts: unknown };
    // ── actuator ──
    'actuator.requested': { reqId: number; action: unknown };
    'actuator.settled': { reqId: number; ok: boolean; result?: unknown; error?: string };
    // ── live (external realtime transport → world.events; see LiveSystem) ──
    'live.message': { topic: string; data: unknown; ts?: number };
    'live.status': { transport: string; status: 'open' | 'closed' | 'error' };
    // ── ui (boundary-only: payloads may contain closures; never recorded) ──
    'ui.show_group': unknown; 'ui.show_button': unknown; 'ui.show_modal': unknown;
    'ui.show_form': unknown; 'ui.show_toast': unknown; 'ui.update_compass': unknown;
    'ui.update_widget': unknown; 'ui.hide': unknown; 'ui.inject_style': unknown;
    'ui.action': { id: string; values?: Record<string, unknown> };
}

/** Escape hatch for sandboxed/dynamic adjunct code: weakly typed. */
export type CustomEventName = `custom.${string}`;
export type EventType = keyof EventMap | CustomEventName;
export type PayloadOf<K extends EventType> = K extends keyof EventMap ? EventMap[K] : unknown;

/** The single envelope every consumer sees. */
export interface WorldEvent<K extends EventType = EventType> {
    readonly type: K;
    readonly payload: PayloadOf<K>;
    /** Targeted routing: the entity this event is about. */
    readonly target?: EntityId;
    /** Stable content-address key (survives block reloads), see TargetKeys. */
    readonly targetKey?: string;
    /** The acting participant (multiplayer-ready; local player in single). */
    readonly actor?: EntityId;
    /** (frame, seq) is globally unique and totally ordered. */
    readonly frame: number;
    readonly seq: number;
    /** World mode AT EMIT TIME (gating uses this, not dispatch time). */
    readonly mode: SystemMode;
}

/** Boundary-only categories: never recorded/replayed/cross-worker. */
export const BOUNDARY_ONLY: ReadonlySet<string> = new Set([
    'ui.show_group', 'ui.show_button', 'ui.show_modal', 'ui.show_form', 'ui.show_toast',
    'ui.update_compass', 'ui.update_widget', 'ui.hide', 'ui.inject_style',
]);

export type Unsubscribe = () => void;
export interface EmitOptions { target?: EntityId; targetKey?: string; actor?: EntityId }
export interface SubOptions { target?: EntityId; key?: string; once?: boolean }
