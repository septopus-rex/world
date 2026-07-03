import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, waitForWorldReady } from './helpers';

/**
 * AI authoring end-to-end (spec docs/plan/specs/ai-authoring.md): chat input →
 * gateway → GenerationDoc → preview → build → reload-durable content.
 *
 * The gateway's provider comes from its environment: PROVIDER=mock (default,
 * deterministic, CI-safe) or PROVIDER=qwen + DASHSCOPE_API_KEY for a LIVE
 * LLM run of the exact same flows. Assertions are provider-agnostic — they
 * check world structure, not exact piece counts.
 */

/** Census of one block's adjunct entities (sources vs derived, max top alt). */
async function blockCensus(page: any, bx: number, by: number) {
  return page.evaluate(([x, y]: number[]) => {
    const w = (window as any).loader.engine.getWorld();
    let derived = 0, sources = 0, maxTop = 0;
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (!String(a?.adjunctId ?? '').startsWith(`adj_${x}_${y}_`)) continue;
      const s = a.stdData;
      if (s?.derivedFrom) {
        derived++;
        const t = w.getComponent(eid, 'TransformComponent');
        const top = t.position[1] + (s.z ?? 0) / 2;
        if (top > maxTop) maxTop = top;
      } else {
        sources++;
      }
    }
    return { derived, sources, maxTop: +maxTop.toFixed(2) };
  }, [bx, by]);
}

async function chatGenerate(page: any, prompt: string): Promise<[number, number]> {
  const target: [number, number] = await page.evaluate(() => (window as any).loader.aiTargetBlock());
  expect(target, 'an empty target block near spawn').toBeTruthy();

  await page.locator('[data-testid="author-toggle"]').click();
  await page.locator('[data-testid="author-input"]').fill(prompt);
  await page.locator('[data-testid="author-send"]').click();
  // Plan card appears once the gateway answers (mock: instant; qwen: seconds).
  await expect(page.locator('[data-testid="author-plan"]')).toBeVisible({ timeout: 60_000 });
  return target;
}

test('AI 造物:小村庄 — 聊天生成 → 预览 → 建造 → 重载存续', async ({ page }) => {
  test.setTimeout(300_000);
  await bootDeterministic(page);

  const [bx, by] = await chatGenerate(page, '帮我做一个有路有房子的小村庄');
  await page.locator('[data-testid="author-preview"]').click();
  await stepEngine(page, 10);

  const preview = await blockCensus(page, bx, by);
  // A village: several motif sources (houses+roads) expanding into many pieces.
  expect(preview.sources, 'authored source rows (houses/roads/light)').toBeGreaterThanOrEqual(3);
  expect(preview.derived, 'derived pieces (walls/roofs/road strips)').toBeGreaterThanOrEqual(12);
  await page.screenshot({ path: 'e2e/__screenshots__/ai-village-preview.png' });

  await page.locator('[data-testid="author-build"]').click();
  await expect(page.locator('[data-testid="author-status"]')).toContainText('已建造');

  await page.reload();
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 30);
  const after = await blockCensus(page, bx, by);
  expect(after.derived, 'village survives a reload (draft → re-expansion)').toBeGreaterThanOrEqual(preview.derived);
});

test('AI 造物:五层小楼 — 楼梯楼板齐全,高度到位,重载存续', async ({ page }) => {
  test.setTimeout(300_000);
  await bootDeterministic(page);

  const [bx, by] = await chatGenerate(page, '建一个带楼梯可以上下的5层小楼');
  await page.locator('[data-testid="author-preview"]').click();
  await stepEngine(page, 10);

  const preview = await blockCensus(page, bx, by);
  // 5 storeys of walls + slabs + two flights per storey gap ⇒ dozens of pieces,
  // and the roofline tops out at ≥ 5 × min floorHeight.
  expect(preview.derived, 'building pieces (walls/slabs/treads)').toBeGreaterThanOrEqual(50);
  expect(preview.maxTop, 'roofline of a 5-storey building').toBeGreaterThanOrEqual(12);
  await page.screenshot({ path: 'e2e/__screenshots__/ai-building-preview.png' });

  await page.locator('[data-testid="author-build"]').click();
  await expect(page.locator('[data-testid="author-status"]')).toContainText('已建造');

  await page.reload();
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 30);
  const after = await blockCensus(page, bx, by);
  expect(after.derived).toBeGreaterThanOrEqual(50);
  expect(after.maxTop).toBeGreaterThanOrEqual(12);
});
