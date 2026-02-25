import { EntityId } from '../World';

// ─────────────────────────────────────────────────────────────
// EditTask — the serializable command object for adjunct editing
// ─────────────────────────────────────────────────────────────

export interface EditTask {
    entityId: EntityId;
    adjunct: string;                    // adjunct type name ("box", "wall", ...)
    action: string;                     // "set" | "delete" | "duplicate"
    param: Record<string, any>;         // key-value pairs from the form
}

// ─────────────────────────────────────────────────────────────
// Form Types — used by IUIProvider.showForm() and adjunct menus
// ─────────────────────────────────────────────────────────────

export interface FormField {
    key: string;
    label: string;
    type: "number" | "color" | "select" | "text";
    value: any;
    min?: number;
    max?: number;
    step?: number;
    options?: { label: string; value: any }[];
}

export interface FormGroup {
    title: string;
    fields: FormField[];
}

// ─────────────────────────────────────────────────────────────
// Context Menu Item — returned by adjunct.menu.contextMenu()
// ─────────────────────────────────────────────────────────────

export interface ContextMenuItem {
    label: string;
    action: string;
    icon?: string;
    variant?: 'primary' | 'secondary' | 'danger';
}
