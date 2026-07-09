import { registerItemTemplate, type ItemTemplate } from '../../src/core/services/ItemRegistry';
import demoItems from '../../../client/core/src/items/demo.items.json';

/** Register the demo item catalogue from the SAME client data document the
 *  browser loads (src/items/demo.items.json) — the engine ships no templates
 *  (item.md); tests mirror the host's registration. */
export function registerDemoItems(): void {
    for (const t of demoItems as unknown as ItemTemplate[]) registerItemTemplate(t);
}
