/**
 * Three.js extend function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create outline of 3D object
 *
 * @author Fuu
 * @date 2025-05-21
 */

import * as THREE from "three";
const self={
    /*按照给定的值生成box外轮廓线的方法
     * @param	size	array		//[x,y,z]的数据
     * @param	pos		array		//[ox,oy,oz]的数据 
     * @param	ro		array		//[rx,ry,rz]的数据
     * @param	pd		number	    //轮廓偏移的位置
     * */
    get:  (size, pos, ro, pd, color)=>{
        const d = pd + pd
        const gg = new THREE.BoxGeometry(size[0] + d, size[1] + d, size[2] + d);
        const eg = new THREE.EdgesGeometry(gg);
        const mm = self.getLineBasicMaterial(color ? color : '#FF0000');
        const eline = new THREE.LineSegments(eg, mm);
        eline.position.set(pos[0], pos[1], pos[2] + d);
        eline.rotation.set(ro[0], ro[1], ro[2]);
        return eline;
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

const extend_outline={
    create:(params)=>{
        if(!self.valid(params)) return {error:"Invalid parameters to create BOX."};
        const {size} = params;
        return new THREE.BoxGeometry(size[0], size[1], size[2] );
    },
    standard:()=>{
        return self.sample();
    },
};

export default extend_outline;