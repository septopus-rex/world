import { useState, useEffect, useRef, useCallback } from 'react';
// @ts-ignore
import SeptopusContract from '../lib/contract';

const WORLD_INDEX = 0;
const DEBOUNCE_MS = 500;

export interface BlockInfo {
    x: number;
    y: number;
    world: number;
    minted: boolean;
    owner?: string;
    price?: number;
    status?: number;  // 0=Public 1=Private 2=Selling 3=Banned 4=Locked
    data?: string;
}

export function useBlockInfo(coords: [number, number] | null) {
    const [info, setInfo]       = useState<BlockInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

    const doFetch = useCallback(async (x: number, y: number) => {
        setLoading(true);
        try {
            if (!SeptopusContract.isReady()) {
                setInfo({ x, y, world: WORLD_INDEX, minted: false });
                return;
            }
            const data = await SeptopusContract.get('block', [x, y, WORLD_INDEX]);
            setInfo(data);
        } catch {
            setInfo({ x, y, world: WORLD_INDEX, minted: false });
        } finally {
            setLoading(false);
        }
    }, []);

    const refresh = useCallback(() => {
        if (coords) doFetch(coords[0], coords[1]);
    }, [coords, doFetch]);

    useEffect(() => {
        if (!coords) { setInfo(null); return; }
        const [x, y] = coords;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => doFetch(x, y), DEBOUNCE_MS);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [coords?.[0], coords?.[1], doFetch]);

    return { info, loading, refresh };
}
