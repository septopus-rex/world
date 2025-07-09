/**
 * 3D FPV controller for PC/Mobile
 *
 * @fileoverview
 *  1. base on `Septopus Coordinaration`
 *  2. keyboard support
 *  3. block cross checking
 *  4. base on three.js coordinate system
 *  5. object selection
 *  6. sidebar and popup menu orginazation
 * 
 * @author Fuu
 * @date 2025-04-25
 */

import VBW from "../core/framework";
import UI from "../io/io_ui";
import Calc from "../lib/calc";
import ThreeObject from "../three/entry";
import Touch from "../lib/touch";
import Toolbox from "../lib/toolbox";

const reg = {
    name: "con_first",
    category: 'controller',
    desc: "FPV controller for Septopus World",
    version: "1.0.0",
}

const cache = {
    player: null,            //player information 
    camera: null,            //FPV camera object
    scene: null,             //scene for raycast checking
    actions: null,           //Pressed key queue
    side: null,              //Block size
    container: null,         //init DOM id
    world: null,             //active world
    raycaster: null,         //raycast checker
    selected: null,            //edit selection
    convert: null,           //system convert
}

const config = {
    id: "fpv_control",
    code: {          //Definition of keyboard
        FORWARD: 87,        //W
        BACKWARD: 83,       //S
        LEFT: 65,           //A
        RIGHT: 68,          //D
        //BODY_RISE: 82,      //R
        //BODY_FALL: 70,      //F
        HEAD_LEFT: 37,      //Arrow left
        HEAD_RIGHT: 39,     //Arrow right
        HEAD_RISE: 38,      //Arrow up
        HEAD_DOWN: 40,      //Arrow down
        JUMP: 32,           //Space
        SQUAT: 17,          //Ctrl
    },
    queue: "keyboard",
    move: {
        distance: 100,
        angle: Math.PI * 0.01,
    },
    render: "rd_three",
    double: {
        delay: 300,
        distance: 5,
    },
    swipe:{
        distance: 15,
    },
    hold:3000,          //3s as holding  
}

const env = {
    //position: [0, 0],       //[left,top],DOM offset      
    mobile:false,
    limit: null,            //limit of movement
    moving: false,          //whether moving, for mobile  
    screen:{
        touch:null,
        distance:0,
        width:0,
    },
    trigger:null,      
};

