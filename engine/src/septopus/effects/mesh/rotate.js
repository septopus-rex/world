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
    
    const {mode,value}=cfg;
    for(let i=0;i<mesh.length;i++){
        const row=mesh[i];
        row.rotation.x+=value;
        row.rotation.y+=value;
        row.rotation.z+=value;
    }
}

export default Rotate;