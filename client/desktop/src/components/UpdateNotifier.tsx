import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Running as an installed PWA? (iOS Safari uses navigator.standalone.)
const isStandalone = () =>
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && (navigator as any).standalone === true);

const UPDATE_POLL_MS = 60 * 1000;

/**
 * PWA update prompt (qr client pattern).
 * - Browser tab users: apply the new SW silently and reload.
 * - Installed-app users: show a small "update available" toast, and poll for
 *   new versions while the app is open.
 */
export default function UpdateNotifier() {
    const [standalone] = useState(isStandalone);

    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(_swUrl, registration) {
            if (!registration) return;
            if (standalone) {
                setInterval(() => { registration.update().catch(() => {}); }, UPDATE_POLL_MS);
            }
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') registration.update().catch(() => {});
            });
        },
    });

    useEffect(() => {
        if (needRefresh && !standalone) updateServiceWorker(true);
    }, [needRefresh, standalone, updateServiceWorker]);

    if (!needRefresh || !standalone) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-[10020] flex justify-center pointer-events-none">
            <div className="pointer-events-auto bg-slate-900 text-white rounded-2xl pl-4 pr-2 py-2 shadow-2xl shadow-black/30 flex items-center gap-3 max-w-sm w-full">
                <div className="flex-1 text-sm font-semibold truncate">新版本可用</div>
                <button
                    onClick={() => updateServiceWorker(true)}
                    className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold rounded-lg active:scale-95 transition shrink-0"
                >
                    更新
                </button>
                <button
                    onClick={() => setNeedRefresh(false)}
                    aria-label="dismiss"
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
