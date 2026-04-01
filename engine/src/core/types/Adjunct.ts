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

export type MeshType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'module';

export interface RenderParams {
    size: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
}

/** 
 * Handle to a rendering instance (e.g. THREE.Object3D).
 * The core engine should treat this as an opaque reference.
 */
export type RenderHandle = any;

export interface MaterialConfig {
    resource?: string | string[];   // 纹理资源引用
    color?: number;                 // 颜色（十六进制）
    repeat?: [number, number];      // 纹理重复
    offset?: [number, number];      // 纹理偏移
    rotation?: number;              // 纹理旋转
    opacity?: number;               // 透明度 [0, 1]
}

export interface RenderObject {
    type: string; // Keep as string for now to support custom types, but MeshType is preferred
    index?: number;
    params: RenderParams;
    hidden?: boolean;
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
