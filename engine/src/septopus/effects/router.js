/**
 * Effects - camera
 *
 * @fileoverview
 *  1. entry of effects
 *
 * @author Fuu
 * @date 2025-07-28
 */

import Fall from "./camera/fall";
import Linger from "./camera/linger";
import Lightning from "./scene/lightning";

let camera=null;
let scene=null;

const router={
    camera:{
        fall:Fall,
        linger:Linger,
    },
    scene:{
        lightning:Lightning,
    },
};


const Effects = {
    /** 
     * set camera for effects
     * @functions
     * 1.set camera for effects
     * 
     * @param   {object}    cam   - parameters for creating 3D object
     * @returns
     * @return boolean
     */
    set:(cam,sce)=>{
        camera = cam;
        scene = sce;
        return true;
    },
    
    /** 
     * Entry to get effects,
     * @functions
     * 1.create 3D objects
     * 2.change the coordination system from three.js to Septopus world
     * @param   {string}    cat      - category of effect, ["camera","scene"]
     * @param   {string}    type     - type of effect
     * @param   {object}    params   - parameters for effect
     * @param   {function}  ck       - callback function when effect done
     * @returns
     * @return callback
     */

    get:(cat,type,params,ck)=>{

    },

    /** 
     * Entry to get effects,
     * @functions
     * 1.multi effects
     * 
     * @param   {object[]}    list      - category of effect, ["camera","scene"]
     * @returns
     * @return boolean
     */
    group:(list)=>{

    },
}

export default Effects;