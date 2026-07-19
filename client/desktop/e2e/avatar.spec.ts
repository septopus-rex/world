import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// Avatar skeletal-animation regression: the rigged avatar.glb (model 30) used to
// fail with "tracks[i].createInterpolant is not a function" — AnimationClips were
// carried through cloned userData, which Object3D.copy JSON-mangles — and the
// player silently kept the placeholder box. Clips are now first-class on the
// ResourceManager entry.

test('rigged avatar loads with animations (no placeholder fallback)', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'warning' || msg.type() === 'error') warnings.push(msg.text());
  });

  await bootDeterministic(page);
  // The swap is async (fetch + GLTF decode) — give it real time, then step to render.
  await page.waitForTimeout(2000);
  await stepEngine(page, 10);

  const avatar = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const players = w.getEntitiesWith(['AvatarComponent']);
    const av = players.length ? w.getComponent(players[0], 'AvatarComponent') : null;
    const handle = av?.handle;
    let skinned = 0;
    handle?.traverse?.((o: any) => { if (o.isSkinnedMesh) skinned++; });
    return {
      isModelInstance: !!handle?.userData?.isModelInstance,
      clipCount: handle?.userData?.animations?.length ?? 0,
      skinnedMeshes: skinned,
      // The mixer lives in render/AvatarAnimator (it used to be a private map on
      // RenderEngine, and this probe silently read undefined after the move).
      // avatarInfo() is the supported debug surface for the running state machine.
      anim: (window as any).loader.engine.avatarInfo?.() ?? null,
    };
  });

  const avatarFailures = warnings.filter(t => t.includes('[Avatar]') && t.includes('FAILED'));
  expect(avatarFailures, avatarFailures.join('\n')).toHaveLength(0);
  expect(avatar.isModelInstance, 'placeholder box should have been swapped for the model').toBe(true);
  expect(avatar.skinnedMeshes).toBeGreaterThan(0);
  expect(avatar.clipCount, 'decoded AnimationClips should ride the instance').toBeGreaterThan(0);
  expect(avatar.anim?.activeClip, 'an AnimationMixer should be driving the avatar').toBeTruthy();
  expect(avatar.anim?.activeRunning, 'and its action should actually be running').toBe(true);
});
