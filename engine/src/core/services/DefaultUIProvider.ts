import { IUIProvider, UIButtonConfig, UIModalConfig } from './UIProvider';

/**
 * DefaultUIProvider
 * A built-in Vanilla JS/CSS UI renderer for the Septopus engine.
 * Serves as a fallback if no external UI provider is injected.
 */
export class DefaultUIProvider implements IUIProvider {
    private container: HTMLElement;
    private overlays = new Map<string, HTMLElement>();
    private toastContainer: HTMLElement | null = null;

    private static readonly DEFAULT_STYLES = `
        :root {
            --sept-color-primary: #00ffff;
            --sept-color-bg: rgba(20, 20, 25, 0.85);
            --sept-color-text: #ffffff;
            --sept-color-danger: #ff4444;
            --sept-radius-sm: 4px;
            --sept-radius-md: 8px;
            --sept-font-main: 'Inter', system-ui, -apple-system, sans-serif;
            --sept-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
        }
        .sept-ui-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none; z-index: 1000; font-family: var(--sept-font-main);
        }
        .sept-ui-overlay * { pointer-events: auto; }
        .sept-ui-group { position: absolute; display: flex; gap: 8px; padding: 12px; }
        .sept-ui-group.bottom-right { bottom: 0; right: 0; }
        .sept-ui-group.bottom-left { bottom: 0; left: 0; }
        .sept-ui-group.top-right { top: 0; right: 0; }
        .sept-ui-group.top-left { top: 0; left: 0; }
        .sept-ui-btn {
            background: var(--sept-color-bg); color: var(--sept-color-text);
            border: 1px solid rgba(255, 255, 255, 0.2); padding: 8px 16px;
            border-radius: var(--sept-radius-sm); cursor: pointer; font-size: 14px;
            transition: all 0.2s ease; backdrop-filter: blur(8px);
            display: flex; align-items: center; gap: 6px; white-space: nowrap;
        }
        .sept-ui-btn:hover { border-color: var(--sept-color-primary); box-shadow: 0 0 12px rgba(0, 255, 255, 0.3); }
        .sept-ui-btn.active { background: var(--sept-color-primary); color: #000; border-color: var(--sept-color-primary); font-weight: 600; }
        .sept-ui-btn.variant-danger:hover { border-color: var(--sept-color-danger); box-shadow: 0 0 12px rgba(255, 68, 68, 0.3); }
        .sept-ui-toast-container { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
        .sept-ui-toast {
            background: var(--sept-color-bg); color: var(--sept-color-text); padding: 10px 20px;
            border-radius: var(--sept-radius-md); border-left: 4px solid var(--sept-color-primary);
            box-shadow: var(--sept-shadow-lg); font-size: 14px; backdrop-filter: blur(12px); pointer-events: auto;
            animation: sept-slide-down 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }
        @keyframes sept-slide-down { from { transform: translateY(-40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .sept-ui-modal-backdrop {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);
        }
        .sept-ui-modal {
            background: #1a1a1f; border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: var(--sept-radius-md); width: 320px; box-shadow: var(--sept-shadow-lg); color: var(--sept-color-text); overflow: hidden;
        }
        .sept-ui-modal-header { padding: 16px; font-weight: 600; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
        .sept-ui-modal-body { padding: 16px; font-size: 14px; line-height: 1.5; color: rgba(255, 255, 255, 0.8); }
        .sept-ui-modal-footer { padding: 12px 16px; display: flex; justify-content: flex-end; gap: 8px; background: rgba(0, 0, 0, 0.2); }
    `;

    constructor(parentContainerId: string) {
        const parent = document.getElementById(parentContainerId);
        if (!parent) throw new Error(`Parent container ${parentContainerId} not found`);

        // Inject Default Styles if not already present
        if (!document.getElementById('sept-ui-styles')) {
            const style = document.createElement('style');
            style.id = 'sept-ui-styles';
            style.textContent = DefaultUIProvider.DEFAULT_STYLES;
            document.head.appendChild(style);
        }

        this.container = document.createElement('div');
        this.container.className = 'sept-ui-overlay';
        parent.style.position = 'relative'; // Ensure parent can contain absolute children
        parent.appendChild(this.container);
    }

