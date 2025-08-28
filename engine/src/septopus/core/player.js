/**
 * Core - player
 *
 * @fileoverview
 *  1. save the location of player
 *  2. save the body parameters of player.
 *  3. player events trigger
 *
 * @author Fuu
 * @date 2025-04-23
 */

import Toolbox from "../lib/toolbox";
import VBW from "./framework";
import UI from "../io/io_ui";
import Effects from "../effects/entry";
import Actions from "../io/actions";
import Pages from "../io/pages";

const reg = {
    name: "player",
    category: 'system',
}

const config = {
    autosave: {
        interval: 60,        //frames for player status autosaving
        key: "vbw_player",
    },
    // map: {
    //     id: "map_2d",
    // },
    defaultWorld: 0,
    hold:3000,              //holding check time
}

const capacity = {
    move: 0.02,             //move speed, meter/second
    rotate: 0.05,           //rotate speed of head
    span: 0.31,             //max height of walking
    squat: 0.1,             //height of squat
    jump: 1,                //max height of jump
    death: 4,               //min height of fall death
    speed: 1.5,             //move speed, meter/second
    strength: 1,            //strength time for jump. Not used yet.
}

const env = {
    count: 0,
    player: null,
    lock: false,        //movement input locker
    clean:false,
    camera: {},        //camera to sync
    diff: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        moved: false,
        rotated: true,
    },
}

