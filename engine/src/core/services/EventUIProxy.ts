import { IUIProvider, UIButtonConfig, UIModalConfig, UIFormConfig } from './UIProvider';

/**
 * EventUIProxy
 * 
 * Wraps an optional IUIProvider instance and adds event emission for every UI action.
 * 
 * Modes:
 *   'default' — emit events AND delegate to the underlying provider (DefaultUIProvider)
 *   'events'  — emit events ONLY, no built-in rendering (for React/Vue/Swift integration)
 * 
 * External consumers listen via: engine.on("ui:show-group", callback)
 */
export class EventUIProxy implements IUIProvider {
    constructor(
        private emitter: (event: string, data: any) => void,
        private provider: IUIProvider | null,
        private mode: 'default' | 'events' = 'default'
    ) { }

    showGroup(id: string, items: UIButtonConfig[], position: any): void {
        this.emitter("ui:show-group", { id, items, position });
        if (this.mode === 'default') this.provider?.showGroup(id, items, position);
    }

    showButton(id: string, config: UIButtonConfig, position?: { x: number; y: number }): void {
        this.emitter("ui:show-button", { id, config, position });
        if (this.mode === 'default') this.provider?.showButton(id, config, position);
    }

    showModal(id: string, config: UIModalConfig): void {
        this.emitter("ui:show-modal", { id, config });
        if (this.mode === 'default') this.provider?.showModal(id, config);
    }

    showForm(id: string, config: UIFormConfig): void {
        this.emitter("ui:show-form", { id, config });
        if (this.mode === 'default') this.provider?.showForm(id, config);
    }

    showToast(message: string, duration?: number): void {
        this.emitter("ui:show-toast", { message, duration });
        if (this.mode === 'default') this.provider?.showToast(message, duration);
    }

    updateCompass(yaw: number): void {
        this.emitter("ui:update-compass", { yaw });
        if (this.mode === 'default') this.provider?.updateCompass(yaw);
    }

    updateWidget(id: string, data: any): void {
        this.emitter("ui:update-widget", { id, data });
        if (this.mode === 'default') this.provider?.updateWidget(id, data);
    }

    hide(id: string): void {
        this.emitter("ui:hide", { id });
        if (this.mode === 'default') this.provider?.hide(id);
    }

    injectStyle?(tokens: Record<string, string>): void {
        this.emitter("ui:inject-style", { tokens });
        if (this.mode === 'default') this.provider?.injectStyle?.(tokens);
    }
}
