/* 
*  Three.js camera function 
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-26
*  @there.js R175
*  @functions
*  1. create different kind of camera.
*/

import * as THREE from "three";
const Camera={
    create:(cfg)=>{
        const type=!cfg.type?"perspective":cfg.type;

        let cam=null;
        switch (type) {
            case "perspective":
                cam = new THREE.PerspectiveCamera(
                    cfg.fov,                    //len fov
                    cfg.width / cfg.height,     //camScale
                    cfg.near,                   //0.1, 
                    cfg.far                     //1000
                );
                break;

            case "observer":

                break;

            case "":

                break;
        
            default:
                break;
        }

        if(cam===null) return {error:"Invalid camera type."};

        return cam
    },
}

export default Camera;