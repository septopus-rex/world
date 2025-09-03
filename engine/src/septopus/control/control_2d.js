/**
 * 2D controller for 2D map
 *
 * @fileoverview
 *  1. screen interaction support.
 *  2. PC client interaction support.
 *
 * @author Fuu
 * @date 2025-04-25
 */

import VBW from "../core/framework";
import World from "../core/world";
import Toolbox from "../lib/toolbox";
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
    },
    buttons:{
        reset:"map_reset",
        jump:"map_jump",
    }
}

const env = {
    player: null,                //player status
    render: null,               //render actions
    pre: null,                   //previous mouse position
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
        limit:null,
    },
    dialog:{
        title:"",
    },
    last:null,               //last player position to check wether update 2D map
}   

const self = {
    hooks: {
        reg: () => { return reg },
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
    getScale:()=>{
        if(env.bar.limit===null) env.bar.limit=VBW[config.render].control.limit();
        const bar=env.bar;
        //console.log(JSON.stringify(env.bar))
        const full=bar.height-bar.header-bar.footer;
        const val=bar.now-bar.header;
        const n=((full-val)/full)*(bar.limit[1]-bar.limit[0])+bar.limit[0];
        return n;
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
    
    scaleUp: () => {
        const id = config.scale.up;
        const el = document.getElementById(id);
        if(el===null) return false;

        el.addEventListener("click", (ev) => {
            env.render.rate(1 + config.zoom.step);
        });
    },

    scaleDown: () => {
        const id = config.scale.down;
        const el = document.getElementById(id);
        if(el===null) return false;

        el.addEventListener("click", (ev) => {
            env.render.rate(1 - config.zoom.step);
        });
    },

    /** 
     * binding scale on float bar
     * @functions
     * 1. `mousemove`, cale the canvas
     * @param {string}  id  - float bar DOM id.
     * @return void
     * */ 
    scaleFloat:(id)=>{
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

            const ss=self.getScale(now);
            env.render.target(ss);
        });
    },

    /** 
     * binding screen action
     * @functions
     * 1. `touchMove`, pan the canvas
     * 2. `gestureMove`, scale the canvas
     * @param {string}  dom_id  - 2D canvas container DOM ID
     * @return void
     * */ 
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
        
    /** 
     * binding mouse action
     * @functions
     * 1. `click`, select block
     * 2. `mousemove`, pan the canvas
     * @param {string}  dom_id  - 2D canvas container DOM ID
     * @return void
     * */ 
    mouse: (dom_id) => {
        const cvs = document.querySelector(`#${dom_id} canvas`);

        cvs.addEventListener("click", (ev) => {
            const point=self.getMousePoint(ev,true);
            env.pre=point;
            const bk = env.render.select(point,config.select);
            self.info(`${JSON.stringify(bk)} is selected`);
            env.render.update();
        });

        cvs.addEventListener("dblclick", (ev) => {
            console.log(`double click`);
        });

        cvs.addEventListener("mousewheel", (ev) => {

        });

        cvs.addEventListener("mousemove", (ev) => {
            if (!env.pan) return false;
            if(env.pre===null) return env.pre=self.getMousePoint(ev);
            const now=self.getMousePoint(ev);
            self.cvsPan(env.pre,now);
            env.pre=now;
        });
    },
    
    /** 
     * binding canvas pan action
     * @param {string}  dom_id  - 2D canvas container DOM ID
     * @return void
     * */ 
    pan:(dom_id)=>{
        const cvs = document.querySelector(`#${dom_id} canvas`);
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

    /** 
     * show information on the left-bottom of dialog
     * @param {string}  ctx  - content to show
     * @param {number}  at   - time to clean the content
     * @return void
     * */    
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

    /** 
     * set title DOM id, showing the current block
     * @param {string}  title_id  - title container DOM ID
     * @return void
     * */    
    status:(title_id)=>{
        env.dialog.title=title_id;
        const player=env.player;
        const ctx=`Block ${JSON.stringify(player.location.block)}`;
        self.info(ctx);
    },

    /** 
     * construct 2D controller DOM
     * @param {string}  dom_id  - container DOM ID
     * @return void
     * */  
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
                    <button class="sm_button" id="${config.buttons.reset}">Reset</button>
                    <button class="sm_button" id="${config.buttons.jump}">Jump</button>
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
            self.buttons();
            self.scaleFloat(config.scale.now);
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

    /** 
     * binding dialog buttons functions
     * @funtions
     * 1. `reset`, reset 2D map as start;
     * 2. `jump`, jump to target block;
     * @return void
     * */
    buttons:()=>{
        const el_reset =document.getElementById(config.buttons.reset);
        el_reset.addEventListener("click", (ev) => {
            console.log(`"Reset" is clicked.`);
        });

        const el_jump =document.getElementById(config.buttons.jump);
        el_jump.addEventListener("click", (ev) => {
            const dom_id=VBW.cache.get(["active","current"]);
            const world=env.player.location.world;
            const status=env.render.status();
            if(status.selected[0]<1 || status.selected[1]<1){
                return self.info(`Invalid block ${JSON.stringify(status.selected)} to jump.`);
            }

            const [x,y]=status.selected;
            const pos=[12,12,0];      //can set to fall from sky
            World.teleport(dom_id,world,x,y,(done)=>{
                console.log(done);
                
            },pos);
        });
    },
    /** 
     * frame-loop function
     * */
    action:()=>{
        if(env.last===null){
            env.last=Toolbox.clone(env.player.location);
        }else{
            if(JSON.stringify(env.last)!==JSON.stringify(env.player.location)){
                env.last=Toolbox.clone(env.player.location);
                env.render.update();
            }
        }
    },
}

const controller = {
    //component hook.
    hooks: self.hooks,
    
    /** clean 2D canvas from container
     * @functions
     * 1. remove frame-loop function
     * @param   {string}    container    - container DOM id
     * */
    clean:(container)=>{
        //1. remove frame-loop function
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

        //2. remove inner DOM

    },

    /** 2D controller entry
     * @functions
     * 1. construct DOM.
     * 2. set runtime.
     * 3. add frame-loop function.
     * 4. 
     * @param   {string}    container    - container DOM id
     * @param   {string}    title_id     - set dailog title for 
     * */
    start: (container,title_id) => {
        //0. construct dom for renderer
        self.construct(container);
        
        //1. set runtime
        if (env.render === null) env.render = VBW[config.render].control;
        if(env.player===null) env.player=VBW.cache.get(["env","player"]);

        const ss=self.getScale();
        env.render.target(ss);

        //2.set frame-loop function
        const world = env.player.location.world;
        const dom_id= VBW.cache.get(["active","current"]);
        const chain = ["block", dom_id, world, "loop"];
        if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
        const queue = VBW.cache.get(chain);
        queue.push({ name: "two", fun: self.action });

        //3.set select status, for dialog mode only.
        self.status(title_id);
    },
}

export default controller;