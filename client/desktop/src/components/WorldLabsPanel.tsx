import { useEffect, useRef, useState } from 'react';
import type { DesktopLoader } from '@core/lib/DesktopLoader';

/**
 * WorldLabsPanel — the "AI-generated 3D world" demo (services/worldlabs, a
 * thin gateway over World Labs' Marble World API, docs.worldlabs.ai/api).
 * Text prompt → generate → poll until a splat is ready → placed live on the
 * gallery ㉑ exhibit's pedestal (block [2000,1020]). Mirrors AuthorChat's
 * corner-panel shape; unlike AI 造物 there's no plan/preview/build step — the
 * "document" here is just a URL, and placement is immediate once ready.
 *
 * Real generation takes ~5 minutes (Marble's own budget) — the mock provider
 * (default; see services/worldlabs) finishes on the first poll so the whole
 * flow is instant offline/in tests.
 */

interface Props { loader: DesktopLoader | null; ready: boolean }

const POLL_MS = 4000;

export function WorldLabsPanel({ loader, ready }: Props) {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [jobId, setJobId] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [splatUrl, setSplatUrl] = useState<string | null>(null);
    const [placed, setPlaced] = useState(false);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = () => {
        if (timer.current) { clearInterval(timer.current); timer.current = null; }
    };
    useEffect(() => stopPolling, []); // unmount safety

    const pollOnce = async (id: string) => {
        if (!loader) return;
        const r = await loader.worldlabsPoll(id);
        if (r.error) {
            setError(r.error); setBusy(false); setStatus(''); stopPolling();
            return;
        }
        if (!r.done) { setStatus(r.status ?? '生成中…'); return; }
        stopPolling();
        setBusy(false);
        setSplatUrl(r.splatUrl ?? null);
        setPlaced(!!r.placed);
        setStatus(r.placed ? '已生成并放到画廊㉑展台——去看看！' : '已生成,但要走到画廊㉑展台才能看到它');
    };

    const send = async () => {
        const prompt = input.trim();
        if (!prompt || busy || !loader) return;
        setBusy(true); setError(null); setSplatUrl(null); setPlaced(false);
        setStatus('提交生成请求…');
        const r = await loader.worldlabsGenerate(prompt);
        if (r.error || !r.jobId) {
            setError(r.error ?? '未知错误'); setBusy(false); setStatus('');
            return;
        }
        setJobId(r.jobId);
        setStatus('排队中…');
        void pollOnce(r.jobId);
        timer.current = setInterval(() => void pollOnce(r.jobId!), POLL_MS);
    };

    const retryPlace = () => {
        if (!loader || !splatUrl) return;
        const ok = loader.worldlabsPlace(splatUrl);
        setPlaced(ok);
        setStatus(ok ? '已放到画廊㉑展台——去看看！' : '还是没找到展台(㉑ 在 [2000,1020],先走过去再试)');
    };

    if (!ready || !loader) return null;

    return (
        <div className="absolute left-3 bottom-96 z-30 pointer-events-auto select-none" data-testid="worldlabs-panel">
            {!open && (
                <button data-testid="worldlabs-toggle" onClick={() => setOpen(true)}
                    className="px-3 py-2 rounded-lg bg-black/70 border border-sky-400/40 text-sky-200 text-sm font-bold">
                    🌍 World Labs
                </button>
            )}
            {open && (
                <div className="w-80 rounded-xl bg-black/80 border border-sky-400/30 p-3 flex flex-col gap-2 text-[13px] text-sky-50">
                    <div className="flex items-center justify-between">
                        <span className="font-black tracking-widest text-sky-300/90 text-[11px] uppercase">AI 生成世界 · Marble</span>
                        <button data-testid="worldlabs-close" className="opacity-60 hover:opacity-100" onClick={() => setOpen(false)}>✕</button>
                    </div>
                    <div className="flex gap-2">
                        <input data-testid="worldlabs-input" value={input} disabled={busy}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                            placeholder="例如:a mystical forest with glowing mushrooms"
                            className="flex-1 rounded bg-zinc-900/90 border border-zinc-600 px-2 py-1.5 outline-none focus:border-sky-400" />
                        <button data-testid="worldlabs-send" onClick={send} disabled={busy || !input.trim()}
                            className="px-3 rounded bg-sky-700 hover:bg-sky-600 font-bold disabled:opacity-40">
                            {busy ? '…' : '生成'}
                        </button>
                    </div>
                    {jobId && <div className="text-[10px] text-sky-300/50">job: {jobId}</div>}
                    {status && <div data-testid="worldlabs-status" className="text-[11px] text-sky-200/70">{status}</div>}
                    {error && <div data-testid="worldlabs-error" className="text-[11px] text-red-300">{error}</div>}
                    {splatUrl && !placed && (
                        <button data-testid="worldlabs-place" onClick={retryPlace}
                            className="py-1.5 rounded bg-amber-600/80 hover:bg-amber-500 font-bold">
                            在展台放置
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
