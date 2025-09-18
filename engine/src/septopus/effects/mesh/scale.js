/**
 * Effects -  mesh scale
 *
 * @fileoverview
 *  1. mesh scale effect
 *
 * @author Fuu
 * @date 2025-09-08
 */

import Toolbox from "../../lib/toolbox";

const self={
    calcRandom:(start,end)=>{
        const pa=Toolbox.precision(start);
        const pb=Toolbox.precision(end);

        return Toolbox.rand(start,end);
    },
    getValue:(value)=>{
        if(Array.isArray(value)){
            if(value.length===2){
                return self.calcRandom(value[0],value[1]);
            }else{
                return value[Toolbox.rand(0,value.length-1)];
            }
        }else{
            return value;
        }
    },
};

const Scale = (target,cfg, ck ) => {
    const { mesh } = target;
    if(!mesh || mesh.error) return false;
    const {mode,value,axis}=cfg;

    for(let i=0;i<mesh.length;i++){
        const row=mesh[i];
        const val=self.getValue(value);
        switch (mode) {
            case "add" :
                if(axis.x) row.scale.x+=val;
                if(axis.y) row.scale.z+=-val;
                if(axis.z) row.scale.y+=val;
                break;

            case "set" || "random":
                if(axis.x) row.scale.x=val;
                if(axis.y) row.scale.z=-val;
                if(axis.z) row.scale.y=val;
                break;

            case "multi":
                if(axis.x) row.scale.x*=val;
                if(axis.y) row.scale.z*=val;
                if(axis.z) row.scale.y*=val;
                break;  
        
            default:
                break;
        }
    }

    return ck && ck();
}

export default Scale;