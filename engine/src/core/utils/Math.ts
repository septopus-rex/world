/**
 * Generic Math Abstractions to decouple core logic from 3D rendering engines (Three.js).
 */

export type Vector2Tuple = [number, number];
export type Vector3Tuple = [number, number, number];

export interface IVector3 {
    x: number;
    y: number;
    z: number;
}

export class Vector3 implements IVector3 {
    constructor(public x: number = 0, public y: number = 0, public z: number = 0) { }

    set(x: number, y: number, z: number): this {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    copy(v: IVector3): this {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }

    clone(): Vector3 {
        return new Vector3(this.x, this.y, this.z);
    }

    add(v: IVector3): this {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }

    multiplyScalar(s: number): this {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }

    lengthSq(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    normalize(): this {
        const len = Math.sqrt(this.lengthSq());
        if (len > 0) this.multiplyScalar(1 / len);
        return this;
    }
}

export class Color {
    public r: number = 1;
    public g: number = 1;
    public b: number = 1;

    constructor(color?: number | string) {
        if (typeof color === 'number') {
            this.setHex(color);
        }
    }

    setHex(hex: number): this {
        this.r = ((hex >> 16) & 255) / 255;
        this.g = ((hex >> 8) & 255) / 255;
        this.b = (hex & 255) / 255;
        return this;
    }

    getHex(): number {
        return (Math.round(this.r * 255) << 16) ^ (Math.round(this.g * 255) << 8) ^ (Math.round(this.b * 255) << 0);
    }

    setHSL(h: number, s: number, l: number): this {
        // Simple HSL to RGB implementation
        h = ((h % 1) + 1) % 1;
        s = Math.max(0, Math.min(1, s));
        l = Math.max(0, Math.min(1, l));

        if (s === 0) {
            this.r = this.g = this.b = l;
        } else {
            const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
            const q = 2 * l - p;
            this.r = this.hue2rgb(q, p, h + 1 / 3);
            this.g = this.hue2rgb(q, p, h);
            this.b = this.hue2rgb(q, p, h - 1 / 3);
        }
        return this;
    }

    lerp(target: Color, t: number): this {
        this.r += (target.r - this.r) * t;
        this.g += (target.g - this.g) * t;
        this.b += (target.b - this.b) * t;
        return this;
    }

    private hue2rgb(p: number, q: number, t: number): number {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }
}

export class Box3 {
    public min: Vector3 = new Vector3(Infinity, Infinity, Infinity);
    public max: Vector3 = new Vector3(-Infinity, -Infinity, -Infinity);

    constructor(min?: Vector3, max?: Vector3) {
        if (min) this.min.copy(min);
        if (max) this.max.copy(max);
    }

    setFromCenterAndSize(center: IVector3, size: IVector3): this {
        const halfX = size.x / 2;
        const halfY = size.y / 2;
        const halfZ = size.z / 2;

        this.min.set(center.x - halfX, center.y - halfY, center.z - halfZ);
        this.max.set(center.x + halfX, center.y + halfY, center.z + halfZ);
        return this;
    }

    intersectsBox(box: Box3): boolean {
        return box.max.x < this.min.x || box.min.x > this.max.x ||
            box.max.y < this.min.y || box.min.y > this.max.y ||
            box.max.z < this.min.z || box.min.z > this.max.z ? false : true;
    }
}
