import { CONTROL_CONSTANTS } from '../Constants';

export class InputProvider {
    private domElement: HTMLElement;
    private keys: Set<string> = new Set();
    private mouseButtons: Set<number> = new Set();
    private justPressedKeys: Set<string> = new Set();
    private justPressedButtons: Set<number> = new Set();

    // Mouse deltas for this frame
    public mouseDeltaX: number = 0;
    public mouseDeltaY: number = 0;
    public mouseNDC: [number, number] = [0, 0];
    public isMouseDown: boolean = false;

    // Touch state
    public touchLookActive: boolean = false;
    private activeLookTouchId: number | null = null;
    private lastTouchX: number = 0;
    private lastTouchY: number = 0;
    public touchDeltaX: number = 0;
    public touchDeltaY: number = 0;
    // Tap detection: a look touch that moves less than TAP_SLOP is a TAP (interact),
    // not a look-drag. Browser-synthesized click/mousedown never fire here because
    // the touch handlers preventDefault, so a tap is turned into a primary-button
    // "just pressed" + an NDC at the tap point (the raycast interact path).
    private static readonly TAP_SLOP = 10; // px
    private _touchStartX = 0;
    private _touchStartY = 0;
    private _touchMoved = 0;

    // Last mouse pos for delta calculation
    private lastMouseX: number = 0;
    private lastMouseY: number = 0;

    // Modifiers
    public altKey: boolean = false;
    public shiftKey: boolean = false;

    constructor(domElement: HTMLElement) {
        this.domElement = domElement;
        this.bindEvents();
    }

