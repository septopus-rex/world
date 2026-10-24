/**
 * Pure build: no land registry. The `@land-plugin` alias points here unless the
 * shell is built with SEPTOPUS_LAND=solana (then → client/chain/src/index.ts).
 * Keeping this a real module (not a missing import) means the pure bundle has
 * exactly zero chain code and zero `@solana/*` — verified by grep on dist/.
 */
import type { LandConfig, ILandRegistry } from './types';

export const LAND_PLUGIN = 'none';

export async function createLandRegistry(_cfg: LandConfig): Promise<ILandRegistry | null> {
    return null;
}
