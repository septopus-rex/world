/**
 * Effects -  mesh rotate
 *
 * @fileoverview
 *  1. mesh rotate effect
 *
 * @author Fuu
 * @date 2025-09-08
 */

const Rotate = (target,cfg, ck ) => {
    const {mesh}=target;
    if(!mesh || mesh.error) return false;
    
    const {mode,value, axis}=cfg;
    //console.log(axis);
    for(let i=0;i<mesh.length;i++){
        const row=mesh[i];
        if(axis.x) row.rotation.x+=value;
        if(axis.y) row.rotation.y+=value;
        if(axis.z) row.rotation.z+=value;
    }
}

export default Rotate;