import { useEffect, useState } from 'react';

/**
 * Toaster — surfaces engine errors to the user (error-handling-lib spec §3).
 * The client end of the `core/errors` facade: the engine's WorldEventSink emits
 * `engine.error` (+ `resource.failed` for assets) onto world.events; we show a
 * small transient toast instead of leaving failures console-only.
 *
 * - `resource.failed` → "资源加载失败" (these are reported at severity 'warn').
 * - `engine.error` at severity error/fatal WITHOUT a resource kind → generic toast
 *   (resource-kinded ones are covered by resource.failed, so we skip them here to
 *    avoid a double toast).
 * - `interact.miss` with reason 'too_far' → a neutral 'hint' toast ("走近一点"):
 *   the reach gate blocked a book/panel/npc because the player is out of arm's
 *   reach, so give feedback instead of a silent no-op. Suppressed in Game mode
 *   (ranged actions like shooting read interact.miss as a trigger pull).
 */
interface Toast { id: number; text: string; severity: 'error' | 'fatal' | 'warn' | 'hint'; }

export function Toaster({ loader }: { loader: any }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        if (!loader?.engine) return;
        let seq = 0;
        let lastHint = 0; // throttle repeated too-far taps
        const push = (text: string, severity: Toast['severity'], ttl = 5000) => {
            const id = seq++;
            setToasts((t) => [...t, { id, text, severity }]);
            setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
        };
        const onErr = (p: any) => {
            if (!p || (p.severity !== 'error' && p.severity !== 'fatal')) return;
            if (p.kind) return; // resource-kinded → handled by onRes
            push(p.userMessage || p.message || 'Something went wrong', p.severity);
        };
        const onRes = (p: any) => {
            if (!p) return;
            push(`资源加载失败 · ${p.kind} ${p.id}`, 'warn');
        };
        const onMiss = (p: any, ev?: any) => {
            if (p?.reason !== 'too_far') return;
            if (loader.currentMode === 'game') return;              // ranged actions read this as a shot
            if (!loader.isInteractableTarget?.(ev?.target)) return; // scenery (far wall/ground) → no hint
            const now = Date.now();
            if (now - lastHint < 2000) return;                      // one hint per couple seconds
            lastHint = now;
            push('太远了 · 走近一点再试', 'hint', 2200);
        };
        loader.engine.on('engine.error', onErr);
        loader.engine.on('resource.failed', onRes);
        loader.engine.on('interact.miss', onMiss);
        return () => {
            loader.engine?.off('engine.error', onErr);
            loader.engine?.off('resource.failed', onRes);
            loader.engine?.off('interact.miss', onMiss);
        };
    }, [loader]);

    if (!toasts.length) return null;

    const cls = (severity: Toast['severity']) =>
        `max-w-xs px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-semibold ${
            severity === 'hint'
                ? 'bg-cyan-950/85 border-cyan-400/40 text-cyan-100'
                : severity === 'warn'
                    ? 'bg-amber-950/85 border-amber-400/40 text-amber-100'
                    : 'bg-red-950/85 border-red-400/50 text-red-100'
        }`;

    // Gameplay hints ("走近一点") go top-centre — clearly in view and clear of the
    // bottom control cluster (joystick / JUMP / view toggle on the mobile shell).
    // Error / resource toasts stay in the bottom-right diagnostics corner.
    const hints = toasts.filter((t) => t.severity === 'hint');
    const alerts = toasts.filter((t) => t.severity !== 'hint');

    return (
        <>
            {alerts.length > 0 && (
                <div data-testid="toaster" className="absolute bottom-6 right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
                    {alerts.map((t) => (
                        <div key={t.id} data-testid="toast" className={cls(t.severity)}>{t.text}</div>
                    ))}
                </div>
            )}
            {hints.length > 0 && (
                <div data-testid="toaster-hint" className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
                    {hints.map((t) => (
                        <div key={t.id} data-testid="toast" className={cls(t.severity)}>{t.text}</div>
                    ))}
                </div>
            )}
        </>
    );
}

export default Toaster;
