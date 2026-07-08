import { useEffect, useRef, useState } from 'react';
import { DesktopLoader } from './DesktopLoader';

/**
 * Boots the chain-free engine loader and exposes UI-facing state.
 * No wallet, no chain — the loader runs on local data only.
 */
export type WorldMode = 'normal' | 'edit' | 'game' | 'ghost' | 'observe';

export function useEngine(containerId: string) {
    const loaderRef = useRef<DesktopLoader | null>(null);
    const [ready, setReady] = useState(false);
    // The ENGINE is the source of truth for mode: it can refuse a switch (Game
    // outside a zone) or auto-revert (leaving the zone). We mirror its
    // system.mode event into React rather than driving it from React state.
    const [mode, setModeState] = useState<WorldMode>('normal');
    const [gameZoneActive, setGameZoneActive] = useState(false);
    // A 'confirm'-policy game wants confirmation to leave (player stepped off its
    // block; the round is kept alive). Drives the leave-game dialog.
    const [leaveIntent, setLeaveIntent] = useState(false);
    const [showMinimap, setShowMinimap] = useState(false);
    // Default third-person so the avatar is visible (matches CharacterController default).
    const [view, setView] = useState<'first' | 'third'>('third');
    // Active in-world game + its state, mirrored from game.started/ended + moves.
    // Generic: the game's name selects the HUD, gameState is that game's payload.
    const [activeGame, setActiveGame] = useState<string | null>(null);
    const [gameState, setGameState] = useState<any>(null);

    useEffect(() => {
        if (!loaderRef.current) {
            loaderRef.current = new DesktopLoader();
            (window as any).loader = loaderRef.current;
            loaderRef.current.onModeChange((m) => setModeState(m as WorldMode));
            loaderRef.current.onZoneChange((active) => setGameZoneActive(active));
            loaderRef.current.onLeaveIntent((active) => setLeaveIntent(active));
            loaderRef.current.onGameStateChange((game, s) => { setActiveGame(game); setGameState(s); });
            loaderRef.current
                .init(containerId)
                .then(() => setReady(true))
                .catch((e) => console.error('[useEngine] init failed', e));
        }
        // The engine owns a single canvas for the page lifetime; intentionally
        // no teardown here (matches the app's single-instance model).
    }, [containerId]);

    useEffect(() => { loaderRef.current?.toggleMinimap(showMinimap); }, [showMinimap]);
    useEffect(() => { if (ready) loaderRef.current?.setCameraView(view); }, [view, ready]);

    // Request a mode switch; the engine confirms (or refuses) via system.mode,
    // which flows back into `mode` above. Returns the engine's verdict.
    const setMode = (m: WorldMode): boolean => loaderRef.current?.setMode(m) ?? false;

    return {
        loader: loaderRef.current,
        ready,
        mode,
        setMode,
        isEditMode: mode === 'edit',
        gameZoneActive,
        leaveIntent,
        activeGame,
        gameState,
        showMinimap,
        setShowMinimap,
        view,
        setView,
    };
}
