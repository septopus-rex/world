import { describe, it, expect } from 'vitest';
import { BUILTIN_ADJUNCTS, getBuiltinAdjunct, resolveLogicModule } from '../../src/core/services/AdjunctRegistry';

// L1 — the shared adjunct registry that BlockSystem dispatches through.

describe('AdjunctRegistry', () => {
  it('registers the 8 native adjuncts by chain type-id', () => {
    expect([...BUILTIN_ADJUNCTS.keys()].sort((a, b) => a - b)).toEqual([
      0x00a1, 0x00a2, 0x00a3, 0x00a4, 0x00a6, 0x00a7, 0x00b4, 0x00b8,
    ]);
  });

  it('every registered definition has deserialize + a transform (else BlockSystem skips it)', () => {
    for (const [, def] of BUILTIN_ADJUNCTS) {
      expect(typeof def.attribute?.deserialize).toBe('function');
      const t: any = def.transform;
      expect(typeof (t?.stdToRenderData ?? t?.std_3d ?? t?.raw_std)).toBe('function');
    }
  });

  it('getBuiltinAdjunct resolves wall (0x00a1)', () => {
    expect(getBuiltinAdjunct(0x00a1)).toBeTruthy();
  });

  it('resolveLogicModule returns null for an unknown type-id (caller falls back)', () => {
    expect(resolveLogicModule(0xdead)).toBeNull();
  });

  it('resolveLogicModule resolves a builtin (box 0x00a2)', () => {
    expect(resolveLogicModule(0x00a2)).toBeTruthy();
  });
});
