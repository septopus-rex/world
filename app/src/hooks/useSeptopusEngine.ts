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

            // No UI provider passed → engine will use its built-in DefaultUIProvider.
            // To integrate into a custom app, pass a custom IUIProvider here.
            loaderRef.current.init(containerId);
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
