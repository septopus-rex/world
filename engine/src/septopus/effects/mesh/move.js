/**
 * Effects -  mesh position
 *
 * @fileoverview
 *  1. mesh moving effect
 *
 * @author Fuu
 * @date 2025-09-08
 */

const Move = (target, cfg , ck) => {
    const {mesh}=target;
    if(!mesh || mesh.error) return false;
    
    const {mode,value, axis}=cfg;
    for(let i=0;i<mesh.length;i++){
        const row=mesh[i];
        if(axis.x) row.position.x+=value;
        if(axis.y) row.position.z+=-value;
        if(axis.z) row.position.y+=value;
    }
}

export default Move;