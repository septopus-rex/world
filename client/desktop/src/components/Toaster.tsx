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
 */
interface Toast { id: number; text: string; severity: 'error' | 'fatal' | 'warn'; }

export function Toaster({ loader }: { loader: any }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        if (!loader?.engine) return;
        let seq = 0;
        const push = (text: string, severity: Toast['severity']) => {
            const id = seq++;
            setToasts((t) => [...t, { id, text, severity }]);
            setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
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
        loader.engine.on('engine.error', onErr);
        loader.engine.on('resource.failed', onRes);
        return () => {
            loader.engine?.off('engine.error', onErr);
            loader.engine?.off('resource.failed', onRes);
        };
    }, [loader]);

    if (!toasts.length) return null;

    return (
        <div
            data-testid="toaster"
            className="absolute bottom-6 right-6 z-50 flex flex-col items-end gap-2 pointer-events-none"
        >
            {toasts.map((t) => (
                <div
                    key={t.id}
                    data-testid="toast"
                    className={`max-w-xs px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-semibold ${
                        t.severity === 'warn'
                            ? 'bg-amber-950/85 border-amber-400/40 text-amber-100'
                            : 'bg-red-950/85 border-red-400/50 text-red-100'
                    }`}
                >
                    {t.text}
                </div>
            ))}
        </div>
    );
}

export default Toaster;
