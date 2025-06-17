/**
 * 2D controller for 2D map
 *
 * @fileoverview
 *  1. screen interaction support
 *  2. 
 *
 * @author Fuu
 * @date 2025-04-25
 */

import VBW from "../core/framework";
const reg={
    name:"con_two",
    category:'controller',
    desc:"",
    version:"1.0.0",
}

const config={
    scale:{
        up:"scale_up",
        down:"scale_down",
        now:"scale_now",
    },
    render:"rd_two",
}

const env={
    pan:false,          //wether pan canvas
    render:null,        //render actions
}

const self={
    hooks:{
        reg:()=>{return reg},
    },
    getDom: (data) => {
        const parser = new DOMParser();
        return parser.parseFromString(data, 'text/html');
    },
    updateScale:(val)=>{
        const pointer = document.querySelector(`#${config.scale.now} span`);
    },
    bindScaleUp:()=>{
        const id=config.scale.up;
        const el=document.getElementById(id);
        el.addEventListener("click",(ev)=>{
            console.log(`scale up`);
        });
    },
    bindScaleDown:()=>{
        const id=config.scale.down;
        const el=document.getElementById(id);
        el.addEventListener("click",(ev)=>{
            console.log(`scale down`);
        });
    },
    screen:(dom_id)=>{
        const cvs = document.querySelector(`#${dom_id} canvas`);
        cvs.addEventListener("touchstart",(ev)=>{
            console.log(`touched.`);
        });

        cvs.addEventListener("click",(ev)=>{
            console.log(`clicked.`);
        });
    },
    mouse:(dom_id)=>{
        const cvs = document.querySelector(`#${dom_id} canvas`);
        cvs.addEventListener("mousewheel",(ev)=>{
            console.log(`mouse`,ev);
        });
    },
    construct: (dom_id) => {
        //1.create dom for scale
        const cvs = document.querySelector(`#${dom_id} canvas`);
        //console.log(cvs);
        if(cvs===null) return false;
        const ctx = `<div class="zoom">
            <div class="zoom_top" id="${config.scale.up}">+</div>
            <div id="${config.scale.now}">
                <span class="zoom_button"></span>
            </div>
            <div class="zoom_bottom" id="${config.scale.down}">-</div>
        </div>`;
        const doc = self.getDom(ctx);
        const el=document.getElementById(dom_id);
        el.appendChild(doc.body.firstChild);

        //2.bind actions
        self.bindScaleUp();
        self.bindScaleDown();

        //3.screen binding
        self.screen(dom_id);
        self.mouse(dom_id);
    },
}

const control_2d={
    hooks:self.hooks,
    start: (dom_id) => {
        self.construct(dom_id);
        if(env.render===null) env.render=VBW[config.render].control;
 
        console.log(`Binding actions to 2D map of ${dom_id}`,env);
    },
}

export default control_2d;