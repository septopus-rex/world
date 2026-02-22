export interface IUIProvider {
    /**
     * Show a standardized UI component
     */
    show(type: string, content: any, cfg?: any): void;

    /**
     * Hide a specific UI component
     */
    hide(type: string): void;

    /**
     * Update an existing UI component
     */
    update?(type: string, content: any, cfg?: any): void;
}
