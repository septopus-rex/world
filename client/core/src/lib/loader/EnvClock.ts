/**
 * EnvClock — the mock chain-height clock, extracted from DesktopLoader (2026-07
 * god-object split). The engine is chain-decoupled, so there is no real slot
 * feed; the old engine derived time+weather from each new block height + hash.
 * Here a ticker bumps a synthetic height every few seconds and feeds it to
 * EnvironmentSystem, so the sun arcs across a ~2-minute day/night cycle and
 * weather cycles. Replace with a real chain-height subscription when the chain
 * plugin ships.
 */
export class EnvClock {
    private height = 0;
    private timer: ReturnType<typeof setInterval> | null = null;
    private static readonly TICK_MS = 2000;
    private static readonly INTERVAL = 1440; // game-seconds per tick (24 game-min) → ~120s/day

    /** @param feed sink for each tick — Engine.feedChainState(height, hash, interval). */
    constructor(private feed: (height: number, hash: string, intervalSeconds: number) => void) {}

    public start(): void {
        if (this.timer) return;
        const tick = () => {
            this.height += 1;
            this.feed(this.height, EnvClock.mockHash(this.height), EnvClock.INTERVAL);
        };
        tick(); // kick once so time starts advancing from boot, not after the first delay
        this.timer = setInterval(tick, EnvClock.TICK_MS);
    }

    /**
     * Synthetic block hash whose weather slices (chars 12–15, per
     * EnvironmentSystem.simulateWeatherHash) cycle clear → cloud → rain → snow
     * every 10 ticks, so weather visibly changes in the no-chain client.
     */
    private static mockHash(height: number): string {
        const catIdx = Math.floor(height / 10) % 4;          // 0 clear · 1 cloud · 2 rain · 3 snow
        const catHex = catIdx.toString(16).padStart(2, '0'); // occupies hash chars [12,13]
        return '0x' + 'a'.repeat(10) + catHex + '02' + 'a'.repeat(48);
    }
}
