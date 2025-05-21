import * as THREE from "three";

const self={
    get:(size,position,rotation,material)=>{

    },
    valid:(params)=>{

        return true;
    },

    //提供standard的数据输出，可以进行比较处理，也供valid来使用
    sample:()=>{
        return {
            color:"#ffffff",
        }
    },
}

const material_meshbasic={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        
        if(!params.side) params.side=THREE.DoubleSide;

        return new THREE.MeshBasicMaterial(params);
    },
    standard:()=>{
        return self.sample();
    },
};

export default material_meshbasic;