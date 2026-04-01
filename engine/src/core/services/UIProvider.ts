import { FormGroup } from '../types/EditTask';

export interface UIButtonConfig {
    label: string;
    icon?: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    tooltip?: string;
    variant?: 'primary' | 'secondary' | 'danger';
}

export interface UIModalConfig {
    title: string;
    body: string;
    buttons: UIButtonConfig[];
    onClose?: () => void;
}

export interface UIFormConfig {
    title: string;
    groups: FormGroup[];
    onSubmit: (values: Record<string, any>) => void;
    onClose?: () => void;
}

export interface IUIProvider {
    /**
     * Show a group of buttons. 
     * If position is a string, it uses fixed corners.
     * If position is an object {x, y}, it uses absolute screen coordinates (0-1 range).
     */
    showGroup(id: string, items: UIButtonConfig[], position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | { x: number, y: number }): void;

    /**
     * Show a standardized Button
     */
    showButton(id: string, config: UIButtonConfig, position?: { x: number, y: number }): void;

    /**
     * Show a Modal dialog
     */
    showModal(id: string, config: UIModalConfig): void;

    /**
     * Show an editable Form modal with grouped fields.
     * The form values are collected and returned via onSubmit.
     */
    showForm(id: string, config: UIFormConfig): void;

    /**
     * Show a Toast message
     */
    showToast(message: string, duration?: number): void;

    /**
     * Update the rotation/angle of the Compass widget
     * @param yaw Radians
     */
    updateCompass(yaw: number): void;

    /**
     * Generic method to update complex persistent widgets (Minimap, Health, etc.)
     */
    updateWidget(id: string, data: any): void;

    /**
     * Hide or Close a UI element by ID
     */
    hide(id: string): void;

    /**
     * Inject custom CSS variables (Design Tokens)
     */
    injectStyle?(tokens: Record<string, string>): void;
}
