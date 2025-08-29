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
import Actions from "../io/actions";

const reg = {
    name: "con_first",
    category: 'controller',
    desc: "FPV controller for Septopus World",
    version: "1.0.0",
}

const runtime = {
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
    active: null,
    def: null,
}

const env = {
    //position: [0, 0],       //[left,top],DOM offset      
    mobile: false,
    limit: null,            //limit of movement
    moving: false,          //whether moving, for mobile  
    screen: {
        touch: null,
        distance: 0,
        width: 0,
    },
    trigger: null,
    todo :null,
};

const config = {
    id: "fpv_control",
    code: {          //Definition of keyboard
        FORWARD: 87,        //W
        BACKWARD: 83,       //S
        LEFT: 65,           //A
        RIGHT: 68,          //D
        BODY_RISE: 82,      //R
        BODY_FALL: 70,      //F
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
    swipe: {
        distance: 15,
    },
    hold: 3000,          //3s as holding  
}

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
    flip: (obj) => {
        return Object.entries(obj).reduce((acc, [key, value]) => {
            acc[value] = key;
            return acc;
        }, {});
    },

    setWidth: (dom_id) => {
        const el = document.querySelector(`#${dom_id} canvas`);
        if (!el) return false;
        env.screen.width = el.width;
    },
    setRuntime: (dom_id) => {
        runtime.container = dom_id;

        if (runtime.actions === null) {
            runtime.actions = VBW.queue.get(config.queue);
        }

        if (runtime.camera === null) {
            const chain = ["active", "containers", dom_id, "camera"];
            runtime.camera = VBW.cache.get(chain);
        }
        if (runtime.scene === null) {
            const chain = ["active", "containers", dom_id, "scene"];
            runtime.scene = VBW.cache.get(chain);
        }

        if (runtime.player === null) {
            const chain = ["env", "player"];
            runtime.player = VBW.cache.get(chain);
        }

        if (runtime.side === null) {
            runtime.side = VBW.cache.get(["env", "world", "side"]);
        }
        if (runtime.convert === null) {
            runtime.convert = VBW.cache.get(["env", "world", "accuracy"]);;
        }

        if (runtime.def === null) {
            const chain = ["def", "common"];
            runtime.def = VBW.cache.get(chain);
        }

        if (runtime.active === null) {
            const chain = ["active", "containers", dom_id];
            runtime.active = VBW.cache.get(chain);
        }
    },

    getEditActive: () => {
        const world = runtime.player.location.world;
        return VBW.cache.get(["block", runtime.container, world, "edit"]);
    },
    getSTD: (x, y, adjunct, index) => {
        const world = runtime.player.location.world;
        const chain = ["block", runtime.container, world, `${x}_${y}`, 'std', adjunct, index === undefined ? 0 : index];
        return VBW.cache.get(chain);
    },
    getAngle: (ak) => {
        if (env.mobile) {
            const rate = env.screen.distance / env.screen.width
            return Math.PI * 0.5 * rate;
        } else {
            return ak;
        }
    },
    getTriggers: () => {
        const [x, y] = runtime.player.location.block;
        const world = runtime.player.location.world;
        const trigger_chain = ["block", runtime.container, world, `${x}_${y}`, "trigger"];
        return VBW.cache.get(trigger_chain);
    },
    //fliter out stops related by block coordination.
    getStops: (bks, side) => {
        const stops = [];
        const fun = VBW.cache.get;
        const world = runtime.player.location.world;
        for (let i = 0; i < bks.length; i++) {
            const [x, y] = bks[i];
            if (!x || !y) continue;

            const key = `${x}_${y}`;
            const arr = fun(["block", runtime.container, world, key, "stop"]);
            if (arr.error || arr.length === 0) continue;

            for (let j = 0; j < arr.length; j++) {
                const stop = arr[j];
                if (!stop.block) stop.block = [x, y];
                if (!stop.elevation) stop.elevation = fun(["block", runtime.container, world, key, "elevation"]);
                if (!stop.side) stop.side = side;
                stops.push(stop);
            }
        }
        return stops;
    },
    
    getElevation: (x, y) => {
        //const active = VBW.cache.get(["active"]);
        const world = runtime.player.location.world;
        const chain = ["block", runtime.container, world, `${x}_${y}`, "elevation"];
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
    
    /**
     * filter out the selected objects
     * @functions
     * 1. check wether selected by three.js raycaster
     * 2. filter out the nearest one.
     * @param   {object[]}  objs    - selected objects in three.js scene
     * @param   {number}    x       - block.x
     * @param   {number}    y       - block.y
     * @param   {object}    side    - [x,y], side of block
     * @return void
     * set the selected object in VBW.cache
     */ 
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

    /**
     * creata map of key --> action
     * @return void
     */
    initCode: () => {
        const body = VBW.movement.body;
        const head = VBW.movement.head;
        env.todo = {
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
            HEAD_DOWN: head.down,
        }
    },

    
    /**
     * check wether stopped by object
     * @functions
     * 1. wether cross block, if so, need to get the stops by the new block
     * 2. wether stopped by objects;
     * @param {number[]}    delta   - [x,y,z], value of postion changing
     * @return {object}  - {"interact":false,"move":true,"index":-1,"cross":true,"edelta":-1700}
     */
    checkStop: (delta) => {
        const cvt = runtime.convert, side = runtime.side;
        const player = runtime.player;
        const { body, capacity } = player;
        const [x, y] = player.location.block;

        //!important, need to add the movement to check whether stop
        const nx = player.location.position[0] * cvt + delta[0];
        const ny = player.location.position[1] * cvt + delta[1];
        const nz = player.location.position[2] * cvt + delta[2];
        const bx = x + Math.floor(nx / side[0]);
        const by = y + Math.floor(ny / side[1]);

        const va = self.getElevation(x, y);
        const stand = va + player.location.position[2] * cvt;
        let cross = false;

        //1. block cross status checking
        if (bx !== x || by !== y) {
            cross = true;
            const vb = self.getElevation(bx, by);
            //1.1.check whether stopped by block, only check block elevation here
            //const stand=va + player.location.position[2]*cvt;
            if (vb - stand > capacity.span * cvt) {
                return { move: false, block: [bx, by] }
            }
        }

        //2.check whether stopped by stops
        //also check the nearby block stops if not stopped by block
        const pos = cross ? [nx % side[0], ny % side[1], nz] : [nx, ny, nz];
        const stops = self.getStops([[bx, by]], side);

        const cfg = {
            cap: capacity.span * cvt,               //cross limit
            height: body.height * cvt,              //player body height
            elevation: va,                          //block elevation
            cross: cross,                            //whether block cross
        };
        if (cross) cfg.next = self.getElevation(bx, by);    //if cross, prepare the next block elevation

        //{"cap":310,"height":1700,"elevation":1900,"cross":true,"next":200}
        //Stop check result: {"interact":false,"move":true,"index":-1,"cross":true,"edelta":-1700}

        return Calc.check(pos, stops, cfg);
    },

    /**
     * entry of trigger checking, only in GAME mode.
     * @functions
     * 1. `trigger.in` event
     * 2. `trigger.hold` event
     * 3. `trigger.out` event
     * @return void
     */    
    checkTrigger: () => {
        //console.log(runtime.active.mode,runtime.def);
        if (runtime.active.mode !== runtime.def.MODE_GAME) return false;

        //1. get trigger list
        const arr = self.getTriggers();
        if (arr.error || arr.length === 0) return false;

        //2. prepare parameters to check trigger
        const cvt = runtime.convert;
        const player = runtime.player;
        const nx = player.location.position[0] * cvt;
        const ny = player.location.position[1] * cvt;
        const nz = player.location.position[2] * cvt;
        const pos = [nx, ny, nz];

        const orgin = Calc.inside(pos, arr, player.body.height * cvt);
        const [x, y] = player.location.block;
        const world = player.location.world;
        if (env.trigger === null) {
            if (orgin !== false) {
                const target = {
                    x: x, y: y, world: world,
                    index: orgin.index,
                    adjunct: orgin.adjunct,
                    start: Toolbox.stamp(),
                    hold: false,
                    container: runtime.container,
                };

                //!important, `trigger.in` event trigger 
                env.trigger = target;
                const evt = Toolbox.clone(target);
                evt.stamp = Toolbox.stamp();

                VBW.event.trigger("trigger", "in", evt, Toolbox.clone(target));
            }
        } else {
            //2. check hold event
            if (env.trigger.hold === false) {
                const delta = Toolbox.stamp() - env.trigger.start;
                if (delta > config.hold) {
                    //!important, `trigger.hold` event trigger 
                    const evt = Toolbox.clone(env.trigger);
                    evt.stamp = Toolbox.stamp();
                    VBW.event.trigger("trigger", "hold", evt, Toolbox.clone(env.trigger));
                    env.trigger.hold = true;
                }
            }

            //3. check leaving event
            if (orgin === false) {
                //!important, `trigger.in` event trigger 
                const evt = Toolbox.clone(env.trigger);
                evt.stamp = Toolbox.stamp();
                VBW.event.trigger("trigger", "out", evt, Toolbox.clone(env.trigger));
                env.trigger = null;
            }
        }
    },

    /**
     * movement checker
     * @functions
     * 1. 8 cases to set player location
     * 2. `stop.on` event trigger
     * @param   {object}  check - {"interact":false,"move":true,"index":-1,"cross":true,"edelta":-1700}, check result if movement is done
     * @param   {object}  stop  - {}, stop status if movement is done.
     * @param   {object}  diff  - {position:[x,y,z],rotation:[x,y,z]}, movement detail
     * @return void
     */
    checkMoving: (check, stop, diff) => {
        //1. check delta to comfirm standing changing. Set player status correctly.
        if (check.delta!==undefined) {
            if (check.cross) {
                diff.position[2] += check.delta - check.edelta;
            } else {
                diff.position[2] += check.delta;
            }
            if (check.orgin) VBW.player.stand(check.orgin);     //set player stand on stop
        }
        
        VBW.player.synchronous(diff);       //set player stay in block

        //2. more actions for UX
        if(stop.on){
            if(check.cross){
                if(check.edelta!==undefined){
                    VBW.player.synchronous({position:[0,0,check.edelta]},true);
                }

                if(check.orgin){
                    //1.from `stand stop` cross to `stop`
                    //!important, `stop.on` event trigger 
                    VBW.event.trigger("stop", "on", { stamp: Toolbox.stamp() }, check.block);
                }else{
                    //2.from `stand stop` cross to `block`
                    VBW.player.leave(check);
                }
            }else{
                if(check.orgin){
                    //3.from `stand stop` to `stop`
                    if (check.orgin.adjunct === stop.adjunct && check.orgin.index === stop.index) {
                        //do nothing if stand on the same stop
                    } else {
                        //!important, `stop.on` event trigger 
                        VBW.event.trigger("stop", "on", { stamp: Toolbox.stamp() }, check.block);
                    }
                }else{
                    //4.from `stand stop` to `block`
                    VBW.player.leave(check);
                }
            }
        }else{
            if(check.cross){
                if(check.orgin){
                    //5.from `block` cross to `stop`
                    //console.log(`Here to solve?`,JSON.stringify(check));
                    VBW.event.trigger("stop", "on", { stamp: Toolbox.stamp() }, check.block);
                }else{
                    //6.from `block` cross to `block`
                    if (check.edelta !== 0) {
                        const fall = runtime.player.location.position[2];
                        const act_fall = check.cross ? (fall - check.edelta / runtime.convert) : fall;
                        VBW.player.cross(parseFloat(act_fall));
                    }
                }
            }else{
                if(check.edelta!==undefined){
                    VBW.player.synchronous({position:[0,0,check.edelta]},true);
                }

                if(check.orgin){
                    //7.from `block` to `stop`
                    if (check.orgin.adjunct === stop.adjunct && check.orgin.index === stop.index) {

                    } else {
                        //!important, `stop.on` event trigger 
                        VBW.event.trigger("stop", "on", { stamp: Toolbox.stamp() }, check.block);
                    }
                }else{
                    //8.from `block` to `block`
                    //do nothing here.
                }
            }
        }
    },

    /**
     * Frame Synchronization ( frame-loop for short ), movement here to imply
     * @functions
     * 1. check movement queue, if moved, check location and set to camera and player
     * 2. check trigger events by call `checkTrigger`.
     * @return void
     */
    action: () => {
        const dis = [config.move.distance, self.getAngle(config.move.angle)];

        //!important, need to confirm the `AK` definition, it is camera coordination
        //FIXME, change to calculate on the player rotation.
        const ak = runtime.camera.rotation.y;
        const local = runtime.player.location;

        //1.deal with keyboard inputs.
        for (let i = 0; i < runtime.actions.length; i++) {
            const act = runtime.actions[i];
            if (!env.todo[act]) continue;
            const diff = env.todo[act](dis, ak);

            //2.if no position change, just synchronous player rotation.
            if (!diff.position) {
                VBW.player.synchronous(diff);
                continue;
            }

            //3.check moving 
            if (diff.position) {
                const check = self.checkStop(diff.position);

                //3.1. stopped, stop moving.
                if (!check.move) {
                    if (!check.block) {
                        //!important, `stop.beside` event trigger 
                        VBW.event.trigger("stop", "beside", { stamp: Toolbox.stamp() }, check.orgin);
                    } else {
                        //!important, `block.stop` event trigger 
                        VBW.event.trigger("block", "stop", { stamp: Toolbox.stamp() }, check.block);
                    }
                    continue;
                }

                //3.2. moving action.
                self.checkMoving(check, local.stop, diff);
            }
        }

        self.checkTrigger();
    },

    /**
     * group and format the form elements for UI to show
     * @param   {object[]}  groups    - form elements for sidebar
     * @return void
     */
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

    /**
     * check selecting, wether object is selected
     * @functions
     * 1. check wether selected by three.js raycaster
     * 2. set selected object in VBW cache
     * @param {object}  ev  - event object from `click` event
     * @return void
     * set the selected object in VBW.cache
     */        
    select: (ev) => {
        if (runtime.scene === null) return false;

        //1.check 
        if (runtime.raycaster === null) {
            runtime.raycaster = ThreeObject.get("basic", "raycast", {});
        }
        const raycaster = runtime.raycaster;

        const dv = VBW.cache.get(["block", runtime.container, "basic"]);
        const { width, height } = dv;
        raycaster.mouse.x = (ev.clientX / width) * 2 - 1;
        raycaster.mouse.y = -(ev.clientY / height) * 2 + 1;
        raycaster.checker.setFromCamera(raycaster.mouse, runtime.camera);

        const objs = runtime.scene.children;
        const selected = runtime.raycaster.checker.intersectObjects(objs);

        //2.filter out 
        if (selected.length > 0) {
            const [x, y] = runtime.player.location.block;
            const target = self.getSelection(selected, x, y, runtime.side);
            return target;
        }
    },

    /**
     * binding interaction when in `edit` mode
     * @functions
     * 1. set raycast check
     * 2. set active object
     * 3. show pop menu and sidebar menu
     * @param {string}  dom_id  - container DOM ID
     * @return void
     */
    editControl: (dom_id) => {
        const el = document.getElementById(dom_id);
        if (!el) return false;

        el.addEventListener('click', (ev) => {
            //1. check selection
            const mouse = self.getClickPosition(ev);
            const mode = VBW.cache.get(["active", "mode"]);
            const def=VBW.cache.get(["def","common"]);

            if (mode === def.MODE_EDIT) {
                //1. raycast check the selected object
                const target = self.select(ev);
                const world = runtime.player.location.world;

                //2. set active
                const editing = self.getEditActive();
                const [x, y] = runtime.player.location.block;
                if (!target.adjunct) {
                    target.adjunct = "block"; //set default adjunct
                } else {
                    editing.selected.adjunct = target.adjunct;
                    editing.selected.index = target.index;
                    editing.selected.face = "x";
                }

                //3. show pop menu
                const std = self.getSTD(x, y, target.adjunct, target.index);
                const pop = VBW[target.adjunct].menu.pop(std);
                UI.show("pop", pop, { offset: mouse });

                //4. show sidebar menu 
                const groups = VBW[target.adjunct].menu.sidebar(std);
                const cfg_side = {
                    title: `${target.adjunct}-${target.index} Modification`,
                    prefix: "sd",
                    convert: runtime.convert,
                    events: {
                        change: (obj) => {
                            console.log(obj);

                            obj.index = target.index;
                            const task = { x: x, y: y, adjunct: "wall", action: "set", param: obj };
                            const queue = VBW.cache.get(["task", runtime.container, world]);
                            queue.push(task);

                            VBW.update(runtime.container, world, (done)=>{
                                const ev={stamp:Toolbox.stamp(),container:runtime.container,world:world};
                                VBW.event.trigger("system","update",ev);
                            });
                            const range = { x: x, y: y, world: world, container: runtime.container }
                            VBW.prepair(range, (pre) => {
                                //console.log(pre);
                                VBW[config.render].show(runtime.container, [x, y, world]);
                            });
                        },
                    }
                }
                const sidebar = self.formatGroups(groups);
                UI.show("sidebar", sidebar, cfg_side);
            }

        });
    },

    /**
     * binding keyboard interaction 
     * @functions
     * 1. `keydown`, insert action
     * 2. `keyup`, remove action
     * @return void
     */
    keyboard: () => {
        self.bind('keydown', (ev) => {
            const code = ev.which;

            
            if (config.keyboard[code]) {
                //hide popup menu when moving 
                UI.hide(["pop", "sidebar"]);
                
                //insert action 
                VBW.queue.insert(config.queue, config.keyboard[code]);
            }
        });

        self.bind('keyup', (ev) => {
            const code = ev.which;
            if (config.keyboard[code]) VBW.queue.remove(config.queue, config.keyboard[code]);
        });
    },
    
    /**
     * binding screen interaction 
     * @functions
     * 1. need `touch.js` support, which is the screen lib of Septopus World
     * 2. `doubleTap`, move forward
     * 3. `touchMove`, head roataion control
     * @param {string}  dom_id  - container DOM ID
     * @return void
     */
    touch: (dom_id) => {
        const id = `#${dom_id} canvas`;

        //1. double tap to go forward
        Touch.on(id, "doubleTap", (point) => {
            if (!env.moving) {
                VBW.queue.insert(config.queue, config.keyboard[config.code.FORWARD]);
                env.moving = true;
                UI.hide(["pop", "sidebar"]);
            } else {
                env.moving = false;
                VBW.queue.remove(config.queue, config.keyboard[config.code.FORWARD]);
            }
        });

        Touch.on(id, "touchStart", (point) => {
            env.screen.touch = point;
            VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_LEFT]);
            VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_RIGHT]);
        });

        //2.touchmove for head rotation
        Touch.on(id, "touchMove", (point, distance) => {
            const dx = point[0] - env.screen.touch[0];
            env.screen.distance = distance;
            if (dx > 0) {       //swipe right
                VBW.queue.insert(config.queue, config.keyboard[config.code.HEAD_LEFT]);
            } else {            //swipe left
                VBW.queue.insert(config.queue, config.keyboard[config.code.HEAD_RIGHT]);
            }
            env.screen.touch = point;
        });

        Touch.on(id, "touchEnd", () => {
            env.screen.touch = null;
            env.screen.distance = 0;
            VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_LEFT]);
            VBW.queue.remove(config.queue, config.keyboard[config.code.HEAD_RIGHT]);
        });
    },
}

