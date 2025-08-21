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
        step:0.1,
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
    center:[0,0],               //2D 
    pan: false,                 //pan canvas
    height:0,                   //canvas height
    position:{left:0,top:0},    //canvas position
    zoom:1,                     //default scale multi rate
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
    // updateScale: (val) => {
    //     const pointer = document.querySelector(`#${config.scale.now} span`);
    // },
    setScalor:(rate)=>{
        const el=document.getElementById(config.zoom.bar);
        const height=el.clientHeight;

        //console.log(el.clientHeight);
        const pointer=document.getElementById(config.scale.now);
        const size=pointer.clientHeight;
        //console.log(pointer,height);
        pointer.style.top=`${height*rate*0.01-size*0.5}px`;
    },
    setCenter:(el)=>{
        console.log([0.5*el.clientWidth,0.5*el.clientHeight]);
        env.center=[0.5*el.clientWidth,0.5*el.clientHeight];
    },
    bindScaleUp: () => {
        const id = config.scale.up;
        const el = document.getElementById(id);
        el.addEventListener("click", (ev) => {
            console.log(`scale up`,env.center);
            self.cvsScale(env.center,1+config.zoom.step);
        });
    },
    bindScaleDown: () => {
        const id = config.scale.down;
        const el = document.getElementById(id);
        el.addEventListener("click", (ev) => {
            console.log(`scale down`,env.center);
            self.cvsScale(env.center, 1-config.zoom.step);
        });
    },
    cvsPan:(from,to)=>{
        const cx=to[0]-from[0];
        const cy=to[1]-from[1];
        return env.render.move(cx,cy);
    },
    cvsScale:(point,scale)=>{
        const cx=point[0]-env.center[0];
        const cy=point[1]-env.center[1];
        return env.render.scale(cx,cy,scale);
    },
    screen:(dom_id)=>{
        const id=`#${dom_id} canvas`;
        Touch.on(id,"doubleTap",(ev)=>{
            console.log(`Double`);
        });
        Touch.on(id,"touchStart",(point)=>{
            env.pre=point;
            const cp=[point[0],env.height-point[1]];
            const bk = env.render.select(cp,config.select);
            self.info(`${JSON.stringify(bk)} is selected`);
        });
        Touch.on(id,"touchMove",(point,distance)=>{
            self.cvsPan(env.pre,point);
            env.pre=point;
        });
        Touch.on(id,"touchEnd",()=>{
            env.pre=null;
        });

        Touch.on(id,"gestureStart",(mid)=>{
            env.center=point;
        });

        Touch.on(id,"gestureMove",(mid,scale)=>{
            self.info(scale);

            env.zoom = self.cvsScale(mid,scale);
            env.center = point;
        });

        Touch.on(id,"gestureEnd",()=>{
            env.center=null;
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
            // const point=self.getMousePoint(ev);
            // const delta=1;
            // self.cvsScale(point,delta);
        });

        cvs.addEventListener("mousemove", (ev) => {
            if (!env.pan) return false;
            if(env.pre===null) return env.pre=self.getMousePoint(ev);
            const now=self.getMousePoint(ev);
            self.cvsPan(env.pre,now);
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
                <div >
                    <span class="zoom_button" id="${config.scale.now}"></span>
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
            self.setCenter(cvs);
            self.setScalor(50);         //set tag to center
            self.bindScaleUp();
            self.bindScaleDown();
            self.pan(dom_id);
            self.mouse(dom_id);
        }else{
            self.screen(dom_id);    
        }

        //3. set postion of canvas
        const rect = cvs.getBoundingClientRect();
        env.position.left=rect.left;
        env.position.top=rect.top;
        env.height=rect.height;
    },
}

const controller = {
    hooks: self.hooks,
    start: (dom_id) => {
        self.construct(dom_id);

        if (env.render === null) env.render = VBW[config.render].control;

        //console.log(`Binding actions to 2D map of ${dom_id}`,env);
        if(env.player===null) env.player=VBW.cache.get(["env","player"]);

        self.status();
    },
}

export default controller;