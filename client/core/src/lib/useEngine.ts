import { useCallback, useEffect, useRef, useState } from 'react';
import { DesktopLoader } from './DesktopLoader';

/**
 * Boots the engine loader and exposes UI-facing state.
 * Keeps a page-lifetime singleton per containerId so the unified chain loader
 * can hot-swap between Mobile and Desktop HUD shells in 0ms without recreating
 * the WebGL context or losing player/wallet/world state.
 */
export type WorldMode = 'normal' | 'edit' | 'game' | 'ghost' | 'observe';

interface SharedEngineInstance {
    hostEl: HTMLDivElement | null;
    loader: DesktopLoader;
    initPromise: Promise<void>;
    ready: boolean;
    readySubs: Set<() => void>;
}

const sharedEngines = new Map<string, SharedEngineInstance>();

function getOrCreateShared(containerId: string): SharedEngineInstance {
    let inst = sharedEngines.get(containerId);
    if (!inst) {
        const loader = new DesktopLoader();
        (window as any).loader = loader;
        const readySubs = new Set<() => void>();
        inst = {
            hostEl: null,
            loader,
            ready: false,
            readySubs,
            initPromise: Promise.resolve(),
        };
        sharedEngines.set(containerId, inst);
    }
    return inst;
}

export function useEngine(containerId: string) {
    const loaderRef = useRef<DesktopLoader | null>(null);
    const bootedRef = useRef(false);
    const [ready, setReady] = useState(() => sharedEngines.get(containerId)?.ready ?? false);
    // The ENGINE is the source of truth for mode: it can refuse a switch (Game
    // outside a zone) or auto-revert (leaving the zone). We mirror its
    // system.mode event into React rather than driving it from React state.
    const [mode, setModeState] = useState<WorldMode>(() => (sharedEngines.get(containerId)?.loader.currentMode as WorldMode) ?? 'normal');
    const [gameZoneActive, setGameZoneActive] = useState(() => sharedEngines.get(containerId)?.loader.gameZoneActive ?? false);
    // A 'confirm'-policy game wants confirmation to leave (player stepped off its
    // block; the round is kept alive). Drives the leave-game dialog.
    const [leaveIntent, setLeaveIntent] = useState(() => sharedEngines.get(containerId)?.loader.leaveIntentActive ?? false);
    const [showMinimap, setShowMinimap] = useState(false);
    // Default third-person so the avatar is visible (matches CharacterController default).
    const [view, setView] = useState<'first' | 'third'>(() => sharedEngines.get(containerId)?.loader.getCameraView() ?? 'third');
    // Active in-world game + its state, mirrored from game.started/ended + moves.
    // Generic: the game's name selects the HUD, gameState is that game's payload.
    const [activeGame, setActiveGame] = useState<string | null>(() => sharedEngines.get(containerId)?.loader.activeGame ?? null);
    const [gameState, setGameState] = useState<any>(() => sharedEngines.get(containerId)?.loader.gameState ?? null);

    // Callback ref that attaches the singleton `#three_demo` DOM node into
    // whichever HUD shell (Mobile or Desktop) is currently mounted.
    const hostRef = useCallback((slot: HTMLDivElement | null) => {
        if (!slot) return;
        const inst = getOrCreateShared(containerId);
        if (!inst.hostEl) {
            const el = document.createElement('div');
            el.id = containerId;
            el.className = 'w-full h-full';
            inst.hostEl = el;
        }
        if (inst.hostEl.parentElement !== slot) {
            slot.appendChild(inst.hostEl);
            try {
                (inst.loader.engine?.getWorld() as any)?.renderEngine?.resize?.();
            } catch { /* ignore pre-boot */ }
        }
    }, [containerId]);

    useEffect(() => {
        const inst = getOrCreateShared(containerId);
        const loader = inst.loader;
        loaderRef.current = loader;
        (window as any).loader = loader;

        loader.onModeChange((m) => setModeState(m as WorldMode));
        loader.onZoneChange((active) => setGameZoneActive(active));
        loader.onLeaveIntent((active) => setLeaveIntent(active));
        loader.onGameStateChange((game, s) => { setActiveGame(game); setGameState(s); });

        // Sync current state on shell switch
        setModeState(loader.currentMode as WorldMode);
        setGameZoneActive(loader.gameZoneActive);
        setLeaveIntent(loader.leaveIntentActive);
        setActiveGame(loader.activeGame);
        setGameState(loader.gameState);

        if (inst.ready) {
            setReady(true);
            const v = loader.getCameraView();
            if (v) setView(v);
        } else {
            const onReady = () => setReady(true);
            inst.readySubs.add(onReady);
            if (!bootedRef.current && !loader.engine) {
                bootedRef.current = true;
                inst.initPromise = loader
                    .init(containerId)
                    .then(() => {
                        inst.ready = true;
                        inst.readySubs.forEach((cb) => cb());
                        inst.readySubs.clear();
                    })
                    .catch((e) => console.error('[useEngine] init failed', e));
            }
            return () => { inst.readySubs.delete(onReady); };
        }
    }, [containerId]);

    useEffect(() => { loaderRef.current?.toggleMinimap(showMinimap); }, [showMinimap]);
    useEffect(() => { if (ready) loaderRef.current?.setCameraView(view); }, [view, ready]);

    // The engine switches the view on its own around Edit mode (forces
    // first-person on entry, restores on exit) — re-read it after every mode
    // change so the 1ST/3RD toggle label reflects reality. The mode event is
    // dispatched at step-end, AFTER the engine has settled the view.
    useEffect(() => {
        if (!ready) return;
        const v = loaderRef.current?.getCameraView();
        if (v) setView(v);
    }, [mode, ready]);

    // Request a mode switch; the engine confirms (or refuses) via system.mode,
    // which flows back into `mode` above. Returns the engine's verdict.
    const setMode = (m: WorldMode): boolean => loaderRef.current?.setMode(m) ?? false;

    return {
        loader: loaderRef.current ?? sharedEngines.get(containerId)?.loader ?? null,
        hostRef,
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
