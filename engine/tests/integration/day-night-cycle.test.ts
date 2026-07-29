import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';

// ─── Does the world come back from night? (2026-07-29) ──────────────────────
//
// Reported symptom: "once it gets dark it stays dark forever". The sub-day clock
// already had a test (environment-clock.test.ts) proving hour/minute advance —
// but a running clock proves nothing about the LIGHT, which is what a player
// sees. Three separate things sit between the clock and the screen, and any of
// them could pin the scene at night while the clock keeps ticking:
//   · the visual sun angle CHASES the clock (a chase that never converges, or
//     converges to the wrong branch, freezes the sun wherever it is);
//   · dayFactor is a smoothstep over a narrow twilight band of sun ELEVATION,
//     so a sign error there gives a permanent midnight with a moving clock;
//   · the sky/IBL/player-fill all read that one factor.
//
// So this walks a full cycle and asserts the LIGHT comes back, not just the
// clock. It also pins the shape of the cycle — the answer to "it feels like it
// is always night" turned out to be that night is genuinely half the cycle.

/** Sample dayFactor + hour across `cycles` full local days. */
function sample(engine: any, daySeconds: number, samples: number) {
    const env = engine.getWorld()!.systems.findSystemByName('EnvironmentSystem') as any;
    const eid = engine.getWorld()!.getEntitiesWith(['EnvironmentStateComponent'])[0];
    const state = engine.getWorld()!.getComponent<any>(eid, 'EnvironmentStateComponent');
    const out: Array<{ hour: number; dayF: number }> = [];
    const stepsPerSample = Math.max(1, Math.round((daySeconds / samples) * 60));
    for (let i = 0; i < samples; i++) {
        stepN(engine, stepsPerSample, 1 / 60);
        out.push({ hour: state.hour, dayF: env.dayFactor });
    }
    return out;
}

describe('day/night — the light comes back (not just the clock)', () => {
    it('runs a full cycle: full day → full night → full day again', async () => {
        const engine = await makeHeadlessEngine();
        // 40 simulated seconds per day, as in environment-clock.test.ts — the
        // cycle's SHAPE is what is under test, and it is rate-independent.
        (engine.getWorld()! as any).config.time = { localDaySeconds: 40 };

        const trace = sample(engine, 40, 48);          // 48 samples over one day
        const dayFs = trace.map((s) => s.dayF);
        expect(Math.max(...dayFs), 'reaches full daylight').toBeGreaterThan(0.99);
        expect(Math.min(...dayFs), 'reaches full night').toBeLessThan(0.01);

        // The actual complaint: after the minimum, does it climb back? Find the
        // darkest sample and require real daylight strictly after it.
        const darkest = dayFs.indexOf(Math.min(...dayFs));
        const after = dayFs.slice(darkest + 1);
        expect(Math.max(...after), `stuck at night from sample ${darkest}: ${JSON.stringify(trace)}`)
            .toBeGreaterThan(0.99);
    });

    it('night is HALF the cycle — the "always dark" feeling is the pacing, not a freeze', async () => {
        const engine = await makeHeadlessEngine();
        (engine.getWorld()! as any).config.time = { localDaySeconds: 40 };
        const trace = sample(engine, 40, 96);
        const dark = trace.filter((s) => s.dayF < 0.5).length / trace.length;
        // Sun below the horizon for half of every cycle, and the twilight band is
        // narrow (±0.12 in sin units ≈ 1.8 h), so it is a hard-edged night rather
        // than a long dusk. At the default localDaySeconds=600 that is 5 real
        // minutes of darkness at a stretch — which is the report.
        expect(dark).toBeGreaterThan(0.4);
        expect(dark).toBeLessThan(0.6);
    });

    it('the clock keeps advancing THROUGH the night (no stall at the wrap)', async () => {
        const engine = await makeHeadlessEngine();
        (engine.getWorld()! as any).config.time = { localDaySeconds: 40 };
        const trace = sample(engine, 40, 48);
        // Midnight is where localSeconds wraps modulo a day — a wrap bug would
        // park the hour there while dayFactor sits at 0.
        const hours = new Set(trace.map((s) => s.hour));
        expect(hours.size, `hours seen: ${[...hours].join(',')}`).toBeGreaterThan(12);
        expect(hours.has(0), 'passes through midnight').toBe(true);
    });

    it('environmentInfo() reports the same day factor the lights use', async () => {
        const engine = await makeHeadlessEngine();
        (engine.getWorld()! as any).config.time = { localDaySeconds: 40 };
        stepN(engine, 60, 1 / 60);
        const info = engine.environmentInfo()!;
        const env = engine.getWorld()!.systems.findSystemByName('EnvironmentSystem') as any;
        expect(info).not.toBeNull();
        expect(info.dayFactor).toBe(env.dayFactor);
        expect(info.hour).toBeGreaterThanOrEqual(0);
        expect(info.hour).toBeLessThan(24);
        expect(info.weather).toBe('clear');
    });
});
