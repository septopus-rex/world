import { test, expect } from '@playwright/test';
import { bootDeterministic, mainCanvas } from './helpers';

test('boots and renders the 3D world (canvas + no hard console errors)', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await bootDeterministic(page);

  const canvas = mainCanvas(page);
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  await page.screenshot({ path: 'e2e/__screenshots__/boot.png' });

  const hard = errors.filter((e) => !/favicon|sourcemap|service worker|workbox/i.test(e));
  expect(hard, `console errors:\n${hard.join('\n')}`).toEqual([]);
});
