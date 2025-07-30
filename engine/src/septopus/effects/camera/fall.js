/**
 * Effects -  camera fall
 *
 * @fileoverview
 *  1. camera linger effect
 *
 * @author Fuu
 * @date 2025-07-28
 */

const Fall = (cfg, active, ck) => {

    const { camera } = active;
    const cvt = cfg.convert;

    const g = 9.8;
    const crouchDepth = 0.5;
    const recover = 0.4;

    const single = 50;
    const full = cfg.height + crouchDepth + recover;
    const total = 1000 * Math.sqrt(2 * full / g);

    const step = full * cvt * single / total;
    const tt = setInterval(() => {
        camera.position.set(                    
            camera.position.x,
            camera.position.y - step,       //!important, transform from Septopus to three.js     
            camera.position.z,
        );
    }, single);

    setTimeout(() => {
        clearInterval(tt);

        if(!cfg.skip){
            const r_total = 300;        //recover from fall in 300ms
            const r_step = recover * cvt * single / r_total;
            const r_tt = setInterval(() => {
                camera.position.set(                    
                    camera.position.x,
                    camera.position.y + r_step,       //!important, transform from Septopus to three.js     
                    camera.position.z,
                );
            }, single);

            setTimeout(() => {
                clearInterval(r_tt);
                return ck && ck();
            },r_total+single);
        }else{
            return ck && ck();
        }
    }, total+single);
}

export default Fall;