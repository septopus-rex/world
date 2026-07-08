import type { DesktopLoader } from '../lib/DesktopLoader';

/**
 * LeaveGameDialog — the client side of the per-game `exitPolicy: 'confirm'`
 * (docs/systems/game-mode-entry.md §2). When the player steps off a 'confirm'
 * game's block, the engine does NOT auto-exit: it keeps the round alive and emits
 * `game.leave_intent`. This modal asks whether to leave:
 *   - 退出游戏 (Leave)  → setMode('normal'), which tears the session down.
 *   - 继续 (Stay)       → dismiss; the player can walk back in to resume the round.
 *
 * Visible only while `open` (mirrored from game.leave_intent). The engine already
 * clears the intent when the player walks back into the block or the mode leaves
 * Game, so "Stay" just needs to hide the prompt locally.
 */
export function LeaveGameDialog({ loader, open }: { loader: DesktopLoader | null; open: boolean }) {
    if (!open || !loader) return null;
    return (
        <div
            data-testid="leave-game-confirm"
            className="absolute inset-0 z-40 pointer-events-auto bg-black/50 flex items-center justify-center select-none"
        >
            <div className="flex flex-col items-center gap-4 px-8 py-6 rounded-3xl bg-zinc-900/90 border border-amber-400/40 shadow-2xl">
                <span className="text-[10px] font-black tracking-[0.3em] text-amber-300/80 uppercase">离开游戏区域</span>
                <p className="text-sm text-zinc-200 text-center max-w-[18rem]">
                    你已走出游戏区域。退出游戏会<strong className="text-amber-300">结束本局</strong>（不保存）。
                </p>
                <div className="flex items-center gap-3">
                    <button
                        data-testid="leave-game-confirm-yes"
                        onClick={() => loader.setMode('normal')}
                        className="px-5 py-2 rounded-2xl text-xs font-black tracking-widest uppercase text-red-200 bg-red-500/25 border border-red-400/60 hover:bg-red-500/40 active:scale-95 transition-all shadow-xl"
                    >
                        ■ 退出游戏
                    </button>
                    <button
                        data-testid="leave-game-confirm-no"
                        onClick={() => loader.cancelLeaveIntent()}
                        className="px-5 py-2 rounded-2xl text-xs font-black tracking-widest uppercase text-green-200 bg-green-500/20 border border-green-400/50 hover:bg-green-500/35 active:scale-95 transition-all shadow-xl"
                    >
                        ▶ 继续游戏
                    </button>
                </div>
            </div>
        </div>
    );
}
