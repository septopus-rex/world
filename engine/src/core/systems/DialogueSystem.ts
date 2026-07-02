import jsonLogic from 'json-logic-js';
import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';
import type { EventReader } from '../events/EventReader';
import { reportError } from '../errors';

/** The world-level single active conversation (dialogue spec §2). */
export interface ActiveDialogue {
    npcEid: EntityId;
    adjunctId: string;
    doc: any;
    nodeId: string;
    /** Indices (into the node's raw options) of the currently VISIBLE options —
     *  chooseDialogue(i) counts against this filtered list. */
    visible: number[];
}

const TALK_RANGE = 3.5;

/**
 * DialogueSystem — the tree-walking state machine for NPC dialogue documents
 * (F4, spec docs/plan/specs/dialogue-quests.md). The tree is DATA (nodes /
 * JSONLogic-gated options / actuator actions); this system only walks it:
 * zero new execution primitives.
 *
 * Start: interact.primary on a talkable ba NPC. Advance: Engine.chooseDialogue
 * (host UI renders text+options from the events and calls back — pure view).
 */
export class DialogueSystem implements ISystem {
    private interactReader: EventReader<'interact.primary'> | null = null;

    public update(world: World, _dt: number): void {
        if (!this.interactReader && (world as any).events?.reader) {
            this.interactReader = world.events.reader('interact.primary');
        }
        if (!this.interactReader) return;
        for (const ev of this.interactReader.read()) this.onInteract(world, ev as any);
    }

    private onInteract(world: World, ev: any): void {
        const targetEid = ev?.target;
        if (targetEid == null) return;
        if ((world as any).activeDialogue) return; // one conversation at a time
        if ((ev.payload?.distance ?? 0) > TALK_RANGE) return;

        const adj = world.getComponent<AdjunctComponent>(targetEid, "AdjunctComponent");
        if (adj?.stdData?.typeId !== AdjunctType.Npc) return;
        const doc = adj.stdData?.dialogue;
        if (!doc) return;
        if (typeof doc.start !== 'string' || !doc.nodes?.[doc.start]) {
            reportError(`[dialogue] '${adj.adjunctId}' has a malformed dialogue document`, {
                tag: '[DialogueSystem]', severity: 'warn', id: String(adj.adjunctId),
            });
            return;
        }

        const active: ActiveDialogue = {
            npcEid: targetEid, adjunctId: String(adj.adjunctId), doc, nodeId: doc.start, visible: [],
        };
        (world as any).activeDialogue = active;
        this.enterNode(world, active, 'dialogue.started');
    }

    /** (Re)compute visible options for the current node + emit the node event. */
    private enterNode(world: World, active: ActiveDialogue, eventName: 'dialogue.started' | 'dialogue.node'): void {
        const node = active.doc.nodes[active.nodeId];
        const ctx = this.conditionCtx(world);
        active.visible = [];
        const labels: string[] = [];
        const options: any[] = Array.isArray(node.options) ? node.options : [];
        options.forEach((o, i) => {
            let show = true;
            if (o?.when != null) {
                try { show = !!jsonLogic.apply(o.when, ctx); }
                catch (e) { show = false; reportError(e, { tag: '[DialogueSystem]', severity: 'warn' }); }
            }
            if (show) { active.visible.push(i); labels.push(String(o?.label ?? '…')); }
        });
        world.events?.emit?.(eventName, {
            adjunctId: active.adjunctId, nodeId: active.nodeId,
            text: String(node.text ?? ''), options: labels,
        });
    }

    /** Choose the i-th VISIBLE option: run its actions, advance or end.
     *  Called through World/Engine facade (host UI callback). */
    public choose(world: World, visibleIndex: number): void {
        const active = (world as any).activeDialogue as ActiveDialogue | null;
        if (!active) return;
        const node = active.doc.nodes[active.nodeId];
        const rawIndex = active.visible[visibleIndex];
        const option = Array.isArray(node?.options) ? node.options[rawIndex] : null;
        if (!option) return;

        if (Array.isArray(option.actions)) {
            const players = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
            for (const a of option.actions) {
                world.actuator.execute(a, {
                    world, playerId: players[0] ?? null, mode: world.mode, sourceEntity: active.npcEid,
                });
            }
        }

        const to = option.to;
        if (typeof to === 'string' && active.doc.nodes?.[to]) {
            active.nodeId = to;
            this.enterNode(world, active, 'dialogue.node');
        } else {
            this.end(world);
        }
    }

    public end(world: World): void {
        const active = (world as any).activeDialogue as ActiveDialogue | null;
        if (!active) return;
        (world as any).activeDialogue = null;
        world.events?.emit?.('dialogue.ended', { adjunctId: active.adjunctId });
    }

    private conditionCtx(world: World): any {
        const players = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
        const inventory: Record<string, number> = {};
        const inv = players[0] !== undefined
            ? world.getComponent<{ items?: { id: string; quantity?: number }[] }>(players[0], "InventoryComponent") : null;
        if (inv?.items) for (const it of inv.items) inventory[it.id] = (inventory[it.id] ?? 0) + (it.quantity ?? 0);
        return { flags: world.globalFlags, inventory, time: world.time, weather: world.weather };
    }
}
