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
    const recover = 0.4;
    const single = 50;
    const full =  cfg.height + recover;
    const total = 1000 * Math.sqrt(2 * full / g);

    const last = camera.position.y - full * cvt + recover * cvt;            //last stand height

    const step = full * cvt * single / total;
    const tt = setInterval(() => {
        camera.position.set(                    
            camera.position.x,
            camera.position.y - step,       //!important, transform from Septopus to three.js     
            camera.position.z,
        );
        //console.log(`Changing Z: `, camera.position.y);
    }, single);

    setTimeout(() => {
        clearInterval(tt);
        //console.log(`Fall done Z: `, camera.position.y);

        if(!cfg.skip){
            const r_total = 300;        //recover from fall in 300ms
            const r_step = recover * cvt * single / r_total;
            const r_tt = setInterval(() => {
                camera.position.set(                    
                    camera.position.x,
                    camera.position.y + r_step,       //!important, transform from Septopus to three.js     
                    camera.position.z,
                );
                //console.log(`Recovering Z: `, camera.position.y);
            }, single);

            setTimeout(() => {
                clearInterval(r_tt);
                //console.log(`Final Z: `, camera.position.y);
                camera.position.y = last;
                return ck && ck();
            },r_total);
        }else{
            camera.position.y = last;
            return ck && ck();
        }
    }, total);
}

export default Fall;