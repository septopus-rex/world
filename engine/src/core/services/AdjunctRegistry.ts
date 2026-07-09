import { AdjunctDefinition } from '../types/Adjunct';
import { AdjunctType } from '../types/AdjunctType';
import { AdjunctBox } from '../../plugins/adjunct/basic_box';
import { AdjunctLight } from '../../plugins/adjunct/basic_light';
import { AdjunctTrigger } from '../../plugins/adjunct/adjunct_trigger';
import { BasicWallAdjunct } from '../../plugins/adjunct/basic_wall';
import { BasicConeAdjunct } from '../../plugins/adjunct/basic_cone';
import { BasicSphereAdjunct } from '../../plugins/adjunct/basic_sphere';
import { AdjunctModule } from '../../plugins/adjunct/basic_module';
import { AdjunctStop } from '../../plugins/adjunct/basic_stop';
import { AdjunctItem } from '../../plugins/adjunct/adjunct_item';
import { AdjunctSpp } from '../../plugins/adjunct/adjunct_spp';
import { BasicWaterAdjunct } from '../../plugins/adjunct/basic_water';
import { AdjunctLink } from '../../plugins/adjunct/adjunct_link';
import { AdjunctTrack } from '../../plugins/adjunct/adjunct_track';
import { AdjunctMotif } from '../../plugins/adjunct/adjunct_motif';
import { AdjunctAudio } from '../../plugins/adjunct/adjunct_audio';
import { AdjunctVideo } from '../../plugins/adjunct/adjunct_video';
import { AdjunctBook } from '../../plugins/adjunct/adjunct_book';
import { AdjunctBoard } from '../../plugins/adjunct/adjunct_board';
import { AdjunctSpawner } from '../../plugins/adjunct/adjunct_spawner';
import { AdjunctNpc } from '../../plugins/adjunct/adjunct_npc';
import { AdjunctError } from '../errors';

/**
 * Registry of built-in (native) adjunct types, keyed by on-chain type-id.
 * Extracted from BlockSystem so block dispatch and dynamic resolution share one
 * source of truth.
 *
 * Type-ids match the Septopus chain adjunct set:
 *   a1 wall · a2 box · a3 light · a4 module(3D model) · a5 water · a6 cone
 *   · a7 ball(sphere) · b4 stop(collider) · b5 item(pickable)
 *   · b6 spp(SPP source, expands to standard adjuncts) · b8 trigger
 *   · b9 spawner(timed runtime generator) · ba npc(autonomous agent)
 *   · c1 track(tube rail; coaster) · c2 motif(generative content)
 *   · e1 link(clickable URL / QR panel) · e2 audio(spatial emitter)
 *   · e3 video(VideoTexture screen) · e4 book(paged-text reader)
 */
export const BUILTIN_ADJUNCTS: ReadonlyMap<number, AdjunctDefinition> = new Map<number, AdjunctDefinition>([
    [AdjunctType.Wall, BasicWallAdjunct as unknown as AdjunctDefinition],     // wall
    [AdjunctType.Box, AdjunctBox as unknown as AdjunctDefinition],            // box
    [AdjunctType.Light, AdjunctLight as unknown as AdjunctDefinition],        // light
    [AdjunctType.Module, AdjunctModule as unknown as AdjunctDefinition],      // module (3D model)
    [AdjunctType.Water, BasicWaterAdjunct as unknown as AdjunctDefinition],   // water (translucent)
    [AdjunctType.Cone, BasicConeAdjunct as unknown as AdjunctDefinition],     // cone
    [AdjunctType.Ball, BasicSphereAdjunct as unknown as AdjunctDefinition],   // ball -> sphere
    [AdjunctType.Stop, AdjunctStop as unknown as AdjunctDefinition],          // stop (invisible collider)
    [AdjunctType.Item, AdjunctItem as unknown as AdjunctDefinition],          // item (pickable)
    [AdjunctType.Spp, AdjunctSpp as unknown as AdjunctDefinition],  // SPP source (string-particle chunk)
    [AdjunctType.Trigger, AdjunctTrigger as unknown as AdjunctDefinition],    // trigger
    [AdjunctType.Track, AdjunctTrack as unknown as AdjunctDefinition],        // track (tube rail; coaster)
    [AdjunctType.Motif, AdjunctMotif as unknown as AdjunctDefinition],        // motif (generative content)
    [AdjunctType.Link, AdjunctLink as unknown as AdjunctDefinition],          // link / QR panel (clickable)
    [AdjunctType.Audio, AdjunctAudio as unknown as AdjunctDefinition],        // spatial audio emitter
    [AdjunctType.Video, AdjunctVideo as unknown as AdjunctDefinition],        // video screen (VideoTexture)
    [AdjunctType.Book, AdjunctBook as unknown as AdjunctDefinition],          // book / paged-text reader (clickable)
    [AdjunctType.Board, AdjunctBoard as unknown as AdjunctDefinition],         // board / server-backed message wall (clickable)
    [AdjunctType.Spawner, AdjunctSpawner as unknown as AdjunctDefinition],    // timed runtime generator (F1)
    [AdjunctType.Npc, AdjunctNpc as unknown as AdjunctDefinition],            // autonomous agent (F2)
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
        throw new AdjunctError(`[AdjunctRegistry] type-id 0x${typeId.toString(16)} is a built-in adjunct; dynamic adjuncts cannot override it`, { code: 'ADJUNCT_REGISTRY' });
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
