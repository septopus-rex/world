import React from 'react';

interface State { error: Error | null }

/**
 * Top-level error boundary — surfaces engine/runtime crashes instead of a
 * blank screen (important for the 3D canvas, where failures are easy to miss).
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="fixed inset-0 z-[99999] bg-black text-red-300 font-mono text-xs p-6 overflow-auto">
                    <p className="text-sm font-black text-red-400 mb-2 tracking-widest uppercase">Engine Crashed</p>
                    <pre className="whitespace-pre-wrap break-words">{this.state.error.message}{'\n\n'}{this.state.error.stack}</pre>
                    <button
                        onClick={() => { localStorage.removeItem('spp_player_state'); window.location.reload(); }}
                        className="mt-4 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300 font-bold tracking-widest uppercase"
                    >
                        Reset State &amp; Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
