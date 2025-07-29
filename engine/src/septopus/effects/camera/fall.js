/**
 * Effects -  camera fall
 *
 * @fileoverview
 *  1. camera linger effect
 *
 * @author Fuu
 * @date 2025-07-28
 */

const Fall=(cfg,active,ck)=>{
    //console.log(cfg,active);
    const { camera }=active;
    const g=9.8;
    const crouchDepth = 0.5;

        const single=50;
        const full=cfg.height+crouchDepth;
        const total = 1000*Math.sqrt(2 * full / g);
        const cvt=cfg.convert;

        
        const step=cfg.height*cvt*single/total;
        const tt = setInterval(()=>{
            camera.position.set(                    //!important, transform from Septopus to three.js
                camera.position.x ,
                camera.position.y - step,
                camera.position.z ,
            );
        },single);

        setTimeout(()=>{
            clearInterval(tt);
            const recover=800;
            

            return ck && ck();
        },total);
}

export default Fall;