import React, { useState, useRef, useEffect } from 'react';

interface JoystickProps {
    onMove: (data: { x: number; y: number; force: number; angle: number }) => void;
    onStop: () => void;
    size?: number;
}

export const Joystick: React.FC<JoystickProps> = ({ onMove, onStop, size = 120 }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const radius = size / 2;
    const stickRadius = size / 4;
    const maxDistance = radius - stickRadius;

    const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
        setIsDragging(true);
        handleMove(e, true);
    };

    const handleMove = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent, isInitiating = false) => {
        if (!isDragging && !isInitiating) return;
        if (!containerRef.current) return;

        // preventDefault ONLY on the native, non-passive window listeners (drag
        // moves). The initiating call comes from React's onTouchStart, which React
        // registers as a PASSIVE root listener — preventDefault there throws
        // "Unable to preventDefault inside passive event listener" (console flood).
        // The container's `touch-none` (touch-action:none) already suppresses the
        // browser's default touch behaviour on start, so skipping it is safe.
        if (!isInitiating && e.cancelable && e.type.startsWith('touch')) {
            e.preventDefault();
        }

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + radius;
        const centerY = rect.top + radius;

        const dx = clientX - centerX;
        const dy = clientY - centerY;

        const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
        const angle = Math.atan2(dy, dx);

        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;

        setPosition({ x, y });

        const normX = x / maxDistance;
        const normY = -(y / maxDistance); // Invert Y so up is positive
        const force = distance / maxDistance;

        onMove({ x: normX, y: normY, force, angle });
    };

    const handleEnd = () => {
        setIsDragging(false);
        setPosition({ x: 0, y: 0 });
        onStop();
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMove, { passive: false });
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchmove', handleMove, { passive: false });
            window.addEventListener('touchend', handleEnd);
        } else {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [isDragging]);

    // Material notes (shared language with the mobile shell's corner badges and
    // action pad): a flat translucent disc with a hairline border looks fine on a
    // mock-up and washes out completely over bright ground. What holds up is a
    // top-lit radial fill plus a light inset edge above and a dark one below —
    // the well reads as recessed, the knob as domed, and the whole control keeps
    // its shape over grass, snow or night.
    return (
        <div
            ref={containerRef}
            onMouseDown={handleStart}
            onTouchStart={handleStart}
            style={{
                width: size, height: size,
                background: 'radial-gradient(115% 115% at 50% 0%, rgba(255,255,255,0.13) 0%, rgba(6,12,20,0.30) 55%, rgba(4,8,14,0.42) 100%)',
                boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.45), inset 0 -1px 0 rgba(255,255,255,0.16), 0 8px 22px rgba(0,0,0,0.40)',
                borderColor: 'rgba(255,255,255,0.26)',
            }}
            className="relative rounded-full border backdrop-blur-md touch-none flex items-center justify-center pointer-events-auto"
        >
            <div
                style={{
                    width: stickRadius * 2,
                    height: stickRadius * 2,
                    transform: `translate(${position.x}px, ${position.y}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    background: 'radial-gradient(100% 100% at 50% 22%, rgba(255,255,255,0.95) 0%, rgba(226,236,247,0.72) 55%, rgba(150,168,190,0.62) 100%)',
                    boxShadow: isDragging
                        ? '0 1px 3px rgba(0,0,0,0.45), inset 0 -2px 3px rgba(0,0,0,0.18)'
                        : '0 4px 10px rgba(0,0,0,0.40), inset 0 -2px 3px rgba(0,0,0,0.15)',
                    borderColor: 'rgba(255,255,255,0.85)',
                }}
                className="absolute rounded-full border"
            />
        </div>
    );
};
