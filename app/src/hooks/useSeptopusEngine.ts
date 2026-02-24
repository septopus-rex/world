import { useEffect, useRef, useState } from 'react';
import { useWallet } from "@solana/wallet-adapter-react";
// @ts-ignore
import SeptopusContract from "../lib/contract";
import { SandboxLoader } from '../SandboxLoader';

export function useSeptopusEngine(containerId: string) {
    const wallet = useWallet();
    const loaderRef = useRef<SandboxLoader | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [showMinimap, setShowMinimap] = useState(false);

    useEffect(() => {
        const syncWallet = async () => {
            await SeptopusContract.set(wallet);
        };
        syncWallet();

        if (!loaderRef.current) {
            loaderRef.current = new SandboxLoader();

            // UI Bridge
            const uiProvider = {
                showGroup: (id: string, items: any[], pos: string) => console.log(`[HUD Group] ${id} at ${pos}`, items),
                showButton: (id: string, config: any) => console.log(`[HUD Button] ${id}`, config),
                showModal: (id: string, config: any) => console.log(`[HUD Modal] ${id}`, config),
                showToast: (msg: string) => console.log(`[HUD Toast] ${msg}`),
                hide: (id: string) => console.log(`[HUD Hide] ${id}`),
                updateCompass: (yaw: number) => console.log(`[HUD Compass] ${yaw}`),
                updateWidget: (id: string, data: any) => console.log(`[HUD Widget] ${id}`, data)
            };

            loaderRef.current.init(containerId, uiProvider);
            (window as any).loader = loaderRef.current;
        }
    }, [wallet, containerId]);

    useEffect(() => {
        loaderRef.current?.toggleMinimap(showMinimap);
    }, [showMinimap]);

    useEffect(() => {
        loaderRef.current?.toggleEditMode(isEditMode);
    }, [isEditMode]);

    return {
        loader: loaderRef.current,
        isEditMode,
        setIsEditMode,
        showMinimap,
        setShowMinimap,
        wallet
    };
}
