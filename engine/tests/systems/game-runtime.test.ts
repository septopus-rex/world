import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { SystemMode } from '../../src/core/types/SystemMode';
import { GameSetting } from '../../src/core/types/GameSetting';

// L3 — the Game Mode Protocol external-comm contract (protocol/cn/game.md §2/§3/§5),
// fully headless:
//   - entering a zone whose block.game resolves a GameSetting populates world.gameSetting
//   - entering Game mode opens a session and calls the whitelisted `start`
//   - leaving Game mode calls the whitelisted `end`
//   - a method NOT on the whitelist is refused before reaching the transport
//   - a bare playable zone (game flag, but no setting) starts no session

const TESTGAME_ID = 7;

const SETTING: GameSetting = {
    game: 'testgame',
    baseurl: 'https://test.local',
    methods: [
        { name: 'start' },
        { name: 'end' },
        { name: 'move' },
    ],
};

/** Records every external call (synchronously, at call entry) for assertion. */
class FakeGameApi {
    public calls: Array<{ game: string; method: string; params: any[] }> = [];
    async call(game: string, method: string, params: any[] = []): Promise<any> {
        this.calls.push({ game, method, params });
        if (method === 'start') return 'session-1';
        if (method === 'end') return { ended: true };
        return null;
    }
    methods(): string[] { return this.calls.map(c => c.method); }
}

/** Data source that serves the test Game Setting for TESTGAME_ID only. */
function dataSource(setting: GameSetting | null) {
    return new (class {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
        async view() { return null; }
        async module() { return {}; }
        async texture() { return {}; }
        async gameSetting(id: number): Promise<GameSetting | null> {
            return id === TESTGAME_ID ? setting : null;
        }
    })();
}

/** Let queued microtasks (async resolve + start/end .then) settle. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** Boot with the player standing on a playable block (raw[4] = game id). */
async function bootOnGameBlock(api: any, gameApi: any, gameId: number) {
    const { engine } = await makeHeadlessEngineWith({ api, gameApi });
    // Block raw: [elevation, status, adjuncts[], animations[], game]. raw[4] = gameId.
    engine.injectBlock({ x: 2048, y: 2048, world: 0, elevation: 0, adjuncts: [0, 1, [], [], gameId] });
    stepN(engine, 4); // GameZoneSystem detects the zone + emits zone_enter
    await flush();      // GameRuntimeSystem resolves the setting (async)
    stepN(engine, 1);
    return engine;
}

describe('GameRuntimeSystem — Game Setting resolution + start/end lifecycle', () => {
    it('resolves the block.game Game Setting on zone entry', async () => {
        const engine = await bootOnGameBlock(dataSource(SETTING), new FakeGameApi(), TESTGAME_ID);
        const world = engine.getWorld()!;
        expect(world.gameZoneActive).toBe(true);
        expect(world.gameSetting?.game).toBe('testgame');
    });

    it('calls the whitelisted `start` on entering Game and `end` on leaving', async () => {
        const api = new FakeGameApi();
        const engine = await bootOnGameBlock(dataSource(SETTING), api, TESTGAME_ID);
        const world = engine.getWorld()!;

        // Enter Game (zone-gated: allowed because we are in a zone).
        expect(engine.setMode(SystemMode.Game)).toBe(true);
        stepN(engine, 1);     // GameRuntimeSystem reads system.mode → start
        await flush();        // start resolves → rt.started = true, game.started emitted
        expect(api.methods()).toContain('start');
        expect(world.gameRuntime?.started).toBe(true);

        // Leave Game → end.
        expect(engine.setMode(SystemMode.Normal)).toBe(true);
        stepN(engine, 1);
        await flush();
        expect(api.methods()).toEqual(['start', 'end']);
        expect(world.gameRuntime).toBeNull();
    });

    it('refuses a method that is not on the GameSetting whitelist', async () => {
        const api = new FakeGameApi();
        const engine = await bootOnGameBlock(dataSource(SETTING), api, TESTGAME_ID);
        engine.setMode(SystemMode.Game);
        stepN(engine, 1);
        await flush();
        const rt = engine.getWorld()!.gameRuntime!;
        expect(rt.allows('move')).toBe(true);
        expect(rt.allows('hack')).toBe(false);
        await expect(rt.call('hack')).rejects.toThrow(/whitelist/);
        // The refused call never reached the transport.
        expect(api.methods()).not.toContain('hack');
    });

    it('starts NO session for a bare playable zone (game flag, no setting)', async () => {
        const api = new FakeGameApi();
        // dataSource returns null for the id → playable zone, but no game.
        const engine = await bootOnGameBlock(dataSource(null), api, TESTGAME_ID);
        const world = engine.getWorld()!;
        expect(world.gameZoneActive).toBe(true);   // still a zone
        expect(world.gameSetting).toBeNull();       // but no setting resolved
        engine.setMode(SystemMode.Game);
        stepN(engine, 1);
        await flush();
        expect(world.gameRuntime).toBeNull();        // no session opened
        expect(api.methods()).toHaveLength(0);       // no external call
    });
});
