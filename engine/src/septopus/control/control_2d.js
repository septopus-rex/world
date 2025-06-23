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
//import TwoObject from "../lib/two";

import Touch from "../lib/touch";

const reg = {
    name: "con_two",
    category: 'controller',
    desc: "",
    version: "1.0.0",
}

const config = {
    scale: {
        up: "scale_up",
        down: "scale_down",
        now: "scale_now",
    },
    render: "rd_two",
    zoom:{
        bar:"zoom_bar",
        info:"zoom_debug",
    },
    debug:true,
    select:{
        width:1,
        color:'#00CCDD',
        anticlock:true
    }
}

const env = {
    player:null,                //player status
    render: null,               //render actions
    pre:null,                   //previous mouse position
    pan: false,                 // pan canvas
    height:0,                   //canvas height
    position:{left:0,top:0},    //canvas position
    gestures:false,             //whether gestures
    distance:0,                 //last gestures to calc scale
    
}   

const self = {
    hooks: {
        reg: () => { return reg },
    },
    getDom: (data) => {
        const parser = new DOMParser();
        return parser.parseFromString(data, 'text/html');
    },
    isGestures:(ev)=>{
        if(!ev || !ev.touches) return false;
        if(ev.touches.length === 2) return true;
        return false;
    },
    getTouchPoint: (ev,anti) => {
        if(!ev || !ev.touches) return [0,0];
        const evt=ev.touches[0];
        const pos = env.position;
        if(anti) return [evt.clientX - pos.left,env.height-(evt.clientY - pos.top)];
        return [evt.clientX - pos.left,evt.clientY - pos.top];
    },
    getMousePoint:(ev)=>{
        return [ev.clientX,ev.clientY]
    },

    updateScale: (val) => {
        const pointer = document.querySelector(`#${config.scale.now} span`);
    },
    bindScaleUp: () => {
        const id = config.scale.up;
        const el = document.getElementById(id);
        el.addEventListener("click", (ev) => {
            console.log(`scale up`);
        });
    },
    bindScaleDown: () => {
        const id = config.scale.down;
        const el = document.getElementById(id);
        el.addEventListener("click", (ev) => {
            console.log(`scale down`);
        });
    },
    cvsPan:(from,to)=>{
        const cx=to[0]-from[0];
        const cy=to[1]-from[1];
        return env.render.move(cx,cy);
    },
    cvsScale:(point,delta)=>{
        return env.render.scale(point,delta);
    },
    touch:(dom_id)=>{
        const id=`#${dom_id} canvas`;
        Touch.on(id,"doubleTap",(ev)=>{
            console.log(`Double`);
        });
        // Touch.on(id,"singleTap",(ev)=>{
        //     console.log(ev);
        // });

        // Touch.on(dom_id,"singleTap",(ev)=>{

        // });
    },

    screen: (dom_id) => {
        const cvs = document.querySelector(`#${dom_id} canvas`);

        cvs.addEventListener("touchstart", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            //1.check gestures
            if(self.isGestures(ev)){
                env.gestures=true;
            }else{
                env.pan = true;
            }

            //2.check selected block
            const point=self.getTouchPoint(ev,true);
            const bk = env.render.select(point,config.select);
            self.info(`${JSON.stringify(bk)} is selected`);
        });

        cvs.addEventListener("touchmove", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            self.info("Touch moving...");
            //console.log(`Touch moving...`);
            if(self.isGestures(ev)){
                console.log(`Gestures scale.`);
                const f1=ev.touches[0],f2=ev.touches[1];
                const dx = f1.clientX - f2.clientX;
                const dy = f1.clientY - f2.clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if(env.distance===0){
                    env.distance=distance;
                }else{
                    const scale=distance/env.distance;
                    const mid=[(f1.clientX+f2.clientX)*0.5,(f1.clientY + f2.clientY)*0.5];
                    self.info(`Scale:${scale}`);
                    self.cvsScale(mid,scale);
                    env.distance=distance;
                }
            }else{
                if(env.pre===null) return env.pre=self.getTouchPoint(ev);
                const now=self.getTouchPoint(ev);
                self.cvsPan(env.pre,now);
                env.pre=now;
            }
        });

        cvs.addEventListener("touchend", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            
            if(env.gestures){
                env.gestures=false;
            }else{
                env.pan = false;
                env.pre = null;
            }
        });
    },
    pan:(dom_id)=>{
        const cvs = document.querySelector(`#${dom_id} canvas`);
        cvs.addEventListener("click", (ev) => {
            //console.log(`clicked.`);
            env.pan = !env.pan;
            if(!env.pan) env.pre=null;
        });
    },
    mouse: (dom_id) => {
        const cvs = document.querySelector(`#${dom_id} canvas`);
        cvs.addEventListener("mousewheel", (ev) => {
            const point=self.getMousePoint(ev);
            const delta=1;
            self.cvsScale(point,delta);
        });

        cvs.addEventListener("mousemove", (ev) => {
            if (!env.pan) return false;
            if(env.pre===null) return env.pre=self.getMousePoint(ev);
            const now=self.getMousePoint(ev);
            self.cvsMove(env.pre,now);
            env.pre=now;
        });
    },
    info:(ctx,at)=>{
        if(!config.debug) return false;
        const el=document.getElementById(config.zoom.info);
        el.innerHTML=ctx;
        if(!!at){
            setTimeout(()=>{
                el.innerHTML="";
            },at);
        }
    },
    status:()=>{
        //console.log(env.player);
        const player=env.player;
        const ctx=`Block ${JSON.stringify(player.location.block)}`;

        self.info(ctx);
    },
    construct: (dom_id) => {
        const device=VBW.cache.get(["env","device"]);

        //1.create dom for scale
        const cvs = document.querySelector(`#${dom_id} canvas`);
        if (cvs === null) return false;
        const ctx = `<div>
            <div class="zoom" id="${config.zoom.bar}">
                <div class="zoom_top" id="${config.scale.up}">+</div>
                <div id="${config.scale.now}">
                    <span class="zoom_button"></span>
                </div>
                <div class="zoom_bottom" id="${config.scale.down}">-</div>
            </div>
            <div id="${config.zoom.info}"></div>
        </div>`;
        const doc = self.getDom(ctx);
        const el = document.getElementById(dom_id);
        el.appendChild(doc.body.firstChild);

        //2.screen binding
        if(!device.mobile){
            const zoom = document.getElementById(config.zoom.bar);
            zoom.style.display="block";
            self.bindScaleUp();
            self.bindScaleDown();
            self.pan(dom_id);
            self.mouse(dom_id);
        }else{
            self.touch(dom_id);
            //self.screen(dom_id);    
        }

        //3. set postion of canvas
        const rect = cvs.getBoundingClientRect();
        env.position.left=rect.left;
        env.position.top=rect.top;
        env.height=rect.height;
    },
}

const control_2d = {
    hooks: self.hooks,
    start: (dom_id) => {
        self.construct(dom_id);
        if (env.render === null) env.render = VBW[config.render].control;

        //console.log(`Binding actions to 2D map of ${dom_id}`,env);
        if(env.player===null) env.player=VBW.cache.get(["env","player"]);

        self.status();
    },
}

export default control_2d;