    private bindEvents(): void {
        // Headless guard: in Node (tests) there is no DOM to bind to. The engine
        // still constructs an InputProvider; it simply reports "no input".
        if (typeof document === 'undefined'
            || !this.domElement
            || typeof (this.domElement as any).addEventListener !== 'function') {
            return;
        }
        document.addEventListener('keydown', this.onKeyDown, false);
        document.addEventListener('keyup', this.onKeyUp, false);
        document.addEventListener('mouseup', this.onMouseUp, false);

        this.domElement.addEventListener('mousedown', this.onMouseDown, false);
        this.domElement.addEventListener('mousemove', this.onMouseMove, false);

        this.domElement.addEventListener('touchstart', this.onTouchStart, { passive: false });
        this.domElement.addEventListener('touchmove', this.onTouchMove, { passive: false });
        this.domElement.addEventListener('touchend', this.onTouchEnd, { passive: false });
        this.domElement.addEventListener('touchcancel', this.onTouchEnd, { passive: false });

        // Prevent browser default right-click menu so we can use button 2 for our own context menu
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault(), false);
    }

    private onKeyDown = (e: KeyboardEvent) => {
        if (!this.keys.has(e.code)) {
            this.justPressedKeys.add(e.code);
        }
        this.keys.add(e.code);
        this.altKey = e.altKey;
        this.shiftKey = e.shiftKey;
    };

    private onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.code);
        this.altKey = e.altKey;
        this.shiftKey = e.shiftKey;
    };

    private onMouseDown = (e: MouseEvent) => {
        this.isMouseDown = true;
        if (!this.mouseButtons.has(e.button)) {
            this.justPressedButtons.add(e.button);
        }
        this.mouseButtons.add(e.button);
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    };

    private onMouseMove = (e: MouseEvent) => {
        const rect = this.domElement.getBoundingClientRect();
        this.mouseNDC[0] = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouseNDC[1] = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.isMouseDown) {
            this.mouseDeltaX += e.clientX - this.lastMouseX;
            this.mouseDeltaY += e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    };

    private onMouseUp = (e: MouseEvent) => {
        this.isMouseDown = false;
        this.mouseButtons.delete(e.button);
    };

    private onTouchStart = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        // Any canvas touch drives the look: UI overlays (joystick/JUMP/drawer)
        // sit ABOVE the canvas and capture their own touches, so what reaches
        // here is a bare-world touch. (The old right-half-only guard made
        // left-half swipes dead — reported as "左右滑不灵敏".)
        if (this.touchLookActive) return; // one look-finger at a time
        const touch = e.changedTouches[0];
        if (touch) {
            this.touchLookActive = true;
            this.activeLookTouchId = touch.identifier;
            this.lastTouchX = touch.clientX;
            this.lastTouchY = touch.clientY;
            this._touchStartX = touch.clientX;
            this._touchStartY = touch.clientY;
            this._touchMoved = 0;
        }
    };

    private onTouchMove = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        if (!this.touchLookActive || this.activeLookTouchId === null) return;

        const touch = Array.from(e.touches).find(t => t.identifier === this.activeLookTouchId);
        if (!touch) return;

        this.touchDeltaX += touch.clientX - this.lastTouchX;
        this.touchDeltaY += touch.clientY - this.lastTouchY;
        this.lastTouchX = touch.clientX;
        this.lastTouchY = touch.clientY;
        this._touchMoved += Math.hypot(touch.clientX - this._touchStartX, touch.clientY - this._touchStartY);
    };

    private onTouchEnd = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === this.activeLookTouchId) {
                // A tap (barely moved) = interact: aim the ray at the tap point and
                // fire the primary button, since synthesized clicks are suppressed.
                if (this._touchMoved < InputProvider.TAP_SLOP) {
                    const rect = this.domElement.getBoundingClientRect();
                    this.mouseNDC[0] = ((t.clientX - rect.left) / rect.width) * 2 - 1;
                    this.mouseNDC[1] = -((t.clientY - rect.top) / rect.height) * 2 + 1;
                    this.justPressedButtons.add(0);
                }
                this.touchLookActive = false;
                this.activeLookTouchId = null;
                break;
            }
        }
    };

    public isKeyPressed(code: string): boolean {
        return this.keys.has(code);
    }

    public isMouseButtonPressed(button: number): boolean {
        return this.mouseButtons.has(button);
    }

    public isKeyJustPressed(code: string): boolean {
        return this.justPressedKeys.has(code);
    }

    public isMouseButtonJustPressed(button: number): boolean {
        return this.justPressedButtons.has(button);
    }

    public flushDeltas(): void {
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.touchDeltaX = 0;
        this.touchDeltaY = 0;
        this.justPressedKeys.clear();
        this.justPressedButtons.clear();
    }

    public dispose(): void {
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        document.removeEventListener('mouseup', this.onMouseUp);
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
        this.domElement.removeEventListener('mousemove', this.onMouseMove);
        this.domElement.removeEventListener('touchstart', this.onTouchStart);
        this.domElement.removeEventListener('touchmove', this.onTouchMove);
        this.domElement.removeEventListener('touchend', this.onTouchEnd);
        this.domElement.removeEventListener('touchcancel', this.onTouchEnd);
    }

    // Reusable gamepad state to avoid per-frame allocations
    private _gpAxes: number[] = [0, 0, 0, 0];
    private _gpButtons: boolean[] = [];
    private _gpState = { connected: false, axes: this._gpAxes, buttons: this._gpButtons };

    public getGamepadState() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = gamepads[0];
        if (pad && pad.connected) {
            const deadzone = CONTROL_CONSTANTS.DEADZONE;
            // Resize arrays if needed
            while (this._gpAxes.length < pad.axes.length) this._gpAxes.push(0);
            for (let i = 0; i < pad.axes.length; i++) {
                this._gpAxes[i] = Math.abs(pad.axes[i]) > deadzone ? pad.axes[i] : 0;
            }
            while (this._gpButtons.length < pad.buttons.length) this._gpButtons.push(false);
            for (let i = 0; i < pad.buttons.length; i++) {
                this._gpButtons[i] = pad.buttons[i].pressed;
            }
            this._gpState.connected = true;
            return this._gpState;
        }
        this._gpState.connected = false;
        for (let i = 0; i < this._gpAxes.length; i++) this._gpAxes[i] = 0;
        return this._gpState;
    }
}
