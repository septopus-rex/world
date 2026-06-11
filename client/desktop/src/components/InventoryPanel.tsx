import { useEffect, useState } from 'react';
import { getItemTemplate, deriveItemAttributes, Rarity } from '@engine/core/services/ItemRegistry';

interface BagItem {
    id: string;
    quantity: number;
    metadata?: { templateId?: number; seed?: number };
}

const RARITY_LABEL = ['', '★', '★★', '★★★', '★★★★'];
const RARITY_CLASS = [
    'text-gray-300', 'text-green-300', 'text-cyan-300', 'text-purple-300', 'text-amber-300',
];

function describe(item: BagItem) {
    const templateId = item.metadata?.templateId
        ?? Number(/^(?:tpl|itm)_(\d+)/.exec(item.id)?.[1] ?? NaN);
    const template = Number.isFinite(templateId) ? getItemTemplate(templateId) : undefined;
    const name = template?.name ?? item.id;

    let rarity: Rarity = Rarity.Common;
    let attrs: Record<string, number> = {};
    if (template && template.stackable === 0) {
        const derived = deriveItemAttributes(template, item.metadata?.seed ?? 0);
        rarity = derived.rarity;
        attrs = derived.attributes;
    }
    return { name, rarity, attrs };
}

/**
 * Minimal bag panel — consumes the engine's inventory_updated events.
 * Appears when the bag has anything in it; DROP puts the item back into the
 * world at the player's feet (atomic, persisted as a block draft).
 */
export function InventoryPanel({ loader }: { loader: any }) {
    const [items, setItems] = useState<BagItem[]>([]);

    useEffect(() => {
        if (!loader?.engine) return;
        // Pull the current bag once at mount — the restore event (hydrateDrafts)
        // may have fired before this panel subscribed.
        const world = loader.engine.getWorld();
        if (world) {
            const ids = world.queryEntities('InventoryComponent', 'InputStateComponent');
            if (ids.length > 0) {
                setItems([...(world.getComponent(ids[0], 'InventoryComponent')?.items ?? [])]);
            }
        }
        const handler = (payload: any) => {
            setItems([...(payload?.inventory?.items ?? [])]);
        };
        loader.engine.on('inventory_updated', handler);
        return () => loader.engine?.off('inventory_updated', handler);
    }, [loader]);

    if (items.length === 0) return null;

    return (
        <div
            data-testid="inventory-panel"
            className="absolute bottom-4 left-4 z-40 w-60 pointer-events-auto bg-black/60 backdrop-blur-md border border-cyan-500/30 rounded-xl p-3 shadow-2xl"
        >
            <div className="text-[10px] font-black tracking-[0.25em] text-cyan-400/80 uppercase mb-2">
                Bag · {items.length}
            </div>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                {items.map((item) => {
                    const { name, rarity, attrs } = describe(item);
                    const attrText = Object.entries(attrs).map(([k, v]) => `${k} ${v}`).join(' · ');
                    return (
                        <div
                            key={item.id}
                            data-testid={`bag-item-${item.id}`}
                            className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-xs font-bold text-white truncate">{name}</span>
                                    <span className="text-[10px] text-cyan-400 font-mono">×{item.quantity}</span>
                                    {rarity > Rarity.Common && (
                                        <span className={`text-[10px] ${RARITY_CLASS[rarity]}`}>{RARITY_LABEL[rarity]}</span>
                                    )}
                                </div>
                                {attrText && (
                                    <div className="text-[9px] text-gray-400 font-mono truncate">{attrText}</div>
                                )}
                            </div>
                            <button
                                className="text-[9px] font-bold tracking-wider uppercase px-2 py-1 rounded bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-all"
                                onClick={() => loader?.dropItem(item.id, 1)}
                            >
                                Drop
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
