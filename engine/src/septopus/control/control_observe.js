/* 
*  VBW world entry
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-25
*  @functions
*  1. 
*/

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import VBW from "../core/framework";

const reg={
    name:"con_observe",        //组件名称
    category:'controller',     //组件分类
}

const config={
    id:"observe_control",
}

const self={
    hooks:{
        reg:()=>{return reg},
    }
}

const control_observe={
    hooks:self.hooks, 
    construct:()=>{
        const check=document.getElementById(config.id);
        if(check===null){
            const str=`<div id=${config.id}></div>`;
            const parser = new DOMParser();
            const doc = parser.parseFromString(str, 'text/html');
            return doc.body.firstChild
        }
    },
    start:(id)=>{
        const chain=["active","containers",id]
        const {camera, render}=VBW.cache.get(chain);
        const controls = new OrbitControls( camera, render.domElement );
        controls.update();
    },
}

export default control_observe;