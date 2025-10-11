/**
 * Three.js controller function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create different kind of controller.
 *
 * @author Fuu
 * @date 2025-06-07
 */


//import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const self={
    get:(type,params)=>{
        let controller=null;
        switch (type) {
            case "orbit":
                const {renderer,camera }=params;
                controller = new OrbitControls(camera, renderer.domElement);

                // controls.enableDamping = true; // 开启阻尼（惯性）
                // controls.dampingFactor = 0.05;
                // controls.minDistance = 2;      // 最小缩放距离
                // controls.maxDistance = 50;     // 最大缩放距离
                // controls.maxPolarAngle = Math.PI / 2; // 限制俯仰角（不能转到地下）

                break;
        
            default:
                break;
        }
        return controller;
    },
    valid:(params)=>{

        return true;
    },
};

const Controller={
    create:(input)=>{
        if(!self.valid(input)) return {error:"Invalid parameters to create BOX."};
        const cfg={

        };
        return self.get(input.type, input.params);
    }
};

export default Controller;