import { AdjunctDefinition } from '../types/Adjunct';
import { AdjunctBox } from '../../plugins/adjunct/basic_box';
import { AdjunctLight } from '../../plugins/adjunct/basic_light';
import { AdjunctTrigger } from '../../plugins/adjunct/adjunct_trigger';
import { BasicWallAdjunct } from '../../plugins/adjunct/basic_wall';
import { BasicConeAdjunct } from '../../plugins/adjunct/basic_cone';
import { BasicSphereAdjunct } from '../../plugins/adjunct/basic_sphere';
import { AdjunctModule } from '../../plugins/adjunct/basic_module';

/**
 * Registry of built-in (native) adjunct types, keyed by on-chain type-id.
 * Extracted from BlockSystem so block dispatch and dynamic resolution share one
 * source of truth.
 *
 * Type-ids match the Septopus chain adjunct set:
 *   a1 wall · a2 box · a3 light · a4 module(3D model) · a6 cone · a7 ball(sphere)
 *   · b4 stop(unported) · b8 trigger
 */
export const BUILTIN_ADJUNCTS: ReadonlyMap<number, AdjunctDefinition> = new Map<number, AdjunctDefinition>([
    [0x00a1, BasicWallAdjunct as unknown as AdjunctDefinition],   // wall
    [0x00a2, AdjunctBox as unknown as AdjunctDefinition],         // box
    [0x00a3, AdjunctLight as unknown as AdjunctDefinition],       // light
    [0x00a4, AdjunctModule as unknown as AdjunctDefinition],      // module (3D model)
    [0x00a6, BasicConeAdjunct as unknown as AdjunctDefinition],   // cone
    [0x00a7, BasicSphereAdjunct as unknown as AdjunctDefinition], // ball -> sphere
    [0x00b8, AdjunctTrigger as unknown as AdjunctDefinition],     // trigger
]);

export function getBuiltinAdjunct(typeId: number): AdjunctDefinition | undefined {
    return BUILTIN_ADJUNCTS.get(typeId);
}

/**
 * Resolve the logic module for an adjunct type-id:
 *   1. built-in registry, else
 *   2. dynamic chain/IPFS load — stubbed to null until dynamic adjuncts ship
 *      (see AdjunctLoader; gated with chain integration), else
 *   3. caller falls back (BlockSystem renders a placeholder box).
 *
 * The phase-0 spec frames this as `AdjunctSystem.resolveLogicModule`; dispatch
 * actually happens at block-init time, so the resolver lives with the registry.
 */
export function resolveLogicModule(typeId: number): AdjunctDefinition | null {
    return getBuiltinAdjunct(typeId) ?? null;
}
