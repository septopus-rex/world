/** Septopus dev HOLD'EM server (7784) — the third Pattern-A game as its own
 *  physical service. Poker is the archetypal server-authoritative game (hidden
 *  hole cards, game.md §9) — the same HoldemGameApi the loopback runs, hosted
 *  per session; dual channel (HTTP + ws/live) via lib/game-host. */
import { serveGame } from '../lib/game-host';
import { HoldemGameApi } from '../../client/core/src/games/holdem/HoldemGameApi';

serveGame({ name: 'holdem', port: Number(process.env.PORT ?? 7784), makeApi: () => new HoldemGameApi() });
