import { AdjunctType } from '@engine/core/types/AdjunctType';
import { Coords } from '@engine/core/utils/Coords';
import { saveBlockDraft } from '@engine/core/utils/BlockSerializer';
import { SANDBOX_BLOCK, SANDBOX_CENTER, GRID, pickFace, pickFaceInCell, cellAabb, cellOfPoint, nextFace } from '../../scenes/sandboxScene';

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
    /** Overview orbit: frames the whole 12 m grid (3/4 diorama view). */
    private static readonly ORBIT_OVERVIEW = 17;
    /** Cell close-up orbit. Solved, not guessed: a 4 m cell's bounding sphere
     *  (r≈3.46) at fov 45° fills the frame height at d = r/sin(22.5°) ≈ 9 —
     *  at 8 the cell CLIPS (you're inside its face, can't read "this box is
     *  selected"); 10.5 frames it at ~86% height with context around it. */
    private static readonly ORBIT_CELL = 10.5;
    /** Per-rAF-tick exponential approach factor for the camera ease. */
    private static readonly CAM_EASE = 0.14;

    private _sandboxActive = false;
    private _sandboxDetach: (() => void) | null = null;
    private _sandboxDown: { x: number; y: number; t: number } | null = null;
    /** Two-level select: null = pick a cell; a number = that cell is open and
     *  only ITS faces are editable. The other cells dim while one is open. */
    private _sandboxCell: number | null = null;
    /** The face of the open cell whose config panel is showing (null = none).
     *  A tap on a face SELECTS it; the panel then writes [state, key] via
     *  sandboxSetFace — the two-level choice of spp-editors.md §2.2, replacing
     *  the old blind 4-step cycle on click (nextFace stays for the API/tests). */
    private _sandboxFace: number | null = null;
    /** Where the orbit is easing to: the frozen player is the orbit anchor, so
     *  "zoom into the selected cell" = glide the anchor to the cell centre while
     *  the radius shrinks. null = converged (user zoom keys work again). */
    private _camGoal: { pos: [number, number, number]; radius: number } | null = null;
    private _focusRaf = 0;

    constructor(private host: SppHost) {}

    public get sandboxActive(): boolean { return this._sandboxActive; }
    /** The cell currently open for face-editing, or null in cell-picking mode. */
    public get sandboxSelectedCell(): number | null { return this._sandboxCell; }
    /** The face of the open cell selected for configuring, or null. */
    public get sandboxSelectedFace(): number | null { return this._sandboxFace; }

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
        // A 3/4 orbit framing the 12 m grid — via the real API (the old
        // `cc._obs*` field writes were a silent no-op; the state lives in
        // CameraRig, reachable only through setObserveOrbit).
        const cc = w.systems.findSystemByName('CharacterController') as any;
        cc?.setObserveOrbit?.(0.7, 0.7, SppStudio.ORBIT_OVERVIEW);
        // Tap (not drag) on the canvas → select a cell, or edit the open cell's face.
        const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement | null;
        // Esc backs out one level at a time: face panel → cell → (stay in sandbox).
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (this._sandboxFace != null) this.sandboxSelectFace(null);
            else this.sandboxDeselect();
        };
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
        // The same tick glides the orbit toward its goal (cell zoom / overview).
        const focusTick = () => {
            if (!this._sandboxActive) return;
            this.easeCamera();
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
        this._camGoal = null; // after deselect — its refocus is moot once we leave
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
        const { blockWidth: bw, blockLength: bl } = w.metrics;
        return {
            origin: [cam[0] - (SANDBOX_BLOCK[0] - 1) * bw, -cam[2] - (SANDBOX_BLOCK[1] - 1) * bl, cam[1]],
            dir: [dirE[0], -dirE[2], dirE[1]],
        };
    }

    /**
     * One tap on the diorama, dispatched by the two-level edit state:
     *   - No cell open → SELECT the cell under the ray; the others dim and the
     *     orbit glides in on it.
     *   - A cell open  → SELECT the face of THAT cell the ray enters (its config
     *     panel opens); a tap that misses the open cell is ignored (it never
     *     touches a neighbour). Face writes go through sandboxSetFace.
     * Returns what happened so the UI can reflect it. Pure picking lives in
     * scenes/sandboxScene.ts; here we only supply the camera ray.
     */
    public sandboxClick(ndcX: number, ndcY: number): { kind: 'select' | 'face' | 'none'; cell?: number; face?: number } {
        const w = this.host.world();
        if (!w) return { kind: 'none' };
        const ray = this.sandboxRay(w, ndcX, ndcY);
        if (!ray) return { kind: 'none' };

        if (this._sandboxCell == null) {
            const pick = pickFace(ray.origin, ray.dir);
            if (!pick) return { kind: 'none' };
            this.sandboxSelectCell(pick.cellIndex);
            return { kind: 'select', cell: pick.cellIndex };
        }

        const face = pickFaceInCell(ray.origin, ray.dir, this._sandboxCell);
        if (face == null) return { kind: 'none' }; // tap outside the open cell → keep it open
        this._sandboxFace = face;
        return { kind: 'face', cell: this._sandboxCell, face };
    }

    /** Open a cell for face-editing without a ray (UI / tests). Pass null to close. */
    public sandboxSelectCell(cell: number | null): void {
        this._sandboxCell = cell;
        this._sandboxFace = null;
        this.focusCamera(cell);
        if (cell == null) this.restoreCellFocus();
        else this.applyCellFocus();
    }

    /** Select (or clear) a face of the open cell for configuring — the ray-free
     *  seam behind the panel and the tests. No-op without an open cell. */
    public sandboxSelectFace(face: number | null): void {
        if (this._sandboxCell == null) { this._sandboxFace = null; return; }
        this._sandboxFace = face;
    }

    /**
     * The live library for the selected face: its current [state, ref] plus BOTH
     * pools of the EFFECTIVE theme — the world style override when set (that is
     * what's rendering), else the source's own theme. The panel lists exactly
     * this; it never hard-codes options (spp-editors.md §2.2 "read the library").
     * `variantKey` is the current ref resolved to a stable key (legacy numeric
     * refs → the pool entry they index), so the UI highlights the active option.
     */
    public sandboxFaceOptions(): {
        cell: number; face: number; theme: string; state: number; variantKey: string | null;
        open: Array<{ key: string; name: string }>; closed: Array<{ key: string; name: string }>;
    } | null {
        const w = this.host.world();
        if (!w || this._sandboxCell == null || this._sandboxFace == null) return null;
        const src = this.findSandboxSource(w);
        const cell = src?.std.cells?.[this._sandboxCell];
        if (!cell?.faces) return null;
        const eng = this.host.engine() as any;
        const theme: string = eng?.getStyleOverride?.() ?? src!.std.theme ?? 'basic';
        const open = eng?.listVariants?.(theme, 'open') ?? [];
        const closed = eng?.listVariants?.(theme, 'closed') ?? [];
        const cur = cell.faces[this._sandboxFace] ?? [1, 0];
        const pool = cur[0] === 1 ? closed : open;
        const variantKey = typeof cur[1] === 'string' ? cur[1] : (pool[cur[1]]?.key ?? null);
        return { cell: this._sandboxCell, face: this._sandboxFace, theme, state: cur[0], variantKey, open, closed };
    }

    /** Write the selected face as [state, key] and re-expand live — the panel's
     *  apply. Writes the STABLE key (P4), never a positional index. */
    public sandboxSetFace(state: number, ref: number | string): boolean {
        const w = this.host.world();
        if (!w || this._sandboxCell == null || this._sandboxFace == null) return false;
        const src = this.findSandboxSource(w);
        const cell = src?.std.cells?.[this._sandboxCell];
        if (!src || !cell?.faces) return false;
        cell.faces[this._sandboxFace] = [state, ref];
        w.systems.findSystemByName('BlockSystem')?.reexpandSource?.(w, src.eid);
        this.applyCellFocus(); // re-assert dim; the focus rAF keeps it as meshes rebuild
        return true;
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

    /** Close the open cell: stop face-editing, restore every cell to full
     *  opacity, glide the orbit back out to the overview. */
    public sandboxDeselect(): void {
        if (this._sandboxCell == null) return;
        this.sandboxSelectCell(null);
    }

    // ── orbit focus (select = zoom in, deselect = zoom out) ─────────────────

    /** Aim the orbit at a cell (or back at the grid centre for null). The frozen
     *  player IS the orbit anchor, so framing = glide the player + shrink the
     *  radius; easeCamera moves both a step per rAF tick. Azimuth/elevation are
     *  left alone — the camera pushes straight in from wherever the user
     *  orbited to, instead of snapping to a canned angle. */
    private focusCamera(cell: number | null): void {
        const w = this.host.world();
        if (!w) return;
        // Anchor (SPP-local): cell centre at mid-height, or the grid overview
        // point. The -1 offsets the rig's +1 eye lift (see sandboxRay).
        const spp = cell == null
            ? SANDBOX_CENTER
            : (() => {
                const { min } = cellAabb(cell);
                return [min[0] + GRID.cell / 2, min[1] + GRID.cell / 2, GRID.cell / 2 - 1] as const;
            })();
        const { blockWidth: bw, blockLength: bl } = w.metrics;
        this._camGoal = {
            // SPP-local → engine(abs): (x, y, z) ↦ (x + bxoff, z, -(y + byoff)).
            pos: [(SANDBOX_BLOCK[0] - 1) * bw + spp[0], spp[2], -((SANDBOX_BLOCK[1] - 1) * bl + spp[1])],
            radius: cell == null ? SppStudio.ORBIT_OVERVIEW : SppStudio.ORBIT_CELL,
        };
    }

    /** One exponential step of the orbit glide (called from the focus rAF).
     *  Clears the goal once converged so the user's W/S zoom works again. */
    private easeCamera(): void {
        const g = this._camGoal;
        const w = this.host.world();
        if (!g || !w) return;
        const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const t = pid != null ? w.getComponent(pid, 'TransformComponent') : null;
        const cc = w.systems.findSystemByName('CharacterController') as any;
        const obs = cc?.getObserveState?.();
        if (!t || !obs) return;
        const k = SppStudio.CAM_EASE;
        let done = true;
        for (let i = 0; i < 3; i++) {
            const d = g.pos[i] - t.position[i];
            if (Math.abs(d) > 0.02) { t.position[i] += d * k; done = false; }
            else t.position[i] = g.pos[i];
        }
        const dr = g.radius - obs.radius;
        if (Math.abs(dr) > 0.05) { cc.setObserveOrbit(obs.azimuth, obs.elevation, obs.radius + dr * k); done = false; }
        else cc.setObserveOrbit(obs.azimuth, obs.elevation, g.radius);
        if (done) this._camGoal = null;
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
