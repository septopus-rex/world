import { useState, useEffect } from 'react';

/**
 * A custom hook to detect if the application is running on a mobile device or a small screen.
 * Uses a combination of simple userAgent checks and window innerWidth matching typical mobile breakpoints.
 */
export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState<boolean>(false);

    useEffect(() => {
        const checkMobile = () => {
            const hasMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const isSmallScreen = window.innerWidth <= 768; // Standard tablet/mobile CSS breakpoint

            // If it identifies as mobile OS OR has a small screen, we treat viewport as mobile.
            setIsMobile(hasMobileUA || isSmallScreen);
        };

        // Initial check
        checkMobile();

        // Listen for layout resizing (e.g. flipping phone orientation or resizing desktop window)
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return isMobile;
}
