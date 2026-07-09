/** Septopus dev POOL server (7785) — one game, one physical service
 *  (production reality: each game = its own operator's server). Hosts the
 *  same PoolGameApi the in-page loopback runs; wiring in lib/game-host. */
import { serveGame } from '../lib/game-host';
import { PoolGameApi } from '../../client/core/src/games/pool/PoolGameApi';

serveGame({ name: 'pool', port: Number(process.env.PORT ?? 7785), makeApi: () => new PoolGameApi() });