let todo = null;
let trigger = null;   
const self = {
    hooks: {
        reg: () => { return reg },
    },
    unbind: (evt, fun) => {
        document.removeEventListener(evt, fun);
    },
    bind: (evt, fun, dom_id) => {
        if (!dom_id) document.addEventListener(evt, fun);
    },
    getEditActive: () => {
        return VBW.cache.get(["block", cache.container, cache.world, "edit"]);
    },
    getSTD: (x, y, adjunct, index) => {
        const chain = ["block", cache.container, cache.world, `${x}_${y}`, 'std', adjunct, index === undefined ? 0 : index];
        return VBW.cache.get(chain);
    },
    getAngle:(ak)=>{
        if(env.mobile){
            const rate=env.screen.distance/env.screen.width
            return Math.PI * 0.5 * rate;
        }else{
            return ak;
        }
    },
    getElevation: (x, y) => {
        const active = VBW.cache.get(["active"]);
        const chain = ["block", active.current, cache.player.location.world, `${x}_${y}`, "elevation"];
        return VBW.cache.get(chain);
    },
    getClickPosition: (ev) => {
        return [ev.clientY, ev.clientX];
    },
    getSingle: (objs) => {
        let dis = 0;
        let selected = 0;
        for (let i = 0; i < objs.length; i++) {
            const row = objs[i];
            if (dis === 0) dis = row.distance;
            if (row.distance < dis) selected = i;
        }
        const target = objs[selected];
        return target.object.userData;
    },
    initTodo:()=>{
        const body=VBW.movement.body;
        const head=VBW.movement.head;
        todo = {
            FORWARD: body.forward,
            BACKWARD: body.backward,
            LEFT: body.leftward,
            RIGHT: body.rightward,
            BODY_RISE: body.rise,
            BODY_FALL: body.fall,
            JUMP: body.jump,
            SQUAT: body.squat,
            HEAD_LEFT: head.left,
            HEAD_RIGHT: head.right,
            HEAD_RISE: head.up,
            HEAD_DOWN:head.down,
        }
    },
    keyboard: () => {
        self.bind('keydown', (ev) => {
            const code = ev.which;
            if (config.keyboard[code]) {
                UI.hide(["pop", "sidebar"]); //hide popup menu when moving 
                VBW.queue.insert(config.queue, config.keyboard[code]);
            }
        });

        self.bind('keyup', (ev) => {
            const code = ev.which;
            if (config.keyboard[code]) VBW.queue.remove(config.queue, config.keyboard[code]);
        });
    },
    autocache: (dom_id) => {
        cache.container = dom_id;

        if (cache.world === null) {
            cache.world = VBW.cache.get(["active", "world"]);
        }

        if (cache.actions === null) {
            cache.actions = VBW.queue.get(config.queue);
        }

        if (cache.camera === null) {
            const chain = ["active", "containers", dom_id, "camera"];
            cache.camera = VBW.cache.get(chain);
        }
        if (cache.scene === null) {
            const chain = ["active", "containers", dom_id, "scene"];
            cache.scene = VBW.cache.get(chain);
        }

        if (cache.player === null) {
            const chain = ["env", "player"];
            cache.player = VBW.cache.get(chain);
        }

        if (cache.side === null) {
            cache.side = VBW.cache.get(["env", "world", "side"]);
        }
        if (cache.convert === null) {
            cache.convert = VBW.cache.get(["env", "world", "accuracy"]);;
        }
    },

    flip: (obj) => {
        return Object.entries(obj).reduce((acc, [key, value]) => {
            acc[value] = key;
            return acc;
        }, {});
    },
    setCompass: (ak) => {
        const angle=-180 * ak / Math.PI;
        const cfg_compass = {
            events: {
                click: (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    console.log(`Compass clicked`);
                },
            },
        }
        UI.show("compass", angle, cfg_compass);
    },

    //fliter out stops related by block coordination.
    getStops: (bks, side) => {
        //console.log(bks);
        const stops = [];
        const fun = VBW.cache.get;
        for (let i = 0; i < bks.length; i++) {
            const [x, y] = bks[i];
            if (!x || !y) continue;

            const key = `${x}_${y}`;
            const arr = fun(["block", cache.container, cache.world, key, "stop"]);
            if (arr.error || arr.length === 0) continue;

            for (let j = 0; j < arr.length; j++) {
                const stop = arr[j];
                if (!stop.block) stop.block = [x, y];
                if (!stop.elevation) stop.elevation = fun(["block", cache.container, cache.world, key, "elevation"]);
                if (!stop.side) stop.side = side;
                stops.push(stop);
            }
        }
        return stops;
    },
    checkStop: (delta) => {
        const cvt = cache.convert,side = cache.side;
        const player = cache.player;
        const { body, capacity } = player;
        const [x, y] = player.location.block;
        const va=self.getElevation(x, y);

        //!important, need to add the movement to check whether stop
        const nx=player.location.position[0] * cvt + delta[0];
        const ny=player.location.position[1] * cvt + delta[1];
        const nz=player.location.position[2] * cvt + delta[2];
        const bx=x+Math.floor(nx/side[0]);
        const by=y + Math.floor(ny/side[1]);

        if(bx!==x || by!==y){
            //1.check whether stopped by block, only check block elevation here
            const vb=self.getElevation(bx,by);
            const stand=va+player.location.position[2]*cvt;
            if(vb-stand > capacity.span*cvt){
                return { move: false, block:[bx,by]}
            }
        }
        
        //2.check whether stopped by stops
        //also check the nearby block stops if not stopped by block
        const pos = [nx,ny,nz];
        const stops = self.getStops([[bx,by]], side);
        const cfg = {
            cap: capacity.span * cvt,            //cross limit
            height: body.height * cvt,           //player body height
            elevation: va,                       //block elevation
            pre: 0 * cvt,                        //pre stand height
        };
        //return VBW.stop.check(pos, stops, cfg);
        return Calc.check(pos, stops, cfg);
    },
    getTriggers:()=>{
        const [x,y]=cache.player.location.block;
        const trigger_chain=["block",cache.container, cache.world,`${x}_${y}`,"trigger"];

        return VBW.cache.get(trigger_chain);
    },
    checkTrigger:()=>{
        //1. get trigger list
        const arr=self.getTriggers();
        if(arr.error || arr.length===0) return false;

        //2. prepare parameters to check trigger
        const cvt = cache.convert;
        const player = cache.player;
        const nx=player.location.position[0] * cvt;
        const ny=player.location.position[1] * cvt;
        const nz=player.location.position[2] * cvt;
        const pos = [nx,ny,nz];

        const orgin = Calc.inside(pos,arr, player.body.height * cvt);
        const [x, y] = player.location.block;
        const world= player.location.world;
        if(env.trigger===null){
            if(orgin!==false){
                const target={
                    x:x,y:y,world:world,
                    index:orgin.index,
                    adjunct:orgin.adjunct,
                    start:Toolbox.stamp(),
                    hold:false,
                };
                
                //!important, `trigger.in` event trigger 
                env.trigger=target;
                VBW.event.trigger("trigger","in",Toolbox.clone(target));
            
            }
        }else{
            //2. check hold event
            if(env.trigger.hold===false){
                const delta=Toolbox.stamp()-env.trigger.start;
                if(delta > config.hold){
                    //!important, `trigger.hold` event trigger 
                    VBW.event.trigger("trigger","hold",Toolbox.clone(env.trigger));
                    env.trigger.hold=true;
                }
            }

            //3. check leaving event
            if(orgin===false){
                //!important, `trigger.in` event trigger 
                VBW.event.trigger("trigger","out",Toolbox.clone(env.trigger));
                env.trigger=null;
            }
        }
    },

    //Frame Synchronization, movement here to imply
    action: () => {
        const dis = [config.move.distance, self.getAngle(config.move.angle)];
        
        //!important, need to confirm the `AK` definition, it is camera coordination
        //FIXME, change to calculate on the player rotation.

        const ak = cache.camera.rotation.y;
        const local=cache.player.location;
        //1.deal with keyboard inputs.
        for (let i = 0; i < cache.actions.length; i++) {
            const act = cache.actions[i];
            if (!todo[act]) continue;
            const diff = todo[act](dis, ak);

            if (diff.position) {
                const check = self.checkStop(diff.position);
                if (!check.move) {
                    if(!check.block){
                        VBW.event.trigger("stop","beside",check.orgin);
                    }else{
                        VBW.event.trigger("block","stop",check.block);
                    }
                    continue;
                }

                //player action checking
                if(local.stop.on){
                    //console.log(`On stop:`,JSON.stringify(check));
                    if(!check.orgin){
                        VBW.player.leave(check);
                    }else{
                        // if(check.orgin.adjunct===local.stop.adjunct && check.orgin.index===local.stop.index){
                        //     console.log(`Same stop.`);
                        // }else{
                        //     console.log(`New stop.`);
                        // }
                    }
                }

                //if on stop, change player position
                if (check.delta) {
                    console.log(`Height delta: ${check.delta}`);
                    //check whether fall to death;

                    diff.position[2] += check.delta;
                    if(check.orgin) VBW.player.stand(check.orgin);
                }
            }
            VBW.player.synchronous(diff);
        }
        self.checkTrigger();
    },
    formatGroups: (groups) => {
        const ss = [];
        for (let title in groups) {
            const gp = groups[title];
            const group = {
                title: title.toUpperCase(),
                col: 12,
                row: 12,
                inputs: gp,
            }
            ss.push(group);
        }
        return ss;
    },
    getSelection: (objs, x, y, side) => {
        const selected = {
            adjunct: "",
            index: 0,
        }
        const arr = [];
        for (let i = 0; i < objs.length; i++) {
            const row = objs[i];
            if (row.distance > side[0]) continue;          //ignore objects on other blocks
            if (!row.object ||
                !row.object.userData ||
                !row.object.userData.x ||
                !row.object.userData.y ||
                !row.object.userData.name ||
                row.object.userData.x !== x ||
                row.object.userData.y !== y) continue;   //ignore system objects

            const tmp = row.object.userData.name.split("_");
            if (tmp.length > 1) continue;                  //ignore helper objects
            arr.push(row);
        }

        if (arr.length === 0) return selected;
        const single = self.getSingle(arr);
        selected.adjunct = single.name;
        selected.index = single.index;
        return selected;
    },
    select: (ev) => {
        if (cache.scene === null) return false;

        //1.check 
        if (cache.raycaster === null) {
            cache.raycaster = ThreeObject.get("basic", "raycast", {});
        }
        const raycaster = cache.raycaster;

        const dv = VBW.cache.get(["block", cache.container, "basic"]);
        const { width, height } = dv;
        raycaster.mouse.x = (ev.clientX / width) * 2 - 1;
        raycaster.mouse.y = -(ev.clientY / height) * 2 + 1;
        raycaster.checker.setFromCamera(raycaster.mouse, cache.camera);

        const objs = cache.scene.children;
        const selected = cache.raycaster.checker.intersectObjects(objs);

        //2.filter out 
        if (selected.length > 0) {
            const [x, y] = cache.player.location.block;
            const target = self.getSelection(selected, x, y, cache.side);
            return target;
        }
    },
    editControl: (dom_id) => {
        const el = document.getElementById(dom_id);
        if (!el) return false;
        el.addEventListener('click', (ev) => {
            //1. check selection
            const mouse = self.getClickPosition(ev);
            const mode = VBW.cache.get(["active", "mode"]);

            if (mode === 2) {
                //1. raycast check the selected object
                const target = self.select(ev);

                //2. set active
                const editing = self.getEditActive();
                const [x, y] = cache.player.location.block;
                if (!target.adjunct) {
                    target.adjunct = "block"; //set default adjunct
                } else {
                    editing.selected.adjunct = target.adjunct;
                    editing.selected.index = target.index;
                    editing.selected.face = "x";
                    //VBW[config.render].show(cache.container,[x,y,cache.world]);
                }

                //3. show pop menu
                const std = self.getSTD(x, y, target.adjunct, target.index);
                //console.log(std,target);
                const pop = VBW[target.adjunct].menu.pop(std);
                UI.show("pop", pop, { offset: mouse });

                //4. show sidebar menu 
                const groups = VBW[target.adjunct].menu.sidebar(std);
                const cfg_side = {
                    title: `${target.adjunct}-${target.index} Modification`,
                    prefix: "sd",
                    convert: cache.convert,
                    events: {
                        change: (obj) => {
                            console.log(obj);

                            obj.index = target.index;
                            const task = { x: x, y: y, adjunct: "wall", action: "set", param: obj };
                            const queue = VBW.cache.get(["task", cache.container, cache.world]);
                            queue.push(task);

                            VBW.update(cache.container, cache.world);
                            const range = { x: x, y: y, world: cache.world, container: cache.container }
                            VBW.prepair(range, (pre) => {
                                console.log(pre);
                                VBW[config.render].show(cache.container, [x, y, cache.world]);
                            });
                        },
                    }
                }
                const sidebar = self.formatGroups(groups);
                UI.show("sidebar", sidebar, cfg_side);
            }

        });
    },
    touch:(dom_id) =>{ 
        const id=`#${dom_id} canvas`;
        //1. double tap to go forward
        Touch.on(id,"doubleTap",(point)=>{
            if (!env.moving) {
                VBW.queue.insert(config.queue, config.keyboard[config.code.FORWARD]);
                env.moving = true;
                UI.hide(["pop", "sidebar"]);
            } else {
                env.moving = false;
                VBW.queue.remove(config.queue, config.keyboard[config.code.FORWARD]);
            }
        });

        Touch.on(id,"touchStart",(point)=>{
            env.screen.touch = point;
            VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_LEFT]);
            VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_RIGHT]);
        });

        //2.touchmove for head rotation
        Touch.on(id,"touchMove",(point,distance)=>{
            const dx = point[0] - env.screen.touch[0];
            env.screen.distance=distance;
            if(dx > 0){   //swipe right
                VBW.queue.insert(config.queue, config.keyboard[config.code.HEAD_LEFT]);
            }else{      //swipe left
                VBW.queue.insert(config.queue, config.keyboard[config.code.HEAD_RIGHT]);
            }
            env.screen.touch = point;
        });

        Touch.on(id,"touchEnd",()=>{
            env.screen.touch=null;
            env.screen.distance=0;
            VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_LEFT]);
            VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_RIGHT]);
        });
    },
    setWidth:(dom_id)=>{
        const el=document.querySelector(`#${dom_id} canvas`);
        if (!el) return false;
        env.screen.width=el.width;
    },
}

