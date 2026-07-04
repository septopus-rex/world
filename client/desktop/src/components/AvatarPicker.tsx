import { useState } from 'react';

/**
 * Avatar picker — a small HUD flyout over the runtime avatar-swap seam
 * (loader.setAvatar → Engine.setAvatar → EntityFactory.swapAvatar). Pure view:
 * the engine owns loading/scaling/animation; a failed load keeps the current
 * body, so the picker never needs an error state beyond "nothing changed".
 */
export function AvatarPicker({ loader, ready }: { loader: any; ready: boolean }) {
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState<number | null>(null);

    if (!ready || !loader) return null;
    const catalog: { id: number; label: string }[] = loader.avatarCatalog?.() ?? [];
    if (!catalog.length) return null;
    const active = current ?? loader.currentAvatar?.() ?? catalog[0].id;

    return (
        <div className="absolute top-14 right-3 z-40 flex flex-col items-end gap-1">
            <button
                data-testid="avatar-picker-toggle"
                onClick={() => setOpen(!open)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase text-emerald-200 bg-emerald-500/15 border border-emerald-400/40 hover:bg-emerald-500/30 transition-all"
            >🧍 化身 Avatar</button>
            {open && (
                <div data-testid="avatar-picker" className="flex flex-col gap-1 bg-black/75 backdrop-blur-md border border-emerald-400/30 rounded-lg p-1.5">
                    {catalog.map((a) => (
                        <button
                            key={a.id}
                            data-testid={`avatar-option-${a.id}`}
                            onClick={() => { loader.setAvatar(a.id); setCurrent(a.id); setOpen(false); }}
                            className={`text-left text-xs px-2.5 py-1 rounded border transition-colors ${a.id === active
                                ? 'border-emerald-400/70 bg-emerald-500/25 text-emerald-100'
                                : 'border-white/15 bg-white/5 text-neutral-300 hover:bg-white/15'}`}
                        >{a.label}</button>
                    ))}
                </div>
            )}
        </div>
    );
}
