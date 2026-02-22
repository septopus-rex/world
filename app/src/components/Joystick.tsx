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

        // Prevent default scrolling on mobile while using joystick
        if (e.cancelable && e.type.startsWith('touch')) {
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

        // Normalize values between -1 and 1 for game engine consumption
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

    return (
        <div
            ref={containerRef}
            onMouseDown={handleStart}
            onTouchStart={handleStart}
            style={{
                width: size,
                height: size,
            }}
            className="relative rounded-full bg-black/20 border-2 border-white/30 backdrop-blur-md shadow-lg touch-none flex items-center justify-center pointer-events-auto"
        >
            <div
                style={{
                    width: stickRadius * 2,
                    height: stickRadius * 2,
                    transform: `translate(${position.x}px, ${position.y}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }}
                className="absolute rounded-full bg-white/50 border border-white/80 shadow-md"
            />
        </div>
    );
};
