import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';
import { isolateMaterial } from './MaterialUtils';

/**
 * MediaScreens — the render layer's on-mesh visual media: the e3 VIDEO screen
 * and the floating billboard LABEL (e4 book / e5 board / e1 link titles).
 * Extracted from RenderEngine (intra-layer refactor: still `render/`). Both
 * live ON the mesh (userData/child), so RenderEngine's removeHandle disposal
 * frees them on eviction — this class only creates. Headless (no DOM) → no-op.
 */
export class MediaScreens {
    /**
     * Attach a live VideoTexture to a mesh's material (video screen, e3). A
     * `<video>` → THREE.VideoTexture (auto-updates each render) → material.map,
     * on a clone-on-write material so it never bleeds onto shared cached mats.
     * Muted by default (browsers block autoplay-with-sound before a gesture).
     */
    attachVideo(
        handle: RenderHandle,
        url: string,
        opts: { autoplay?: boolean; loop?: boolean; muted?: boolean; volume?: number } = {},
    ): void {
        if (typeof document === 'undefined') return; // headless
        const mesh = handle as THREE.Object3D;
        const video = document.createElement('video');
        video.src = url;
        video.crossOrigin = 'anonymous';
        video.loop = opts.loop !== false;
        video.muted = opts.muted !== false;
        (video as any).playsInline = true;
        video.volume = opts.volume ?? 1;

        const texture = new THREE.VideoTexture(video);
        (texture as any).colorSpace = THREE.SRGBColorSpace;
        if (mesh instanceof THREE.Mesh) {
            const mat = isolateMaterial(mesh);
            mat.map = texture;
            mat.color.setHex(0xffffff); // white base so the video shows true (not tinted)
            mat.side = THREE.DoubleSide; // visible from both sides of the panel
            mat.needsUpdate = true;
        }
        (mesh.userData ??= {}).__media = { video, texture };
        if (opts.autoplay !== false) {
            video.play().catch(() => { /* autoplay may need a gesture — click-to-play is P1 */ });
        }
    }

    /**
     * Attach a floating billboard LABEL above a mesh — a camera-facing sprite
     * with canvas-rendered text — so interactive panel adjuncts (e4 book / e5
     * board / e1 link) are identifiable in-world ("which one is the book?"). The
     * label shows the adjunct's title; depthTest off so it reads over geometry;
     * disposed with the mesh in removeHandle. Headless has no canvas → guard.
     */
    attachLabel(handle: RenderHandle, text: string, heightOffset = 1.0): void {
        const mesh = handle as THREE.Object3D;
        if (!mesh || !text || typeof document === 'undefined') return;
        const FONT = 46, PAD_X = 30, PAD_Y = 20;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.font = `bold ${FONT}px sans-serif`;
        const tw = Math.ceil(ctx.measureText(text).width);
        const w = tw + PAD_X * 2, h = FONT + PAD_Y * 2;
        canvas.width = w; canvas.height = h;
        ctx.font = `bold ${FONT}px sans-serif`;     // measuring reset the context state
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const r = 20;
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r);
        ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r); ctx.closePath();
        ctx.fillStyle = 'rgba(14,20,28,0.85)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(120,200,255,0.35)'; ctx.stroke();
        ctx.fillStyle = '#cfe9ff'; ctx.fillText(text, w / 2, h / 2 + 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        const worldH = 0.34;                        // readable height in metres
        sprite.scale.set(worldH * (w / h), worldH, 1);
        sprite.position.set(0, heightOffset, 0);
        sprite.renderOrder = 999;
        sprite.raycast = () => { /* labels never intercept interaction rays */ };
        mesh.add(sprite);
    }
}
