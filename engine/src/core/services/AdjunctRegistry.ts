import { AdjunctDefinition } from '../types/Adjunct';
import { AdjunctBox } from '../../plugins/adjunct/basic_box';
import { AdjunctLight } from '../../plugins/adjunct/basic_light';
import { AdjunctTrigger } from '../../plugins/adjunct/adjunct_trigger';
import { BasicWallAdjunct } from '../../plugins/adjunct/basic_wall';
import { BasicConeAdjunct } from '../../plugins/adjunct/basic_cone';
import { BasicSphereAdjunct } from '../../plugins/adjunct/basic_sphere';
import { AdjunctModule } from '../../plugins/adjunct/basic_module';
import { AdjunctStop } from '../../plugins/adjunct/basic_stop';
import { AdjunctItem } from '../../plugins/adjunct/adjunct_item';
import { AdjunctParticle } from '../../plugins/adjunct/adjunct_particle';
import { BasicWaterAdjunct } from '../../plugins/adjunct/basic_water';
import { AdjunctLink } from '../../plugins/adjunct/adjunct_link';
import { AdjunctTrack } from '../../plugins/adjunct/adjunct_track';

/**
 * Registry of built-in (native) adjunct types, keyed by on-chain type-id.
 * Extracted from BlockSystem so block dispatch and dynamic resolution share one
 * source of truth.
 *
 * Type-ids match the Septopus chain adjunct set:
 *   a1 wall · a2 box · a3 light · a4 module(3D model) · a5 water · a6 cone
 *   · a7 ball(sphere) · b4 stop(collider) · b5 item(pickable)
 *   · b6 particle(SPP, expands to standard adjuncts) · b8 trigger
 *   · c1 track(tube rail; coaster) · e1 link(clickable URL / QR panel)
 */
export const BUILTIN_ADJUNCTS: ReadonlyMap<number, AdjunctDefinition> = new Map<number, AdjunctDefinition>([
    [0x00a1, BasicWallAdjunct as unknown as AdjunctDefinition],   // wall
    [0x00a2, AdjunctBox as unknown as AdjunctDefinition],         // box
    [0x00a3, AdjunctLight as unknown as AdjunctDefinition],       // light
    [0x00a4, AdjunctModule as unknown as AdjunctDefinition],      // module (3D model)
    [0x00a5, BasicWaterAdjunct as unknown as AdjunctDefinition],  // water (translucent)
    [0x00a6, BasicConeAdjunct as unknown as AdjunctDefinition],   // cone
    [0x00a7, BasicSphereAdjunct as unknown as AdjunctDefinition], // ball -> sphere
    [0x00b4, AdjunctStop as unknown as AdjunctDefinition],        // stop (invisible collider)
    [0x00b5, AdjunctItem as unknown as AdjunctDefinition],        // item (pickable)
    [0x00b6, AdjunctParticle as unknown as AdjunctDefinition],    // string particle (SPP)
    [0x00b8, AdjunctTrigger as unknown as AdjunctDefinition],     // trigger
    [0x00c1, AdjunctTrack as unknown as AdjunctDefinition],       // track (tube rail; coaster)
    [0x00e1, AdjunctLink as unknown as AdjunctDefinition],        // link / QR panel (clickable)
]);

export function getBuiltinAdjunct(typeId: number): AdjunctDefinition | undefined {
    return BUILTIN_ADJUNCTS.get(typeId);
}

/**
 * Dynamically-loaded adjunct definitions, keyed by the type-id they declare.
 * Populated at runtime by Engine.loadDynamicAdjunct (sandboxed code → descriptor
 * → AdjunctDefinition; see DynamicAdjunct.ts). Separate from BUILTIN_ADJUNCTS so
 * native types are immutable and a dynamic adjunct can never shadow one.
 */
const DYNAMIC_ADJUNCTS = new Map<number, AdjunctDefinition>();

/** Register a dynamic adjunct under its declared type-id. Refuses to override a
 *  built-in (those are the immutable native set). Last write wins for re-loads. */
export function registerDynamicAdjunct(typeId: number, definition: AdjunctDefinition): void {
    if (BUILTIN_ADJUNCTS.has(typeId)) {
        throw new Error(`[AdjunctRegistry] type-id 0x${typeId.toString(16)} is a built-in adjunct; dynamic adjuncts cannot override it`);
    }
    DYNAMIC_ADJUNCTS.set(typeId, definition);
}

export function getDynamicAdjunct(typeId: number): AdjunctDefinition | undefined {
    return DYNAMIC_ADJUNCTS.get(typeId);
}

/** Forget all dynamically-loaded definitions (reload / test isolation). */
export function clearDynamicAdjuncts(): void {
    DYNAMIC_ADJUNCTS.clear();
}

/**
 * Resolve an adjunct definition for a type-id: built-in first, then the dynamic
 * registry. This is the single dispatch entry point — BlockSystem / EditSystem
 * call it so block materialization reaches dynamic adjuncts identically to native
 * ones. Returns undefined when neither knows the type (caller falls back).
 */
export function getAdjunct(typeId: number): AdjunctDefinition | undefined {
    return BUILTIN_ADJUNCTS.get(typeId) ?? DYNAMIC_ADJUNCTS.get(typeId);
}

/**
 * Resolve the logic module for an adjunct type-id (built-in → dynamic).
 * Dynamic/chain-loaded code is registered via registerDynamicAdjunct after
 * sandboxed execution; before that a type resolves only if it is built-in.
 *
 * The phase-0 spec frames this as `AdjunctSystem.resolveLogicModule`; dispatch
 * actually happens at block-init time, so the resolver lives with the registry.
 */
export function resolveLogicModule(typeId: number): AdjunctDefinition | null {
    return getAdjunct(typeId) ?? null;
}
