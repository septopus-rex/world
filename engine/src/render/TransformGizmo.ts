import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RenderHandle } from '../core/types/Adjunct';

/**
 * Core-side hooks for the edit-mode translate gizmo. The gizmo lives entirely
 * in the render layer (it IS Three's TransformControls); core stays authoritative
 * over where the object is allowed to go:
 *
 *  - onChange fires on every drag update with the object's ABSOLUTE world
 *    position. Core clamps/snaps and returns the corrected position (or null to
 *    accept as-is); the gizmo writes the correction straight back onto the
 *    object so the visual never strays outside the rules. TransformControls
 *    recomputes from the raw pointer each move, so the write-back never
 *    accumulates error.
 *  - onDragState brackets the drag (true on axis grab, false on release) —
 *    core uses it to gate the camera (world.isMovingObject) and to commit the
 *    final position as an undoable 'set' task.
 *
 * Snapping is deliberately NOT TransformControls.translationSnap: that snaps in
 * render space, which is offset from absolute world space by the floating
 * origin. Core snaps in absolute coords inside onChange instead — one
 * authority, origin-proof.
 */
export interface GizmoHooks {
    onChange(abs: [number, number, number]): [number, number, number] | null;
    onDragState(dragging: boolean): void;
}

export interface GizmoInfo {
    attached: boolean;
    dragging: boolean;
    axis: string | null;
    /** Screen-space (0-1, y-down — same convention as Picking.worldToScreen)
     *  grab points: gizmo origin + a point on each translate arrow. For tests/
     *  debug HUDs that need to drive or display the gizmo without reaching into
     *  TransformControls internals. */
    screen?: { o: [number, number]; x: [number, number]; y: [number, number]; z: [number, number] };
}

export class TransformGizmo {
    private readonly controls: TransformControls;
    private readonly helper: THREE.Object3D;
    private hooks: GizmoHooks | null = null;
    private readonly _tmp = new THREE.Vector3();

    constructor(
        private readonly scene: THREE.Scene,
        private readonly camera: THREE.PerspectiveCamera,
        domElement: HTMLElement,
        private readonly origin: THREE.Vector3,   // FloatingOrigin.origin (live ref)
    ) {
        this.controls = new TransformControls(camera, domElement);
        this.controls.setMode('translate');
        // The helper is scene-level (not worldRoot): it derives its pose from the
        // attached object's matrixWorld, which already carries the −origin offset.
        this.helper = this.controls.getHelper();
        this.scene.add(this.helper);

        this.controls.addEventListener('dragging-changed', (e: any) => {
            this.hooks?.onDragState(!!e.value);
        });
        this.controls.addEventListener('objectChange', () => this.onObjectChange());
    }

    private onObjectChange(): void {
        const obj = this.controls.object;
        if (!obj || !this.hooks) return;

        // getWorldPosition refreshes ancestor matrices, so this is current even
        // though TransformControls just wrote obj.position between renders.
        obj.getWorldPosition(this._tmp);
        const abs: [number, number, number] = [
            this._tmp.x + this.origin.x,
            this._tmp.y + this.origin.y,
            this._tmp.z + this.origin.z,
        ];
        const corrected = this.hooks.onChange(abs);
        if (corrected) {
            this._tmp.set(
                corrected[0] - this.origin.x,
                corrected[1] - this.origin.y,
                corrected[2] - this.origin.z,
            );
            if (obj.parent) obj.parent.worldToLocal(this._tmp);
            obj.position.copy(this._tmp);
        }
    }

    public attach(target: RenderHandle, hooks: GizmoHooks): void {
        this.hooks = hooks;
        const obj = target as THREE.Object3D;
        if (this.controls.object !== obj) this.controls.attach(obj);
    }

    public detach(): void {
        this.hooks = null;
        this.controls.detach();
    }

    /** True while an axis is grabbed OR hovered — the click that grabs an axis
     *  must not double as a select/deselect ray (EditSystem gates on this). */
    public get busy(): boolean {
        return this.controls.dragging || this.controls.axis !== null;
    }

    public info(): GizmoInfo {
        const obj = this.controls.object;
        const base: GizmoInfo = {
            attached: !!obj,
            dragging: this.controls.dragging,
            axis: (this.controls.axis as string | null) ?? null,
        };
        if (!obj) return base;

        obj.getWorldPosition(this._tmp);
        const o = this._tmp.clone();
        // Mirror TransformControlsRoot's adaptive scale so the reported grab
        // points land on the actual arrows (factor · size/4; arrows span ~0–0.6
        // of that, we aim mid-stem at 0.45).
        this.camera.updateMatrixWorld();
        const camPos = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
        const factor = o.distanceTo(camPos)
            * Math.min(1.9 * Math.tan(Math.PI * this.camera.fov / 360) / this.camera.zoom, 7);
        const arm = 0.45 * factor * (this.controls.size ?? 1) / 4;

        const project = (p: THREE.Vector3): [number, number] => {
            const v = p.clone().project(this.camera);
            return [(v.x + 1) / 2, (1 - v.y) / 2];
        };
        base.screen = {
            o: project(o),
            x: project(o.clone().add(new THREE.Vector3(arm, 0, 0))),
            y: project(o.clone().add(new THREE.Vector3(0, arm, 0))),
            z: project(o.clone().add(new THREE.Vector3(0, 0, arm))),
        };
        return base;
    }

    public dispose(): void {
        this.detach();
        this.scene.remove(this.helper);
        (this.helper as any).dispose?.();
        this.controls.dispose();
    }
}