const self = {
    hooks: {
        reg: () => {
            return reg;
        },
        init: () => {
            const py = {
                address: "",
                stamp: Toolbox.stamp(),
                capacity: capacity,
                body: {
                    height: 1.7,
                },
            }
            return {
                chain: ["env", "player"],
                value: py,
            };
        },
    },
    getPlayerLocation: () => {
        const key = config.autosave.key;
        const pp = localStorage.getItem(key);
        if (pp === null) {
            //localStorage.setItem(key, JSON.stringify(config.location));
            return { world: config.defaultWorld };
        } else {
            try {
                const data = JSON.parse(pp);
                return data;
            } catch (error) {
                //localStorage.setItem(key, JSON.stringify(config.location));
                localStorage.removeItem(key);
                return { world: config.defaultWorld };
            }
        }
    },
    statusUI: () => {
        //1.show block information and bind status click function
        const cfg_status = {
            events: {
                click: (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    console.log(`Status clicked.`);
                    Pages.map();
                },
            },
        }
        UI.show("status", JSON.stringify(env.player.location.block), cfg_status);
    },

    getHeight: (section) => {
        let h = 0;
        for (let i = 0; i < section.length; i++) {
            h += parseFloat(section[i]);
        }
        return h;
    },
    calcCapacity: (body) => {

    },
    getConvert: () => {
        return VBW.cache.get(["env", "world", "accuracy"]);
    },
    getSide: () => {
        return VBW.cache.get(["env", "world", "side"]);
    },

    //parameter skip: wether adding pos z(pos[2]) to player z position  
    checkLocation: (camera,pos,dom_id,cam_only) => {
        //console.log(`Check location:`,JSON.stringify(pos));
        const px = camera.position.x;
        const py = -camera.position.z;
        const player = env.player;
        const side = self.getSide();
        const cvt = self.getConvert();
        const world=player.location.world;

        //1.set player position
        const x = Math.floor(px / side[0] + 1);
        const y = Math.floor(py / side[1] + 1);

        //2.deal with the cross stuff, load more data
        const [bx, by] = player.location.block;
        if (bx !== x || by !== y) {

            //!important, `block.in` event trigger 
            VBW.event.trigger("block","in",{stamp:Toolbox.stamp()},{x:x,y:y,world:world,adjunct:"block",index:0});
            VBW.event.trigger("block","out",{stamp:Toolbox.stamp()},{x:bx,y:by,world:world,adjunct:"block",index:0});
            //console.log(`Trigger block out.`);

            const change = self.cross(player.location.block, [x, y], player.location.extend);
            const tasks = VBW.cache.get(["task", dom_id, world]);
            if (change.load.length !== 0) {
                for (let i = 0; i < change.load.length; i++) {
                    const bk = change.load[i];
                    tasks.push({ block: bk, action: "load" });
                }
            }

            if (change.destroy.length !== 0) {
                for (let i = 0; i < change.destroy.length; i++) {
                    const bk = change.destroy[i];
                    tasks.push({ block: bk, action: "unload" });
                }
            }
        }
        
        VBW.update(dom_id, world,(done)=>{
            VBW.event.trigger("system","update",{stamp:Toolbox.stamp(),container:dom_id,world:world});
        });
        player.location.block = [x, y];

        //update player position
        player.location.position[0] = px % side[0] / cvt;
        player.location.position[1] = py % side[1] / cvt;
        if(!cam_only) player.location.position[2] = player.location.position[2] + pos[2] / cvt;
    },
    cross: (from, to, ext) => {
        
        const delta = [to[0] - from[0], to[1] - from[1]];
        const dlist = [], glist = [], rg = ext + ext + 1;
        const x = delta[0] > 0 ? from[0] - ext : from[0] + ext, y = delta[1] > 0 ? from[1] - ext : from[1] + ext;
        if (delta[0] != 0 && delta[1] == 0) {
            for (let i = -ext; i <= ext; i++) {
                dlist.push([x, from[1] + i]);
                glist.push([x + (delta[0] > 0 ? rg : -rg), from[1] + i])
            }
        } else if (delta[0] == 0 && delta[1] != 0) {
            for (let i = -ext; i <= ext; i++) {
                dlist.push([from[0] + i, y]);
                glist.push([from[0] + i, y + (delta[1] > 0 ? rg : -rg)]);
            }
        } else if (delta[0] != 0 && delta[1] != 0) {
            const sx = delta[0] > 0 ? 1 : 0, ex = delta[0] > 0 ? 0 : -1;
            const sy = delta[1] > 0 ? 1 : 0, ey = delta[1] > 0 ? 0 : -1;

            //1.get the remove list
            for (let i = -ext; i <= ext; i++) dlist.push([x, from[1] + i]);
            for (let i = -ext + sx; i <= ext + ex; i++) dlist.push([from[0] + i, y]);

            //2.get the load list
            for (let i = -ext + sy; i <= ext + ey; i++)glist.push([x + (delta[0] > 0 ? rg : -rg), from[1] + i]);
            for (let i = -ext + sx; i <= ext + ex; i++)glist.push([from[0] + i, y + (delta[1] > 0 ? rg : -rg)]);
            glist.push([from[0] + (delta[0] > 0 ? ext + 1 : -ext - 1), from[1] + (delta[1] > 0 ? ext + 1 : -ext - 1)]);

        }
        return { load: glist, destroy: dlist };
    },
    syncCameraPosition: (pos, cam_only) => {
        if(env.lock) return false;

        for (let dom_id in env.camera) {
            //1. change camera position
            const cam = env.camera[dom_id];
            cam.position.set(                    //!important, transform from Septopus to three.js
                cam.position.x + pos[0],
                cam.position.y + pos[2],
                cam.position.z - pos[1],
            );

            //2. inc player position to set block
            if(pos[0]!==0 || pos[1]!==0){
                self.checkLocation(cam,pos,dom_id,cam_only);
            }
        }
    },
    syncCameraRotation: (ro) => {
        for (let dom_id in env.camera) {
            //1. change camera position
            const cam = env.camera[dom_id];
            cam.rotation.set(
                cam.rotation.x + ro[0],
                cam.rotation.y - ro[2],
                cam.rotation.z + ro[1],
            );

            //2. increate player rotation
            env.player.location.rotation[0] += ro[0];
            env.player.location.rotation[1] += ro[1];
            env.player.location.rotation[2] += ro[2];
        }
        const ak = env.player.location.rotation[2];
        Actions.common.compass(ak);
    },
    saveLocation:()=>{
        const data=Toolbox.clone(env.player.location);
        const fun=Toolbox.toF;
        for(let i=0;i<data.position.length;i++){
            data.position[i]=fun(data.position[i]);
        }

        for(let i=0;i<data.rotation.length;i++){
            data.rotation[i]=fun(data.rotation[i],6);
        }

        localStorage.setItem(config.autosave.key, JSON.stringify(data));
    },
    auto: () => {

        if ( env.clean ){
            return false;
        }

        if (env.count > config.autosave.interval) {
            env.count = 0;
            self.saveLocation();
            self.statusUI();
        } else {
            env.count++;
        }
    },
    task:{
        
        fly:()=>{

        },
        fix:()=>{

        },
        body:()=>{

        },
        capacity:()=>{

        },
    },
    backup:(sub)=>{

    },
    
}

