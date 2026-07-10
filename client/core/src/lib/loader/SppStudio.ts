import { AdjunctType } from '@engine/core/types/AdjunctType';
import { Coords } from '@engine/core/utils/Coords';
import { saveBlockDraft } from '@engine/core/utils/BlockSerializer';
import { SANDBOX_BLOCK, SANDBOX_CENTER, pickFace, pickFaceInCell, cellOfPoint, nextFace } from '../../scenes/sandboxScene';

/**
 * The minimal seam SppStudio needs from its host (DesktopLoader) — kept tiny so
 * the studio never reaches into the loader's guts. `world()`/`engine()` are lazy
 * so field-init order doesn't matter; the two verbs reuse the loader's own
 * teleport + mode plumbing.
 */
export interface SppHost {
    world(): any | null;
    engine(): any | null;
    teleportSeptopus(block: [number, number], pos: [number, number, number]): void;
    setMode(mode: 'normal' | 'edit' | 'game' | 'ghost' | 'observe'): boolean;
}

/**
 * SppStudio — the SPP sandbox ("magic ball" orbit + two-level cell→face editor)
 * and the live style-pack switcher, extracted verbatim from DesktopLoader
 * (2026-07). DesktopLoader now holds one `SppStudio` and forwards its former
 * public methods here, so the `window.loader.*` surface the e2e drive is
 * unchanged; only the ownership moved. Behaviour is byte-for-byte the same —
 * pure picking still lives in scenes/sandboxScene.ts; this class only supplies
 * the camera ray + focus/opacity bookkeeping + the durable save.
 */
export class SppStudio {
    private _sandboxActive = false;
    private _sandboxDetach: (() => void) | null = null;
    private _sandboxDown: { x: number; y: number; t: number } | null = null;
    /** Two-level select: null = pick a cell; a number = that cell is open and
     *  only ITS faces are editable. The other cells dim while one is open. */
    private _sandboxCell: number | null = null;
    private _focusRaf = 0;

    constructor(private host: SppHost) {}

    public get sandboxActive(): boolean { return this._sandboxActive; }
    /** The cell currently open for face-editing, or null in cell-picking mode. */
    public get sandboxSelectedCell(): number | null { return this._sandboxCell; }

    // ── SPP style packs (Workstream B) ───────────────────────────────────────
    /** Registered SPP style ids (built-in + external) for the style switcher. */
    public listSppStyles(): string[] { return (this.host.engine() as any)?.listStyles?.() ?? []; }
    /** The active world-level style override (null = each source keeps its own). */
    public get sppStyle(): string | null { return (this.host.engine() as any)?.getStyleOverride?.() ?? null; }
    /** Swap the world SPP style live — re-expands every SPP source instantly.
     *  `null` clears the override. Re-asserts the sandbox cell dim afterwards so
     *  the open-cell focus survives the mesh rebuild. */
    public setSppStyle(id: string | null): void {
        (this.host.engine() as any)?.setStyleOverride?.(id);
        if (this._sandboxCell != null) this.applyCellFocus();
    }

