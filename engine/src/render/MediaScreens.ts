import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';
import { isolateMaterial } from './MaterialUtils';
import { paintPlate } from './TextPlate';

/** Per-sprite label geometry, stashed on the sprite as observable metadata: what
 *  the sizing decision was made of. Read by e2e (label-proximity.spec) to check
 *  the on-screen text size; nothing at runtime depends on it. */
interface LabelInfo {
    /** width / height of the canvas. */
    aspect: number;
    /** Fraction of the sprite's height that is GLYPH (the rest is padding) — the
     *  20 px target is a target for TEXT, which is what a reader perceives. */
    textFrac: number;
    /** The label's fixed world height in metres (see MediaScreens.worldHeightFor). */
    worldH: number;
}

/**
 * MediaScreens — the render layer's on-mesh visual media: the e3 VIDEO screen
 * and the floating billboard LABEL (e4 book / e5 board / e1 link titles).
 * Extracted from RenderEngine (intra-layer refactor: still `render/`). Both
 * live ON the mesh (userData/child), so RenderEngine's removeHandle disposal
 * frees them on eviction — this class only creates. Headless (no DOM) → no-op.
 */
export class MediaScreens {
    // ── Label proximity gate ───────────────────────────────────────────────────
    // Labels are depthTest:false billboards — always-on they read over the whole
    // scene from any distance (visual noise). Pure VIEW policy: fully readable
    // inside LABEL_FULL metres of the camera, fade out to LABEL_MAX, hidden
    // beyond. No data field, no simulation impact — updateLabels is driven from
    // RenderEngine.render() on a frame throttle.
    private static readonly LABEL_FULL = 6;
    private static readonly LABEL_MAX = 9;

    // ── Label size ─────────────────────────────────────────────────────────────
    // A label is a physical sign hanging in the world: ONE fixed world size, set
    // once at creation, never touched again. It gets bigger as you walk up to it
    // and smaller as you leave, exactly like the object it names.
    //
    // The size is not picked by eye — it is solved so that at a typical reading
    // distance the TEXT lands on LABEL_TEXT_PX. The 0.34 m it used to be was
    // solved for nothing, and up close came out at ~90 px of text: on a phone
    // viewport a caption saying "which object is this?" was the loudest thing in
    // frame, louder than the world it annotates.
    //
    // Why the size is FIXED rather than re-solved per frame against the live
    // camera: a per-frame solve holds the pixel size constant, which is a HUD,
    // not a sign — and updateLabels runs on a 10-frame throttle, so what you
    // actually see while walking is the label stepping between sizes. A sign that
    // never resizes cannot stutter, at any throttle. If you want a different
    // apparent size, move LABEL_TEXT_PX; leave the mechanism alone.
    /** Target height of the GLYPHS, in CSS px, at the reference viewing setup. */
    private static readonly LABEL_TEXT_PX = 20;
    /** Reference viewing setup the size is solved against.
     *  · depth 4.75 m — measured third-person camera depth with the player right
     *    up against the object (label-proximity.spec); the closest you normally
     *    read one from. First person can get nearer, and the sign will get
     *    bigger; that is what a sign does.
     *  · viewport 900 CSS px tall — a portrait phone, and close to a maximised
     *    desktop canvas. Halving the viewport halves the apparent px, as with
     *    every other thing in the scene. */
    private static readonly REF_DEPTH_M = 4.75;
    private static readonly REF_VIEWPORT_PX = 900;
    /** Main camera vertical FOV (RenderEngine's PerspectiveCamera), degrees. */
    private static readonly REF_FOV_DEG = 45;

    /**
     * World height of the whole sprite (glyphs + padding), solved from the above.
     * A sprite of world height H at view depth d covers
     *     px = viewportPx · H / (2 · d · tan(fov/2))
     * pixels vertically; invert for H, and divide by the glyph fraction so that
     * LABEL_TEXT_PX describes the TEXT rather than the padded plate. ≈ 0.163 m.
     */
    private static worldHeightFor(textFrac: number): number {
        const tanHalfFov = Math.tan(MediaScreens.REF_FOV_DEG * Math.PI / 360);
        const metresPerPx = (2 * MediaScreens.REF_DEPTH_M * tanHalfFov) / MediaScreens.REF_VIEWPORT_PX;
        return (MediaScreens.LABEL_TEXT_PX * metresPerPx) / textFrac;
    }

    private readonly labels = new Set<THREE.Sprite>();
    private readonly _tmpPos = new THREE.Vector3();