    public showGroup(id: string, items: UIButtonConfig[], position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | { x: number, y: number }): void {
        this.hide(id);

        const group = document.createElement('div');
        if (typeof position === 'string') {
            group.className = `sept-ui-group ${position}`;
        } else {
            group.className = `sept-ui-group`;
            group.style.position = 'absolute';
            group.style.left = `${position.x * 100}%`;
            group.style.top = `${position.y * 100}%`;
            group.style.transform = 'translate(-50%, -100%) translateY(-20px)'; // Float above the target
        }

        items.forEach((item, index) => {
            const btn = this.createButton(`${id}-btn-${index}`, item);
            group.appendChild(btn);
        });

        this.container.appendChild(group);
        this.overlays.set(id, group);
    }

    public showButton(id: string, config: UIButtonConfig, position?: { x: number, y: number }): void {
        this.hide(id);
        const btn = this.createButton(id, config);

        if (position) {
            btn.style.position = 'absolute';
            btn.style.left = `${position.x}px`;
            btn.style.top = `${position.y}px`;
        }

        this.container.appendChild(btn);
        this.overlays.set(id, btn);
    }

    public showModal(id: string, config: UIModalConfig): void {
        this.hide(id);

        const backdrop = document.createElement('div');
        backdrop.className = 'sept-ui-modal-backdrop';

        const modal = document.createElement('div');
        modal.className = 'sept-ui-modal';

        modal.innerHTML = `
            <div class="sept-ui-modal-header">${config.title}</div>
            <div class="sept-ui-modal-body">${config.body}</div>
            <div class="sept-ui-modal-footer"></div>
        `;

        const footer = modal.querySelector('.sept-ui-modal-footer')!;
        config.buttons.forEach((btnConfig, index) => {
            const btn = this.createButton(`${id}-mbtn-${index}`, btnConfig);
            footer.appendChild(btn);
        });

        backdrop.appendChild(modal);
        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                this.hide(id);
                config.onClose?.();
            }
        };

        this.container.appendChild(backdrop);
        this.overlays.set(id, backdrop);
    }

    public showToast(message: string, duration: number = 3000): void {
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.className = 'sept-ui-toast-container';
            this.container.appendChild(this.toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = 'sept-ui-toast';
        toast.innerText = message;

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    public updateCompass(yaw: number): void {
        let compass = document.getElementById('sept-ui-compass');
        if (!compass) {
            compass = document.createElement('div');
            compass.id = 'sept-ui-compass';
            compass.className = 'sept-ui-compass';
            const needle = document.createElement('div');
            needle.id = 'sept-ui-compass-needle';
            needle.className = 'sept-ui-compass-needle';
            compass.appendChild(needle);
            this.container.appendChild(compass);
        }

        const needle = document.getElementById('sept-ui-compass-needle');
        if (needle) {
            // Invert yaw because the needle rotates relative to the fixed housing
            needle.style.transform = `rotate(${yaw}rad)`;
        }
    }

    public updateWidget(id: string, data: any): void {
        // Generic entry point for complex state updates
        console.log(`[UI Widget Update] ${id}:`, data);
    }

    public hide(id: string): void {
        const el = this.overlays.get(id);
        if (el) {
            el.remove();
            this.overlays.delete(id);
        }
    }

    public injectStyle(tokens: Record<string, string>): void {
        const root = document.querySelector(':root') as HTMLElement;
        if (!root) return;
        Object.entries(tokens).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    }

    private createButton(id: string, config: UIButtonConfig): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = `sept-ui-btn ${config.active ? 'active' : ''} ${config.variant ? `variant-${config.variant}` : ''}`;

        let content = '';
        if (config.icon) content += `<span class="sept-icon">${config.icon}</span>`;
        if (config.label) content += `<span>${config.label}</span>`;

        btn.innerHTML = content;
        if (config.disabled) btn.disabled = true;
        if (config.tooltip) btn.title = config.tooltip;

        // Strict event isolation: prevent UI clicks from hitting the 3D scene
        const stop = (e: Event) => e.stopPropagation();
        btn.addEventListener('mousedown', stop);
        btn.addEventListener('mouseup', stop);
        btn.addEventListener('dblclick', stop);

        btn.onclick = (e) => {
            e.stopPropagation();
            config.onClick();
        };

        return btn;
    }
}
