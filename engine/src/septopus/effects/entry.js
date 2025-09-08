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
import Rotate from "./mesh/rotate";
import Breath from "./mesh/breath";
import Drop from "./mesh/drop";
import Shake from "./mesh/shake";
import Texture from "./mesh/texture";
import Ticker from "./mesh/ticker";

const reg={
    name:"effects",
    category:'lib',         
    desc:"",
    version:"1.0.0",
    events:["start"],
}

const active={
    camera:null,
    scene:null
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
    },
}

const router={
    camera:{
        fall:Fall,
        linger:Linger,
    },
    scene:{
        lightning:Lightning,
    },
    mesh:{
        rotate:Rotate,
        breath:Breath,
        drop:Drop,
        shake:Shake,
        texture:Texture,
        ticker:Ticker
    },
};


const vbw_effects = {
    hooks:self.hooks,
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
        active.camera = cam;
        active.scene = sce;
        return true;
    },
    
    /** 
     * Entry to get effects,
     * @functions
     * 1.create 3D objects
     * 2.change the coordination system from three.js to Septopus world
     * @param   {string}    cat      - category of effect, ["camera","scene","mesh"]
     * @param   {string}    type     - type of effect
     * @param   {object}    params   - parameters for effect
     * @param   {function}  ck       - callback function when effect done
     * @returns
     * @return callback
     */

    get:(cat,type,params,ck)=>{
        if(!router[cat] || !router[cat][type]) return {error:"Invalid effects."};

        return router[cat][type](params,active,ck);
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

export default vbw_effects;