const controller = {
    //component hook.
    hooks: self.hooks,
    
    /** 
     * construct FPV controller DOM
     * */
    construct: () => {
        const check = document.getElementById(config.id);
        if (check === null) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<div id=${config.id}></div>`, 'text/html');
            return doc.body.firstChild;
        }
    },

    /**
     * entry of FPV controller
     * @functions
     * 1. add DOM to container.
     * 2. set frame-loop function to check action.
     * 3. set compass and other output.
     * @param {string}  dom_id  - container DOM ID
     */
    start: (dom_id) => {
        if (runtime.container !== null) return false;
        UI.show("toast", `Start FPV controller.`);

        //0.get canvas width
        self.setWidth(dom_id);
        self.initCode();            //set keyborad code --> player action

        //1.add keyboard listener and screen control
        const device = VBW.cache.get(["env", "device"]);
        env.mobile = device.mobile;
        VBW.queue.init(config.queue);
        if (device.mobile) {
            self.touch(dom_id);
        } else {
            self.keyboard();
            self.editControl(dom_id);
        }

        //2.set the related link
        self.setRuntime(dom_id);

        //3.set frame-loop function
        const world = runtime.player.location.world;
        const chain = ["block", dom_id, world, "loop"];
        if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
        const queue = VBW.cache.get(chain);
        queue.push({ name: "movement", fun: self.action });

        //4.flip the code --> key to key --> code, run once.
        if (config.keyboard === undefined) config.keyboard = self.flip(config.code);

        //5. init compass;
        const ak = runtime.player.location.rotation[2];
        Actions.common.compass(ak);
        UI.show("toast", `FPV controller is loaded.`);
    },
}

export default controller;