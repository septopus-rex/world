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
        step:0.03,
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
    float:false,                //wether float scale
    bar:{                       //scale rate bar
        height:0,
        now:0,
        header:40,
        footer:50,
        pre:null,               //pre click point, to check direction
    },
    dialog:{
        title:"",
    }
}   

const self = {
    hooks: {
        reg: () => { return reg },
    },
    getDom: (data) => {
        const parser = new DOMParser();
        return parser.parseFromString(data, 'text/html');
    },
    getTouchPoint: (ev,anti) => {
        if(!ev || !ev.touches) return [0,0];
        const evt=ev.touches[0];
        const pos = env.position;
        if(anti) return [evt.clientX - pos.left,env.height-(evt.clientY - pos.top)];
        return [evt.clientX - pos.left,evt.clientY - pos.top];
    },
    getMousePoint:(ev,anti)=>{
        const pos = env.position;
        if(anti) return [ev.clientX - pos.left,env.height-(ev.clientY - pos.top)];
        return [ev.clientX - pos.left,ev.clientY - pos.top];
    },
    getLocationPoint:(x,y,anti)=>{
        const pos = env.position;
        if(anti) return [x - pos.left,env.height-(y - pos.top)];
        return [x - pos.left,y - pos.top];
    },
    setFloat:(rate)=>{
        
        const el=document.getElementById(config.zoom.bar);
        const height=el.clientHeight;

        if(env.bar.height===0) env.bar.height = height;

        const pointer=document.getElementById(config.scale.now);
        const size=pointer.clientHeight;
        const margin=height*rate*0.01-size*0.5;
        env.bar.now = margin;
        
        pointer.style.top=`${margin}px`;
    },
    setCenter:(el)=>{
        //console.log([0.5*el.clientWidth,0.5*el.clientHeight]);
        env.center = [0.5*el.clientWidth,0.5*el.clientHeight];
    },
    scaleFloat:()=>{
        
        const id = config.scale.now;
        const el = document.getElementById(id);
        if(el===null) return false;

        el.addEventListener("mousedown", (ev) => {
            env.float = true;
            env.bar.pre = [ev.clientX,ev.clientY];
        });

        el.addEventListener("mouseup", (ev) => {
            env.float = false;
            env.bar.pre = null;
        });

        el.addEventListener("mouseout", (ev) => {
            env.float = false;
            env.bar.pre = null;
        });

        el.addEventListener("mousemove", (ev) => {
            if(!env.float || env.bar.pre===null) return false;
            if(!ev.movementY) return false;

            //1.set button position
            const pointer=document.getElementById(config.scale.now);
            const now= env.bar.now + ev.movementY;
            if(now <= env.bar.header) return false;
            if(now >= env.bar.height-env.bar.footer) return false;

            env.bar.now = now;
            pointer.style.top=`${now}px`;

            env.render.rate(1+(ev.movementY>0?-config.zoom.step:config.zoom.step));
        });
    },
    scaleUp: () => {
        const id = config.scale.up;
        const el = document.getElementById(id);
        if(el===null) return false;

        el.addEventListener("click", (ev) => {
            // const pos = env.position;
            // const p=self.getLocationPoint(env.center[0]+pos.left,env.center[1]+pos.top,true);
            // env.zoom = self.cvsScale(p, 1 + config.zoom.step);
            //console.log(env.zoom);

            env.render.rate(1 + config.zoom.step);
        });
    },
    scaleDown: () => {
        const id = config.scale.down;
        const el = document.getElementById(id);
        if(el===null) return false;

        el.addEventListener("click", (ev) => {
            //console.log(`scale down`,env.center);
            // const pos = env.position;
            // const p=self.getLocationPoint(env.center[0]+pos.left,env.center[1]+pos.top,true);
            // env.zoom = self.cvsScale(p, 1 - config.zoom.step);
            //console.log(env.zoom);

            env.render.rate(1 - config.zoom.step);
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
    mouse: (dom_id) => {
        const cvs = document.querySelector(`#${dom_id} canvas`);

        cvs.addEventListener("click", (ev) => {
            const point=self.getMousePoint(ev,true);
            //console.log(`single click`,point);
            // const delta=1;
            // self.cvsScale(point,delta);
            env.pre=point;
            //const cp=[point[0],env.height-point[1]];
            const bk = env.render.select(point,config.select);
            self.info(`${JSON.stringify(bk)} is selected`);
        });

        cvs.addEventListener("dblclick", (ev) => {
            console.log(`double click`);
        });

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
    pan:(dom_id)=>{
        const cvs = document.querySelector(`#${dom_id} canvas`);
        // cvs.addEventListener("click", (ev) => {
           
        // });

        cvs.addEventListener("mousedown", (ev) => {
            //console.log(`Start...`);
            env.pan = true;
            env.pre=null;
        });

        cvs.addEventListener("mouseup", (ev) => {
            //console.log(`Start...`);
            env.pan = false;
            env.pre=null;
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
            <div class="row">
                <div class="left" id="${config.zoom.info}"></div>
                <div class="right">
                    <button>reset</button>
                </div>
            </div>
        </div>`;
        const doc = self.getDom(ctx);
        const el = document.getElementById(dom_id);
        el.appendChild(doc.body.firstChild);

        //2.screen binding
        if(!device.mobile){
            const zoom = document.getElementById(config.zoom.bar);
            zoom.style.display="block";
            self.setCenter(cvs);
            self.setFloat(50)
            self.scaleFloat();
            //self.scaleUp();
            //self.scaleDown();
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
    action:()=>{
        //console.log(`here`);
        env.render.update();
    },
}

const controller = {
    hooks: self.hooks,
    clean:(container)=>{
        const world = env.player.location.world;
        const dom_id= VBW.cache.get(["active","current"]);
        const chain = ["block", dom_id, world, "loop"];
        const queue = VBW.cache.get(chain);

        let index=-1;
        for(let i=0;i<queue.length;i++){
            const row=queue[i];
            if(row.name==="two") index=i;
        }

        if(index>=0){
            queue.splice(index, 1);
        }
    },
    start: (container,title_id) => {
        //0. construct dom for renderer
        self.construct(container);

        env.dialog.title=title_id;

        //1. set cache
        if (env.render === null) env.render = VBW[config.render].control;
        if(env.player===null) env.player=VBW.cache.get(["env","player"]);

        //2.set frame-loop function
        const world = env.player.location.world;
        const dom_id= VBW.cache.get(["active","current"]);
        const chain = ["block", dom_id, world, "loop"];
        if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
        const queue = VBW.cache.get(chain);
        //console.log(chain,queue);
        queue.push({ name: "two", fun: self.action });

        self.status();
    },
}

export default controller;