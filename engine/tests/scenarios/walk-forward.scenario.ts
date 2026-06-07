import { defineScenario } from './_runner';

// An explicit, declarative behavioral test case — the authoring format for
// engine execution scenarios. Add a file like this per case; the harness runs it.
export default defineScenario({
  name: 'walk forward 1s -> player moves north (+Y in SPP)',
  world: { blocks: ['flat@2048,2048'] },                 // fixture ref
  player: { block: [2048, 2048], position: [8, 8, 1] },
  steps: [
    { ticks: 60, input: { forward: true } },             // 60 ticks * (1/60)s = 1s
  ],
  expect: (w) => {
    if (!(w.player.position[1] > 8)) {
      throw new Error(`expected player to move north, got Y=${w.player.position[1]}`);
    }
  },
});