    /** Enter the SPP sandbox: teleport onto the diorama block, hide the avatar,
     *  orbit (Observe) the grid centre, and listen for taps to sculpt cell faces. */
    public enterSandbox(): void {
        if (this._sandboxActive) return;
        const w = this.host.world();
        if (!w) return;
        this.host.teleportSeptopus(SANDBOX_BLOCK, SANDBOX_CENTER);
        // Hide the avatar — it would sit in the middle of the diorama.
        const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const av = pid != null ? w.getComponent(pid, 'AvatarComponent') : null;
        if (av) av.visible = false;
        this.host.setMode('observe');
        // A 3/4 orbit framing the 12 m grid.
        const cc = w.systems.findSystemByName('CharacterController') as any;
        if (cc) { cc._obsAzimuth = 0.7; cc._obsElevation = 0.7; cc._obsRadius = 22; }
        // Tap (not drag) on the canvas → select a cell, or edit the open cell's face.
        const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement | null;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.sandboxDeselect(); };
        window.addEventListener('keydown', onKey);
        if (canvas) {
            const onDown = (e: MouseEvent) => { this._sandboxDown = { x: e.clientX, y: e.clientY, t: Date.now() }; };
            const onUp = (e: MouseEvent) => {
                const d = this._sandboxDown; this._sandboxDown = null;
                if (!d) return;
                if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || Date.now() - d.t > 500) return; // drag/hold = orbit
                const rect = canvas.getBoundingClientRect();
                const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
                this.sandboxClick(ndcX, ndcY);
            };
            canvas.addEventListener('mousedown', onDown);
            canvas.addEventListener('mouseup', onUp);
            this._sandboxDetach = () => {
                canvas.removeEventListener('mousedown', onDown); canvas.removeEventListener('mouseup', onUp);
                window.removeEventListener('keydown', onKey);
            };
        } else {
            this._sandboxDetach = () => window.removeEventListener('keydown', onKey);
        }
        // Re-assert per-cell dimming every frame: derived pieces are destroyed and
        // rebuilt on each face edit, so the opacity has to be re-applied once the
        // new meshes exist (AdjunctSystem builds them a frame after re-expand).
        const focusTick = () => {
            if (!this._sandboxActive) return;
            if (this._sandboxCell != null) this.applyCellFocus();
            this._focusRaf = requestAnimationFrame(focusTick);
        };
        this._focusRaf = requestAnimationFrame(focusTick);
        this._sandboxActive = true;
    }

    public exitSandbox(): void {
        if (!this._sandboxActive) return;
        this._sandboxActive = false;
        if (this._focusRaf) { cancelAnimationFrame(this._focusRaf); this._focusRaf = 0; }
        this.sandboxDeselect();
        this._sandboxDetach?.(); this._sandboxDetach = null;
        const w = this.host.world();
        const pid = w?.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const av = pid != null ? w.getComponent(pid, 'AvatarComponent') : null;
        if (av) av.visible = true;
        this.host.setMode('normal');
    }

    /** Reconstruct the SPP-local camera ray for an NDC click on the diorama. The
     *  Observe orbit gives the camera world position; the picked surface point
     *  gives the direction. Returns null if the click missed all geometry. */
    private sandboxRay(w: any, ndcX: number, ndcY: number): { origin: number[]; dir: number[] } | null {
        const hit = w.renderEngine?.castRayFromCamera?.(ndcX, ndcY);
        if (!hit) return null;
        const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const t = w.getComponent(pid, 'TransformComponent');
        const cc = w.systems.findSystemByName('CharacterController') as any;
        const obs = cc?.getObserveState?.();
        if (!t || !obs) return null;
        const tx = t.position[0], ty = t.position[1] + 1, tz = t.position[2];
        const ce = Math.cos(obs.elevation), se = Math.sin(obs.elevation), r = obs.radius;
        const cam = [tx + r * ce * Math.sin(obs.azimuth), ty + r * se, tz + r * ce * Math.cos(obs.azimuth)];
        const dirE = [hit.point[0] - cam[0], hit.point[1] - cam[1], hit.point[2] - cam[2]];
        // Engine(abs) → SPP-local of the sandbox block. A point maps as
        // (x-bxoff, -z-byoff, y); a direction drops the offset: (dx, -dz, dy).
        const B = Coords.BLOCK_SIZE;
        return {
            origin: [cam[0] - (SANDBOX_BLOCK[0] - 1) * B, -cam[2] - (SANDBOX_BLOCK[1] - 1) * B, cam[1]],
            dir: [dirE[0], -dirE[2], dirE[1]],
        };
    }

    /**
     * One tap on the diorama, dispatched by the two-level edit state:
     *   - No cell open → SELECT the cell under the ray (the others dim).
     *   - A cell open  → cycle the face of THAT cell the ray enters; a tap that
     *     misses the open cell is ignored (it never edits a neighbour).
     * Returns what happened so the UI can reflect it. Pure picking lives in
     * scenes/sandboxScene.ts; here we only supply the camera ray.
     */
    public sandboxClick(ndcX: number, ndcY: number): { kind: 'select' | 'cycle' | 'none'; cell?: number } {
        const w = this.host.world();
        if (!w) return { kind: 'none' };
        const ray = this.sandboxRay(w, ndcX, ndcY);
        if (!ray) return { kind: 'none' };

        if (this._sandboxCell == null) {
            const pick = pickFace(ray.origin, ray.dir);
            if (!pick) return { kind: 'none' };
            this._sandboxCell = pick.cellIndex;
            this.applyCellFocus();
            return { kind: 'select', cell: pick.cellIndex };
        }

        const face = pickFaceInCell(ray.origin, ray.dir, this._sandboxCell);
        if (face == null) return { kind: 'none' }; // tap outside the open cell → keep it open
        return this.sandboxCycleFace(this._sandboxCell, face)
            ? { kind: 'cycle', cell: this._sandboxCell }
            : { kind: 'none' };
    }

    /** Open a cell for face-editing without a ray (UI / tests). Pass null to close. */
    public sandboxSelectCell(cell: number | null): void {
        this._sandboxCell = cell;
        if (cell == null) this.restoreCellFocus();
        else this.applyCellFocus();
    }

    /** Cycle one face of one cell (实→门→窗→空) on the shared b6 source and
     *  re-expand live. The deterministic seam the ray path and tests share. */
    public sandboxCycleFace(cell: number, face: number): boolean {
        const w = this.host.world();
        if (!w) return false;
        const src = this.findSandboxSource(w);
        const c = src?.std.cells?.[cell];
        if (!src || !c?.faces) return false;
        c.faces[face] = nextFace(c.faces[face]);
        w.systems.findSystemByName('BlockSystem')?.reexpandSource?.(w, src.eid);
        this.applyCellFocus(); // re-assert dim; the focus rAF keeps it as meshes rebuild
        return true;
    }

    /** Close the open cell: stop face-editing, restore every cell to full opacity. */
    public sandboxDeselect(): void {
        if (this._sandboxCell == null) return;
        this._sandboxCell = null;
        this.restoreCellFocus();
    }

    /** Dim every derived piece NOT in the open cell to read as background; the
     *  open cell stays at full opacity so its faces are clearly the edit target. */
    private applyCellFocus(): void {
        const w = this.host.world();
        const sel = this._sandboxCell;
        if (!w || sel == null) return;
        const tag = `${SANDBOX_BLOCK[0]}_${SANDBOX_BLOCK[1]}`;
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (!a?.stdData?.derivedFrom || !String(a.stdData.derivedFrom).includes(tag)) continue;
            const ci = cellOfPoint([a.stdData.ox, a.stdData.oy, a.stdData.oz]);
            const mesh = w.getComponent(eid, 'MeshComponent');
            if (mesh?.handle) w.renderEngine.setObjectOpacityIsolated(mesh.handle, ci === sel ? 1.0 : 0.22);
        }
    }

    /** Lift the dim — every derived piece back to full opacity. */
    private restoreCellFocus(): void {
        const w = this.host.world();
        if (!w) return;
        const tag = `${SANDBOX_BLOCK[0]}_${SANDBOX_BLOCK[1]}`;
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (!a?.stdData?.derivedFrom || !String(a.stdData.derivedFrom).includes(tag)) continue;
            const mesh = w.getComponent(eid, 'MeshComponent');
            if (mesh?.handle) w.renderEngine.setObjectOpacityIsolated(mesh.handle, 1.0);
        }
    }

    /** Persist the sculpted sandbox INTO its block draft so it survives a reload.
     *  Re-serializes the live block (keeps the b6 SOURCE, drops derived pieces)
     *  into the DraftStore + flushes to IndexedDB. Display is already live; this
     *  only makes the structure durable. Returns whether it was written. */
    public async saveSandbox(): Promise<boolean> {
        const w = this.host.world();
        if (!w) return false;
        let blockEid: any = null;
        for (const eid of w.queryEntities('BlockComponent')) {
            const b = w.getComponent(eid, 'BlockComponent');
            if (b?.x === SANDBOX_BLOCK[0] && b?.y === SANDBOX_BLOCK[1]) { blockEid = eid; break; }
        }
        if (blockEid == null) return false;
        const ok = saveBlockDraft(w, blockEid);
        if (ok) await w.draftStore?.flush?.();
        return ok;
    }

    private findSandboxSource(w: any): { eid: any; std: any } | null {
        const tag = `${SANDBOX_BLOCK[0]}_${SANDBOX_BLOCK[1]}`;
        for (const eid of w.queryEntities('AdjunctComponent')) {
            const adj = w.getComponent(eid, 'AdjunctComponent');
            if (adj?.stdData?.typeId === AdjunctType.Spp && String(adj.adjunctId ?? '').includes(tag)) {
                return { eid, std: adj.stdData };
            }
        }
        return null;
    }
}
