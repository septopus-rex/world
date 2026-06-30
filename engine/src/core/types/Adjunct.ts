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