const vbw_player = {
    hooks: self.hooks,

    //get the player status.
    start: (dom_id, ck) => {
        const data = self.getPlayerLocation();
        if (env.player === null) env.player = VBW.cache.get(["env", "player"]);

        //2. set auto update and camera synchronous keyframe loop
        const world = data.world;
        const chain = ["block", dom_id, world, "loop"];
        if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
        const queue = VBW.cache.get(chain);
        queue.push({ name: "player", fun: self.auto });

        //3.set camera
        if (env.camera[dom_id] === undefined) {
            const camera=VBW.cache.get(["active", "containers", dom_id, "camera"]);
            const scene=VBW.cache.get(["active", "containers", dom_id, "scene"]);
            env.camera[dom_id] = camera;
            Effects.set(camera,scene);
        }

        //4. player event
        VBW.event.on("player","fall",(ev)=>{
            if(env.lock) return false;
            env.lock=true;      //set to lock movement;
            const cfg={height:ev.fall,convert:self.getConvert()};
            Effects.get("camera","fall",cfg,()=>{
                env.lock=false;
            });
        });

        VBW.event.on("player","death",(ev)=>{
            env.lock=true;      //set to lock movement;
            const cfg={height:ev.fall,convert:self.getConvert(),skip:true};
            Effects.get("camera","fall",cfg,()=>{
                UI.show("countdown", 10, {callback:()=>{
                    env.lock=false;
                }});
            });
        });

        return ck && ck(data);
    },

    clean:()=>{
        env.clean=true;
        setTimeout(()=>{
            localStorage.removeItem(config.autosave.key);
        },50);
    },

    format: (local, basic) => {
        //console.log(local, basic);
        //1. set basic location
        if (local.block === undefined) {
            env.player.location = basic.start;
        } else {
            env.player.location = local;
        }

        //2. caculate capacity
        env.player.body = basic.body
        env.player.body.height = self.getHeight(basic.body.section);
        self.calcCapacity(env.player.body);

        return env.player.location;
    },

    elevation:(x,y,world,dom_id)=>{
        const chain = ["block", dom_id, world, `${x}_${y}`, "elevation"];
        const va=VBW.cache.get(chain);
        const now=env.camera[dom_id].position;
        env.camera[dom_id].position.set(now.x,now.y + va,now.z);
    },

    /**
    * synchronous player movement to camera
    * @param   {object|array}    diff   - {position:[0,0,0],rotation:[0,0,0],order:"XYZ"}
    */
    initial: (local, dom_id) => {
        const side = self.getSide();
        const cvt = self.getConvert();
        const [x,y]=local.block;

        const pos = [
            env.camera[dom_id].position.x + (x - 1) * side[0] + local.position[0] * cvt,
            env.camera[dom_id].position.y + (y - 1) * side[1] + local.position[1] * cvt,
            local.position[2] * cvt + env.player.body.height * cvt
        ]
        env.camera[dom_id].position.set(
            pos[0],
            pos[2],
            -pos[1]
        );
        env.camera[dom_id].rotation.set(
            local.rotation[0],
            -local.rotation[2],
            local.rotation[1]
        );

        //sync player stand height to block elevation
        const target={x:x,y:y,world:local.world,index:0,adjunct:"block",}
        VBW.event.on("block","loaded",(ev)=>{
            const va = VBW.cache.get(["block",dom_id,ev.world,`${ev.x}_${ev.y}`,"raw","data",0]);
            self.syncCameraPosition([0,0,va*cvt],true);
            VBW.event.off("block","loaded",target);
        },target);
    },

    /**
    * synchronous player movement to camera
    * @param   {object|array}    diff   - {position:[0,0,0],rotation:[0,0,0],order:"XYZ"}
    */
    synchronous: (diff,cam_only) => {
        if (Array.isArray(diff)) {

        } else {
            if (diff.position){
                if(cam_only){
                    self.syncCameraPosition(diff.position,true);
                }else{
                    self.syncCameraPosition(diff.position);
                }
            }
            if (diff.rotation) self.syncCameraRotation(diff.rotation);
        }
    },

    teleport:(x,y,world,dom_id,pos)=>{

        env.player.location.world=world;
        env.player.location.block=[x,y];
        env.player.location.position=pos;

        const side = self.getSide();
        const cvt = self.getConvert();

        //console.log(x,y,world,dom_id,pos,side);
        //!important, transform from Septopus to three.js
        const npos=[
            (x-1)*side[0] + pos[0]*cvt,
            pos[2],
            -((y-1)*side[1] + pos[1]*cvt),
        ]
        for (let dom_id in env.camera) {
            //1. change camera position
            const cam = env.camera[dom_id];
            cam.position.set(
                npos[0],
                npos[1],
                npos[2],
            );
        }
    },

    /**
    * player stand on special object
    * @param   {object}    check   - {"interact":true,"move":true,"index":0,"delta":0,"orgin":{"adjunct":"box","index":0,"type":"box"}}
    */
    stand:(orgin)=>{
        //1. location update
        const player=env.player;
        player.location.stop.on=true;
        player.location.stop.adjunct=orgin.adjunct;
        player.location.stop.index=orgin.index;
        self.saveLocation();
        
        //2. event trigger
        //!important, `player.stop.on` event trigger
        const target={
            stamp:Toolbox.stamp(),
            adjunct:orgin.adjunct,
            index:orgin.index,
            world:player.location.world,
            x:player.location.block[0],
            y:player.location.block[1],
        }
        VBW.event.trigger("stop","on",{stamp:Toolbox.stamp()},target);
        return true;
    },

    /**
    * player go cross to `block` from `stop`
    * @functions
    * 1. set player position
    * 2. trigger event `player.fall` or `player.death`.
    * @param    {number}    fall    - fall height
    */
    cross:(fall)=>{
        console.log(`Cross fall height:`,fall);
        const cvt=self.getConvert();
        const player=env.player;
        const target={
            stamp:Toolbox.stamp(),
            world:player.location.world,
            x:player.location.block[0],
            y:player.location.block[1],
        }

        if(fall>=capacity.death){
            //2.1. player fall to death
            const evt={
                from:target,
                fall:fall,
                stamp:Toolbox.stamp(),
            }
            //!important, `player.death` event trigger
            VBW.event.trigger("player","death",evt);
        }else if(fall>=capacity.span){
            //2.2 player fall normally
            const evt={
                from:target,
                fall:fall,
                stamp:Toolbox.stamp(),
            }
            //!important, `player.fall` event trigger
            VBW.event.trigger("player","fall",evt);
        }else{
            //2.3 block elevation sync
           self.syncCameraPosition([0,0,fall*cvt],true);
        }   
        return true;
    },

    /**
    * player leave from special object to block
    * @functions
    * 1. reset player position.
    * 2. trigger event `stop.on` trigger.
    * 3. trigger event `player.fall` or `player.death`.
    * @param {object}   check  - {"interact":false,"move":true,"cross":true,"edelta":-100}
    * @return
    */
    leave:(check)=>{
        console.log("Player leave:", JSON.stringify(check));

        const cvt=self.getConvert();
        const player=env.player;

        //1. location update
        const fall=player.location.position[2];
        player.location.position[2]=0;      //reset player stand height

        const stop=Toolbox.clone(player.location.stop);
        player.location.stop.on=false;
        player.location.stop.adjunct="";
        player.location.stop.index=0;
        self.saveLocation();

        //2. event trigger
        //!important, `stop.on` event trigger
        const target={
            stamp:Toolbox.stamp(),
            adjunct:stop.adjunct,
            index:stop.index,
            world:player.location.world,
            fall:fall,
            x:player.location.block[0],
            y:player.location.block[1],
        }
        VBW.event.trigger("stop","leave",{stamp:Toolbox.stamp()},target);

        const act_fall=check.cross?(fall-check.edelta/cvt):fall;
        console.log(`Actual fall height`,act_fall);
        
        if(act_fall>=capacity.death){
            //2.1. player fall to death
            const evt={
                from:target,
                fall:act_fall,
                stamp:Toolbox.stamp(),
            }
            //!important, `player.death` event trigger
            VBW.event.trigger("player","death",evt);
        }else if(act_fall>=capacity.span){
            //2.2 player fall normally
            const evt={
                from:target,
                fall:act_fall,
                stamp:Toolbox.stamp(),
            }
            //!important, `player.fall` event trigger
            VBW.event.trigger("player","fall",evt);
        }else{
            const skip=true;
            self.syncCameraPosition([0,0,-fall*cvt],skip);
        }
        return true;
    },

    /**
    * Trigger task here.
    * @functions
    * 1. body control.
    * 2. movement capacity control.
    * 3. more actions.
    */
    task:()=>{
        return {
            fly:self.task.fly,
            capacity:self.task.capacity,
            body:self.task.body,
            dance:(ev)=>{

            },
            router:["body","capacity","fly","dance"],
        }
    },
}

export default vbw_player;