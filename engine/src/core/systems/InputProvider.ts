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
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.clientX > window.innerWidth / 2) {
                this.touchLookActive = true;
                this.activeLookTouchId = touch.identifier;
                this.lastTouchX = touch.clientX;
                this.lastTouchY = touch.clientY;
                break;
            }
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
    };

    private onTouchEnd = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.activeLookTouchId) {
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

    public getGamepadState() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = gamepads[0];
        if (pad && pad.connected) {
            const deadzone = CONTROL_CONSTANTS.DEADZONE;
            return {
                connected: true,
                axes: pad.axes.map(a => Math.abs(a) > deadzone ? a : 0),
                buttons: pad.buttons.map(b => b.pressed)
            };
        }
        return { connected: false, axes: [0, 0, 0, 0], buttons: [] };
    }
}
