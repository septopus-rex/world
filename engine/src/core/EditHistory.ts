import { EditTask } from './types/EditTask';
import { EntityId } from './World';

// ─────────────────────────────────────────────────────────────
// Undo/Redo History for Edit Mode
// ─────────────────────────────────────────────────────────────

export interface HistoryEntry {
    task: EditTask;
    snapshot: Record<string, any>;  // deep clone of stdData BEFORE execution
    /**
     * Extra tasks that were executed as part of the SAME authoring action and
     * must undo with it. One click that produces many rows — stamping a prefab
     * (spp-editors.md §9) drops a whole bench — is one thing the creator did,
     * so it has to be one Ctrl+Z. Without this, undoing a 12-part pergola means
     * pressing undo twelve times and watching it disassemble, which reads as a
     * bug rather than as history.
     *
     * Ordinary single-task edits leave it undefined; EditSystem replays these
     * in reverse (last executed undone first).
     */
    also?: Array<{ task: EditTask; snapshot: Record<string, any> }>;
}

/**
 * EditHistory
 * Manages undo/redo stacks at EditTask granularity.
 * One form submit = one task = one undo step.
 */
export class EditHistory {
    private undoStack: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];
    private _blockKey: string = '';

    /** Associate this history with a specific block session */
    get blockKey(): string { return this._blockKey; }

    public startSession(blockKey: string): void {
        this._blockKey = blockKey;
        this.undoStack = [];
        this.redoStack = [];
    }

    public push(entry: HistoryEntry): void {
        this.undoStack.push(entry);
        // Any new action invalidates redo
        this.redoStack = [];
    }

    public canUndo(): boolean { return this.undoStack.length > 0; }
    public canRedo(): boolean { return this.redoStack.length > 0; }

    /**
     * Pop the last executed task and return its pre-execution snapshot.
     * The snapshot should be applied to restore the entity.
     */
    public popUndo(): HistoryEntry | null {
        const entry = this.undoStack.pop() || null;
        if (entry) this.redoStack.push(entry);
        return entry;
    }

    /**
     * Pop from redo stack to re-apply a previously undone task.
     */
    public popRedo(): HistoryEntry | null {
        const entry = this.redoStack.pop() || null;
        if (entry) this.undoStack.push(entry);
        return entry;
    }

    public clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this._blockKey = '';
    }

    public get undoCount(): number { return this.undoStack.length; }
    public get redoCount(): number { return this.redoStack.length; }
}
