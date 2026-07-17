import { describe, it, expect } from 'vitest';
import { resolveAvatarPhysique } from '../../src/core/EntityFactory';

// The visual-physique contract (protocol player.md §3): the avatar DECLARES its
// body (height = model scale target, eyeHeight = camera), the world CLAMPS it
// (physique.avatarHeightRange), the world baseline fills every gap. Physics
// never reads any of this — resolveAvatarPhysique is the single pure seam.

const cfg = (physique: any = {}) => ({ player: { physique: { height: 1.8, eyeHeight: 1.7, ...physique } } });

describe('resolveAvatarPhysique — 声明制视觉体格', () => {
    it('无声明 → 世界基线原样(高/眼都不动)', () => {
        expect(resolveAvatarPhysique(cfg(), undefined)).toEqual({ height: 1.8, eyeHeight: 1.7 });
        expect(resolveAvatarPhysique(cfg(), null)).toEqual({ height: 1.8, eyeHeight: 1.7 });
        expect(resolveAvatarPhysique(cfg(), {})).toEqual({ height: 1.8, eyeHeight: 1.7 });
    });

    it('完整声明 → 按声明值(默认夹取区间 [0.5, 3] 内)', () => {
        expect(resolveAvatarPhysique(cfg(), { height: 2.2, eyeHeight: 2.0 }))
            .toEqual({ height: 2.2, eyeHeight: 2.0 });
    });

    it('只声明身高 → 眼高按基线比例推导(1.7/1.8),相机自动落在脸部', () => {
        const r = resolveAvatarPhysique(cfg(), { height: 0.9 });
        expect(r.height).toBe(0.9);
        expect(r.eyeHeight).toBeCloseTo(0.9 * (1.7 / 1.8), 10);
    });

    it('只声明眼高 → 身高留在基线,眼高用声明值', () => {
        expect(resolveAvatarPhysique(cfg(), { eyeHeight: 1.5 }))
            .toEqual({ height: 1.8, eyeHeight: 1.5 });
    });

    it('世界夹取:默认区间 [0.5, 3] 掐掉极端声明;眼永远不高于头顶', () => {
        expect(resolveAvatarPhysique(cfg(), { height: 50 }).height).toBe(3.0);
        expect(resolveAvatarPhysique(cfg(), { height: 0.05 }).height).toBe(0.5);
        // eye above the head clamps down to the (clamped) height
        expect(resolveAvatarPhysique(cfg(), { height: 1.6, eyeHeight: 9 }).eyeHeight).toBe(1.6);
    });

    it('世界可覆盖夹取区间(physique.avatarHeightRange)', () => {
        const c = cfg({ avatarHeightRange: [1.5, 2.0] });
        expect(resolveAvatarPhysique(c, { height: 1.0 }).height).toBe(1.5);
        expect(resolveAvatarPhysique(c, { height: 2.5 }).height).toBe(2.0);
        expect(resolveAvatarPhysique(c, { height: 1.8 }).height).toBe(1.8);
    });

    it('非法声明(NaN/0/负数)视同未声明,回退基线', () => {
        expect(resolveAvatarPhysique(cfg(), { height: NaN, eyeHeight: -1 }))
            .toEqual({ height: 1.8, eyeHeight: 1.7 });
        expect(resolveAvatarPhysique(cfg(), { height: 0 }).height).toBe(1.8);
    });

    it('配置缺 physique 段 → 引擎缺省 1.8/1.7 兜底', () => {
        expect(resolveAvatarPhysique({}, undefined)).toEqual({ height: 1.8, eyeHeight: 1.7 });
        expect(resolveAvatarPhysique({}, { height: 2.2 }).height).toBe(2.2);
    });
});