    /**
     * Re-evaluate every registered label against the camera (render-space on
     * both sides, so the floating origin cancels). Visibility and fade ONLY —
     * the sprite's size is fixed at creation and deliberately not touched here.
     * Sprites whose handle was evicted (detached from the scene) self-unregister.
     */
    updateLabels(camPos: THREE.Vector3, scene: THREE.Object3D): void {
        for (const sprite of this.labels) {
            let root: THREE.Object3D = sprite;
            while (root.parent) root = root.parent;
            if (root !== scene) { this.labels.delete(sprite); continue; } // evicted with its mesh
            const dist = sprite.getWorldPosition(this._tmpPos).distanceTo(camPos);
            if (dist >= MediaScreens.LABEL_MAX) {
                sprite.visible = false;
                continue;
            }
            sprite.visible = true;
            (sprite.material as THREE.SpriteMaterial).opacity = dist <= MediaScreens.LABEL_FULL
                ? 1
                : 1 - (dist - MediaScreens.LABEL_FULL) / (MediaScreens.LABEL_MAX - MediaScreens.LABEL_FULL);
        }
    }
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

    /** Canvas height for a plate texture, px. The plate is ~0.25 m tall on a
     *  reference book, so this is ~750 px/m — above the 512 px/m texture baseline,
     *  and above the ~140 px the plate covers on screen even pressed up against it.
     *  Higher buys nothing and every book carries two of these. */
    private static readonly PLATE_TEX_H = 192;

    /**
     * Engrave text onto a mesh's face — the e4 book's cover title (see
     * core/types/Adjunct PlateConfig for why the title lives on the cover rather
     * than on a billboard over it).
     *
     * The canvas aspect is derived from the mesh's own box dimensions so the
     * letters are never stretched: the plate is a thin box, its thinnest axis is
     * the face normal, and the remaining two give the face. Painted on a
     * clone-on-write material (the plaque's colour material is shared by every
     * other brass part in the world) and recorded on userData so removeHandle
     * frees the texture — Material.dispose does NOT free its map.
     * Headless has no canvas → no-op, like the rest of this class.
     */
    attachTextPlate(handle: RenderHandle, text: string): void {
        const mesh = handle as THREE.Mesh;
        if (!mesh || !(mesh as any).isMesh || !text || typeof document === 'undefined') return;
        const p = (mesh.geometry as THREE.BoxGeometry)?.parameters as
            { width: number; height: number; depth: number } | undefined;
        if (!p) return;
        // Face = the two axes that are not the thinnest. BoxGeometry's ±Z and ±Y
        // faces both run U along X; the ±X faces run U along Z.
        const { width: bw, height: bh, depth: bd } = p;
        const aspect = bw <= bh && bw <= bd ? bd / bh      // thin along X → face is Z×Y
            : bh <= bd ? bw / bd                           // thin along Y → face is X×Z
                : bw / bh;                                 // thin along Z → face is X×Y
        if (!Number.isFinite(aspect) || aspect <= 0) return;

        const h = MediaScreens.PLATE_TEX_H;
        const w = Math.max(8, Math.round(h * aspect));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const layout = paintPlate(ctx, w, h, text);

        const tex = new THREE.CanvasTexture(canvas);
        (tex as any).colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;                 // read at a glancing angle more often than head-on
        const mat = isolateMaterial(mesh);
        mat.map = tex;
        mat.needsUpdate = true;
        (mesh.userData ??= {}).__plate = { texture: tex, text, fontPx: layout.fontPx, lines: layout.lines };
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
        // Mipmapped minification (three's CanvasTexture default) is load-bearing
        // now that the 46 px glyphs are rasterised well ABOVE the ~20 CSS px they
        // are drawn at (headroom for walking closer, and for retina). A plain
        // LinearFilter skips texels under 2× minification and the text shimmers.
        tex.magFilter = THREE.LinearFilter;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        // Fixed physical size, solved once — see the LABEL_TEXT_PX block.
        const textFrac = FONT / h;
        const worldH = MediaScreens.worldHeightFor(textFrac);
        sprite.scale.set(worldH * (w / h), worldH, 1);
        sprite.userData.__label = { aspect: w / h, textFrac, worldH } satisfies LabelInfo;
        sprite.position.set(0, heightOffset, 0);
        sprite.renderOrder = 999;
        sprite.raycast = () => { /* labels never intercept interaction rays */ };
        sprite.visible = false;                     // hidden until updateLabels proves it near
        mesh.add(sprite);
        this.labels.add(sprite);
    }
}
