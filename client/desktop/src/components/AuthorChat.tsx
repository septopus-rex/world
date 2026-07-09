import { useState } from 'react';
import type { DesktopLoader } from '@core/lib/DesktopLoader';

/**
 * AuthorChat — the natural-language authoring panel (spec ai-authoring.md §4E).
 * User text → AI gateway → validated GenerationDoc → plan card →
 * [预览] injects a runtime preview → [建造] persists it as a draft → [取消]
 * restores the block. Degrades gracefully: gateway unreachable = an error
 * line, the world untouched.
 */

interface Props { loader: DesktopLoader | null; ready: boolean }

export function AuthorChat({ loader, ready }: Props) {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [plan, setPlan] = useState<string | null>(null);
    const [doc, setDoc] = useState<any>(null);
    const [status, setStatus] = useState<string>('');
    const [previewing, setPreviewing] = useState(false);

    if (!ready || !loader) return null;

    const send = async () => {
        const prompt = input.trim();
        if (!prompt || busy) return;
        setBusy(true);
        setStatus(doc ? 'AI 修改方案中…' : 'AI 设计方案中…');
        try {
            const target = doc?.target?.block ?? loader.aiTargetBlock();
            if (!target) { setStatus('附近没有可用的空地块'); return; }
            const { ok, status: httpStatus, data } = await loader.net.http('ai').postJsonFull(
                `/v0/${doc ? 'revise' : 'generate'}`,
                { prompt, snapshot: { targetBlock: target }, ...(doc ? { doc } : {}) },
                { timeoutMs: 60_000 }, // real LLMs think slowly
            );
            if (!ok || data?.error) {
                setStatus(`生成失败:${data?.error ?? httpStatus}`);
                return;
            }
            setPlan(data.plan || data.doc?.summary || '(无摘要)');
            setDoc(data.doc);
            setPreviewing(false);
            setStatus(`方案就绪(${data.doc.pieces.length} 个部件 → 地块 ${data.doc.target.block.join(',')})`);
            setInput('');
        } catch (e: any) {
            setStatus(`网关不可达:${e?.message ?? e}`);
        } finally {
            setBusy(false);
        }
    };

    const preview = () => {
        if (!doc) return;
        if (loader.aiPreview(doc)) { setPreviewing(true); setStatus('已生成预览——走过去看看,满意点「建造」'); }
        else setStatus('预览失败:方案未过本地校验');
    };
    const build = () => {
        if (loader.aiBuild()) { setStatus('已建造并存档(重载不丢)'); setPreviewing(false); setPlan(null); setDoc(null); }
    };
    const cancel = () => {
        loader.aiCancel(); setPreviewing(false); setStatus('已撤掉预览');
    };

    return (
        <div className="absolute left-3 bottom-24 z-30 pointer-events-auto select-none" data-testid="author-chat">
            {!open && (
                <button data-testid="author-toggle" onClick={() => setOpen(true)}
                    className="px-3 py-2 rounded-lg bg-black/70 border border-emerald-400/40 text-emerald-200 text-sm font-bold">
                    🤖 AI 造物
                </button>
            )}
            {open && (
                <div className="w-80 rounded-xl bg-black/80 border border-emerald-400/30 p-3 flex flex-col gap-2 text-[13px] text-emerald-50">
                    <div className="flex items-center justify-between">
                        <span className="font-black tracking-widest text-emerald-300/90 text-[11px] uppercase">AI 造物</span>
                        <button data-testid="author-close" className="opacity-60 hover:opacity-100" onClick={() => setOpen(false)}>✕</button>
                    </div>
                    {plan && (
                        <div data-testid="author-plan" className="rounded-lg bg-emerald-950/60 border border-emerald-500/20 p-2 leading-relaxed">
                            {plan}
                        </div>
                    )}
                    {doc && (
                        <div className="flex gap-2">
                            <button data-testid="author-preview" onClick={preview} disabled={busy}
                                className="flex-1 py-1.5 rounded bg-emerald-600/80 hover:bg-emerald-500 font-bold">预览</button>
                            <button data-testid="author-build" onClick={build} disabled={busy || !previewing}
                                className="flex-1 py-1.5 rounded bg-amber-600/80 hover:bg-amber-500 font-bold disabled:opacity-40">建造</button>
                            <button data-testid="author-cancel" onClick={cancel} disabled={busy || !previewing}
                                className="flex-1 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40">取消</button>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <input data-testid="author-input" value={input} disabled={busy}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                            placeholder={doc ? '继续调整这个方案…' : '例如:帮我做个迷宫 / 小村庄'}
                            className="flex-1 rounded bg-zinc-900/90 border border-zinc-600 px-2 py-1.5 outline-none focus:border-emerald-400" />
                        <button data-testid="author-send" onClick={send} disabled={busy}
                            className="px-3 rounded bg-emerald-700 hover:bg-emerald-600 font-bold disabled:opacity-40">
                            {busy ? '…' : '发送'}
                        </button>
                    </div>
                    {status && <div data-testid="author-status" className="text-[11px] text-emerald-200/70">{status}</div>}
                </div>
            )}
        </div>
    );
}
