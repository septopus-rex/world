/** Septopus dev MAHJONG server (7787) — one game, one physical service
 *  (production reality: each game = its own operator's server). Hosts the
 *  same MahjongGameApi the in-page loopback runs; wiring in lib/game-host. */
import { serveGame } from '../lib/game-host';
import { MahjongGameApi } from '../../client/core/src/games/mahjong/MahjongGameApi';

serveGame({ name: 'mahjong', port: Number(process.env.PORT ?? 7787), makeApi: () => new MahjongGameApi() });
