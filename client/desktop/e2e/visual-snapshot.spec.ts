import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAP_DIR = path.resolve(__dirname, '../../../tmp/snap');

test.describe('3D Visual Snapshot Suite - Phase 4 Comprehensive Visual Captures', () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    test('01 - Palace Gate', async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto('/?level=palace&fx=high');
        await page.evaluate(() => {
            localStorage.clear();
            localStorage.setItem('septopus_fx', 'high');
        });
        await waitForWorldReady(page);
        await page.waitForTimeout(4000);
        await page.evaluate(() => (window as any).loader.engine.stop());
        await stepEngine(page, 90);
        await page.screenshot({ path: path.join(SNAP_DIR, '04_enhanced_palace_gate.png') });
    });

    test('02 - Palace Imperial Courtyard', async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto('/?level=palace&fx=high');
        await waitForWorldReady(page);
        await page.evaluate(() => {
            (window as any).loader.teleportSeptopus([2102, 1102], [8, 8, 1.2]);
        });
        await page.waitForTimeout(4000);
        await page.evaluate(() => (window as any).loader.engine.stop());
        await stepEngine(page, 90);
        await page.screenshot({ path: path.join(SNAP_DIR, '04_enhanced_palace_court.png') });
    });

    test('03 - Xianjian Village', async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto('/?level=xianjian&fx=high');
        await page.evaluate(() => {
            localStorage.clear();
            localStorage.setItem('septopus_fx', 'high');
        });
        await waitForWorldReady(page);
        await page.evaluate(() => {
            (window as any).loader.teleportSeptopus([2048, 2048], [8, 7.5, 1.2]);
        });
        await page.waitForTimeout(4000);
        await page.evaluate(() => (window as any).loader.engine.stop());
        await stepEngine(page, 90);
        await page.screenshot({ path: path.join(SNAP_DIR, '04_enhanced_xianjian_village.png') });
    });

    test('04 - Xianjian Mountain Path', async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto('/?level=xianjian&fx=high');
        await waitForWorldReady(page);
        await page.evaluate(() => {
            (window as any).loader.teleportSeptopus([2048, 2049], [8, 8, 4.2]);
        });
        await page.waitForTimeout(4000);
        await page.evaluate(() => (window as any).loader.engine.stop());
        await stepEngine(page, 90);
        await page.screenshot({ path: path.join(SNAP_DIR, '04_enhanced_xianjian_mountain.png') });
    });

    test('05 - Modular Prefab Showcase', async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto('/?level=modular&fx=high');
        await page.evaluate(() => {
            localStorage.clear();
            localStorage.setItem('septopus_fx', 'high');
        });
        await waitForWorldReady(page);
        await page.evaluate(() => {
            (window as any).loader.teleportSeptopus([2000, 2000], [8, 8, 1.2]);
        });
        await page.waitForTimeout(5000);
        await page.evaluate(() => (window as any).loader.engine.stop());
        await stepEngine(page, 90);
        await page.screenshot({ path: path.join(SNAP_DIR, '04_enhanced_modular_courtyard.png') });
    });

    test('06 - Exhibition Gallery', async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto('/?level=gallery&fx=high');
        await page.evaluate(() => {
            localStorage.clear();
            localStorage.setItem('septopus_fx', 'high');
        });
        await waitForWorldReady(page);
        await page.waitForTimeout(4000);
        await page.evaluate(() => (window as any).loader.engine.stop());
        await stepEngine(page, 90);
        await page.screenshot({ path: path.join(SNAP_DIR, '04_enhanced_gallery.png') });
    });
});
