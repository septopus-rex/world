/* 
*  Three.js geometry 
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-29
*  @there.js R175
*  @functions
*  1. create line.
*/

import * as THREE from "three";

const self={
    get:(pa,pb,texture)=>{
        // const geo = new THREE.Geometry();
        // const va=new THREE.Vector3(pa[0], pa[1], pa[2]);
        // const vb=new THREE.Vector3(pb[0], pb[1], pb[2])
        // geo.vertices.push(va,vb);

        // const line=new THREE.Line(geo,mm);
        // line.userData={type:'gridLine',data:[pa,pb]};
        // return line;
    },
    valid:(params)=>{

        return true;
    },

    //提供standard的数据输出，可以进行比较处理，也供valid来使用
    sample:()=>{
        return {
            size:[],
        }
    },
}

const geometry_line={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        return self.get(params);
    },
    standard:()=>{
        return self.sample();
    },
};

export default geometry_line;