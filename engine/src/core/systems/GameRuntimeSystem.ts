import { World, ISystem } from '../World';
import { reportError } from '../errors';
import { SystemMode } from '../types/SystemMode';
import { GameSetting } from '../types/GameSetting';
import { GameRuntime } from '../services/GameRuntime';
import { EventReader } from '../events/EventReader';

/**
 * GameRuntimeSystem — runs the Game Mode Protocol lifecycle (game.md §5) on top of
 * the zone gate. GameZoneSystem answers "is the player on a playable block?"; this
 * system answers "WHICH game, and talk to it":
 *
 *   game.zone_enter ─→ resolve GameSetting via dataSource.gameSetting(resourceId)
 *                       (the block's `game` field carries the resource id)
 *   system.mode→Game ─→ build GameRuntime + call whitelisted `start`  → game.started
 *   system.mode←Game ─→ call whitelisted `end`                        → game.ended
 *   game.zone_exit  ─→ drop the resolved setting
 *
 * The external call goes through GameRuntime (methods whitelist, §3) → the injected
 * IGameApi transport. The engine core performs no network/DOM itself. Resolution and
 * the start/end calls are async (a server round-trips); results surface as events on
 * a later frame, so the HUD/host reacts to game.started / game.ended rather than
 * polling.
 */
export class GameRuntimeSystem implements ISystem {
    private zoneEnter: EventReader<'game.zone_enter'> | null = null;
    private zoneExit: EventReader<'game.zone_exit'> | null = null;
    private modeReader: EventReader<'system.mode'> | null = null;

    /** Monotonic fetch token: a newer zone_enter invalidates an in-flight resolve. */
    private fetchSeq = 0;

    public update(world: World): void {
        if (!this.zoneEnter) {
            this.zoneEnter = world.events.reader('game.zone_enter');
            this.zoneExit = world.events.reader('game.zone_exit');
            this.modeReader = world.events.reader('system.mode');
        }

        // 1. Entered a zone → resolve its Game Setting (async; stored on resolve).
        for (const ev of this.zoneEnter.read()) {
            this.resolveSetting(world, ev.payload.game);
        }

        // 2. Left the zone → drop the setting (GameZoneSystem already forced mode
        //    back to Normal, which the mode handler below turns into an `end`).
        for (const _ev of this.zoneExit!.read()) {
            world.gameSetting = null;
            this.fetchSeq++; // cancel any in-flight resolve
        }

        // 3. Mode transitions → start / end the game session.
        for (const ev of this.modeReader!.read()) {
            const { mode, oldMode } = ev.payload;
            if (mode === SystemMode.Game && oldMode !== SystemMode.Game) {
                this.startGame(world);
            } else if (oldMode === SystemMode.Game && mode !== SystemMode.Game) {
                this.endGame(world);
            }
        }
    }

    /** Resolve `game` (a resource id) into a GameSetting via the data source. */
    private resolveSetting(world: World, gameRef: number): void {
        const ds: any = world.dataSource;
        if (!ds || typeof ds.gameSetting !== 'function') return; // host declares no game settings
        const seq = ++this.fetchSeq;
        Promise.resolve(ds.gameSetting(gameRef))
            .then((setting: GameSetting | null) => {
                if (seq !== this.fetchSeq) return;               // superseded by a newer zone
                world.gameSetting = setting ?? null;
            })
            .catch((e: unknown) => {
                if (seq === this.fetchSeq) world.gameSetting = null;
                reportError(e, { tag: '[GameRuntime]', severity: 'warn', id: `resolve setting ${gameRef}` });
            });
    }

    /** Enter Game: open a session against the resolved setting and call `start`. */
    private startGame(world: World): void {
        const setting = world.gameSetting;
        if (!setting) return;                                   // bare playable zone, no game
        const rt = new GameRuntime(setting, world.gameApi);
        world.gameRuntime = rt;
        if (!rt.allows('start')) {
            // No external API (pure-P2P game): the session is still "started",
            // engine triggers + future P2P drive it. Announce and stop.
            rt.started = true;
            world.events.emit('game.started', { game: setting.game, session: null });
            return;
        }
        rt.call('start', [])
            .then((session: any) => {
                if (world.gameRuntime !== rt) return;           // already left
                rt.session = session;
                rt.started = true;
                world.events.emit('game.started', { game: setting.game, session });
            })
            .catch((e: unknown) => reportError(e, { tag: '[GameRuntime]', severity: 'warn', id: 'start' }));
    }

    /** Leave Game: call `end` (if any) and tear the session down. */
    private endGame(world: World): void {
        const rt = world.gameRuntime;
        world.gameRuntime = null;
        if (!rt || !rt.started) return;
        const game = rt.game;
        const finish = (result: any) => world.events.emit('game.ended', { game, result });
        if (rt.allows('end')) {
            rt.call('end', [rt.session]).then(finish).catch((e: unknown) => {
                reportError(e, { tag: '[GameRuntime]', severity: 'warn', id: 'end' });
                finish(null);
            });
        } else {
            finish(null);
        }
    }
}
