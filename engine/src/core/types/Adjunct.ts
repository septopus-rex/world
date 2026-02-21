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

export interface RenderObject {
    type: string;
    index: number;
    params: any;
    hidden?: boolean;
    material?: any;
    stop?: any;
    animate?: any;
    event?: any;
}

export interface AdjunctTransform {
    stdToRenderData(stds: STDObject[], elevation: number): RenderObject[];
}

export interface AdjunctMenu {
    pop(std: STDObject): any[];
    sidebar(std: STDObject): Record<string, any[]>;
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
