import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

async function sourceLoaded(page: any): Promise<boolean> {
    return page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (a?.stdData?.typeId === 0x00b6 && String(a.adjunctId ?? '').includes('2047_2049')) return true;
        }
        return false;
    });
}

async function waitForTexturesAndRender(page: any) {
    for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(200);
        await stepEngine(page, 5);
    }
}

test('SPP Oriental stylepack showcase', async ({ page }) => {
    test.setTimeout(120_000);
    await bootDeterministic(page);
    await page.getByTestId('enter-sandbox').click();
    await expect(page.getByTestId('sandbox-bar')).toBeVisible();
    for (let i = 0; i < 40 && !(await sourceLoaded(page)); i++) await stepEngine(page, 10);

    const btn = page.getByTestId('spp-style-oriental');
    await expect(btn).toBeVisible();
    await btn.click();
    await waitForTexturesAndRender(page);
    await page.screenshot({ path: 'test-results/showcase-style-oriental-after.png' });
});

test('SPP Cyber stylepack showcase', async ({ page }) => {
    test.setTimeout(120_000);
    await bootDeterministic(page);
    await page.getByTestId('enter-sandbox').click();
    await expect(page.getByTestId('sandbox-bar')).toBeVisible();
    for (let i = 0; i < 40 && !(await sourceLoaded(page)); i++) await stepEngine(page, 10);

    const btn = page.getByTestId('spp-style-cyber');
    await expect(btn).toBeVisible();
    await btn.click();
    await waitForTexturesAndRender(page);
    await page.screenshot({ path: 'test-results/showcase-style-cyber-after.png' });
});

test('SPP Dungeon stylepack showcase', async ({ page }) => {
    test.setTimeout(120_000);
    await bootDeterministic(page);
    await page.getByTestId('enter-sandbox').click();
    await expect(page.getByTestId('sandbox-bar')).toBeVisible();
    for (let i = 0; i < 40 && !(await sourceLoaded(page)); i++) await stepEngine(page, 10);

    const btn = page.getByTestId('spp-style-dungeon');
    await expect(btn).toBeVisible();
    await btn.click();
    await waitForTexturesAndRender(page);
    await page.screenshot({ path: 'test-results/showcase-style-dungeon-after.png' });
});

test('SPP Modern stylepack showcase', async ({ page }) => {
    test.setTimeout(120_000);
    await bootDeterministic(page);
    await page.getByTestId('enter-sandbox').click();
    await expect(page.getByTestId('sandbox-bar')).toBeVisible();
    for (let i = 0; i < 40 && !(await sourceLoaded(page)); i++) await stepEngine(page, 10);

    const btn = page.getByTestId('spp-style-modern');
    await expect(btn).toBeVisible();
    await btn.click();
    await waitForTexturesAndRender(page);
    await page.screenshot({ path: 'test-results/showcase-style-modern-after.png' });
});
