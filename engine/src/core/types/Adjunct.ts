import { FormGroup, ContextMenuItem } from './EditTask';

export interface ComponentMeta {
    name: string;
    short: string;
    typeId: number;
    binarySize?: number;
    desc: string;
    version: string;
}

export interface STDObject {
    x: number;
    y: number;
    z: number;
    ox: number; // offset x
    oy: number;
    oz: number;
    rx: number; // rotation x
    ry: number;
    rz: number;
    event?: any;
    [key: string]: any;
}

export type MeshType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'tube' | 'module';

export interface RenderParams {
    size: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
    /** Tube/extrude control points in object-local engine space (type 'tube').
     *  The mesh is a Catmull-Rom sweep through these points — rails, pipes,
     *  coaster track. size[0]=radius, size[1]=radial segments (default 8). */
    path?: [number, number, number][];
    /** Close the swept curve into a loop (type 'tube'). */
    closed?: boolean;
}

/** 
 * Handle to a rendering instance (e.g. THREE.Object3D).
 * The core engine should treat this as an opaque reference.
 */
export type RenderHandle = any;

export interface MaterialConfig {
    resource?: string | string[];   // 旧色板/资源索引（legacy color index）
    texture?: string;               // 贴图资源 id（经 ResourceManager.getTexture 加载并赋为 .map）
    color?: number;                 // 颜色（十六进制；贴图存在时作为 tint，纯贴图用 0xffffff）
    repeat?: [number, number];      // 纹理重复（在尺寸推导 UV 平铺之上的额外乘子）
    offset?: [number, number];      // 纹理偏移
    rotation?: number;              // 纹理旋转
    opacity?: number;               // 透明度 [0, 1]
    fit?: boolean;                  // 贴图贴满整面（0..1 UV，标签/贴花），而非按尺寸平铺
    unlit?: boolean;                // 无光照（MeshBasicMaterial）：路标/贴花等须恒定可读的图面
    roughness?: number;             // PBR 粗糙度 [0,1]；缺省用引擎默认（见 MeshFactory）
    metalness?: number;             // PBR 金属度 [0,1]；缺省用引擎默认（见 MeshFactory）
    normalMap?: string;             // 法线贴图资源 id（赋为 .normalMap）
    normalScale?: [number, number]; // 法线缩放系数，默认 [1, 1]
    roughnessMap?: string;          // 粗糙度贴图资源 id（赋为 .roughnessMap）
    metalnessMap?: string;          // 金属度贴图资源 id（赋为 .metalnessMap）
    aoMap?: string;                 // 环境光遮蔽贴图资源 id（赋为 .aoMap）
    emissiveMap?: string;           // 自发光贴图资源 id（赋为 .emissiveMap）
    emissive?: number;              // 自发光颜色（十六进制；默认 0x000000）
    ormMap?: string;                // 复合 ORM 贴图资源 id（R: AO, G: Roughness, B: Metallic）
}

/**
 * A/V media directive on a render part (audio emitter / video screen adjuncts).
 * The plugin declares it purely (source + playback params); the render layer
 * materializes it — audio → PositionalAudio, video → VideoTexture on the mesh's
 * material. Pure-core: no Three/DOM here. See specs/av-media-adjuncts.md.
 */
export interface MediaConfig {
    kind: 'audio' | 'video';
    /** Audio/video resource id, URL, or CID (resolved via ResourceManager). */
    source: string;
    autoplay?: boolean;
    loop?: boolean;
    /** Video only — start muted (browsers block autoplay-with-sound pre-gesture). */
    muted?: boolean;
    volume?: number;
    /** Audio only — PositionalAudio distance-attenuation reference radius. */
    refDistance?: number;
}

/**
 * Text ENGRAVED on a render part's face (the e4 book's cover title plate).
 * The plugin declares the string purely; the render layer rasterises it to a
 * canvas texture and assigns it as that part's map — same shape as MediaConfig,
 * and for the same reason: no Three/DOM in core.
 *
 * Why a part and not the floating billboard label: a caption hovering over a
 * book is a HUD annotation, not an object — it reads as a game marker parked in
 * front of the scene. A real book carries its title on its cover, so the title
 * goes where the eye already expects it and the object stops needing a caption.
 */
export interface PlateConfig {
    /** The line to engrave. Wrapped and size-fitted by the render layer. */
    text: string;
    /** Plate treatment. 'label' = a bookbinder's paper label, ink on ivory. */
    style?: 'label';
}

export interface RenderObject {
    type: string; // Keep as string for now to support custom types, but MeshType is preferred
    index?: number;
    params: RenderParams;
    hidden?: boolean;
    /** Build the mesh but render nothing (visible=false). Still raycastable —
     *  used by touch-enabled trigger volumes. */
    invisible?: boolean;
    material?: MaterialConfig;
    /** A/V media to attach to this part's mesh (audio emitter / video screen). */
    media?: MediaConfig;
    /** Text to engrave on this part's face (book title plate). */
    plate?: PlateConfig;
    stop?: any; // ColliderMaterial
    animate?: any; // AnimateRef
    event?: any;
    resource?: string; // For modules
}

export interface AdjunctTransform {
    stdToRenderData(stds: STDObject[], elevation: number): RenderObject[];
    createMesh?(data: RenderObject): RenderHandle;
}

export interface AdjunctMenu {
    pop?(std: STDObject): any[];
    sidebar?(std: STDObject): Record<string, any[]>;
    contextMenu?(std: STDObject): ContextMenuItem[];
    form?(std: STDObject): FormGroup[];
}

export interface AdjunctAttribute {
    serialize(std: STDObject): any;
    deserialize(data: any): STDObject;
}

export interface AdjunctDefinition {
    hooks: {
        reg: () => ComponentMeta;
        init: () => { chain: string; value: any };
    };
    transform: AdjunctTransform;
    menu?: AdjunctMenu;
    attribute?: AdjunctAttribute;
}