const controller = {
    hooks: self.hooks,
    construct: () => {
        const check = document.getElementById(config.id);
        if (check === null) {
            const str = `<div id=${config.id}></div>`;
            const parser = new DOMParser();
            const doc = parser.parseFromString(str, 'text/html');
            return doc.body.firstChild
        }
    },

    start: (dom_id) => {
        if (cache.container !== null) return false;
        //console.log(`Start to get the input from outside, bind html events.`);

        //0.get canvas width
        self.setWidth(dom_id);
        self.initTodo();

        //1.add keyboard listener and screen control
        const device = VBW.cache.get(["env", "device"]);
        env.mobile=device.mobile;       
        VBW.queue.init(config.queue);
        if (device.mobile) {
            self.touch(dom_id);
        } else {
            self.keyboard();
            self.editControl(dom_id);
        }

        //2.set the related link
        self.autocache(dom_id);

        //3.set frame sync function
        const chain = ["block", dom_id, cache.world, "loop"];
        if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
        const queue = VBW.cache.get(chain);
        queue.push({ name: "movement", fun: self.action });

        //4.flip the code --> key to key --> code, run once.
        if (config.keyboard === undefined) config.keyboard = self.flip(config.code);

        //5. init compass;
        const ak=cache.player.location.rotation[2];
        self.setCompass(ak);
    },
}

export default controller;