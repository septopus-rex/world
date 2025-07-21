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

const reg = {
    name: "player",
    category: 'system',
}

const config = {
    autosave: {
        interval: 60,        //frames for player status autosaving
        key: "vbw_player",
    },
    map: {
        id: "map_2d",
    },
    defaultWorld: 0,
    hold:3000,              //holding check time
}

const capacity = {
    move: 0.03,             //move speed, meter/second
    rotate: 0.05,           //rotate speed of head
    span: 0.31,             //max height of walking
    squat: 0.1,             //height of squat
    jump: 1,                //max height of jump
    death: 3,               //min height of fall death
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
                    self.showMap(ev);
                },
            },
        }
        UI.show("status", JSON.stringify(env.player.location.block), cfg_status);
    },
    showMap: (ev) => {
        const dom_id = config.map.id;
        const ctx = {
            title: "2D Map",
            content: `<div class="map" id="${config.map.id}"></div>`,
        }
        const cfg_map = {
            events: {
                close: () => {
                    console.log(`Map closed, clean the objects to access.`);
                    VBW.rd_two.clean(dom_id);
                },
            },
            auto: () => {
                VBW.rd_two.show(dom_id);
                VBW.con_two.start(dom_id);
            },
        };
        UI.show("dialog", ctx, cfg_map);
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
    checkLocation: (camera,pos,dom_id,skip) => {
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
            VBW.event.trigger("block","in",{stamp:Toolbox.stamp()},{x:x,y:y});
            VBW.event.trigger("block","out",{stamp:Toolbox.stamp()},{x:bx,y:by});

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
        
        VBW.update(dom_id, world);
        player.location.block = [x, y];

        //update player position
        player.location.position[0] = px % side[0] / cvt;
        player.location.position[1] = py % side[1] / cvt;
        if(!skip) player.location.position[2] = player.location.position[2] + pos[2] / cvt;
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
    setCompass: (ak) => {
        const angle = -180 * ak / Math.PI;
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

    syncCameraPosition: (pos,skip) => {
        if(env.lock) return false;

        for (let dom_id in env.camera) {
            //1. change camera position
            const cam = env.camera[dom_id];
            cam.position.set(                    //!important, transform from Septopus to three.js
                cam.position.x + pos[0],
                cam.position.y + pos[2],
                cam.position.z - pos[1],
            );

            //2. inc player action
            self.checkLocation(cam,pos,dom_id,skip);  
        }
    },
    fallCamera:(fall,ck)=>{
        UI.show("toast",`set camera position as fall, ${fall}m`);
        const cvt=self.getConvert();
        const single=20,total=1000;
        const step=fall*cvt*single/total;
        const tt=setInterval(()=>{
            for (let dom_id in env.camera) {
                const cam = env.camera[dom_id];
                cam.position.set(                    //!important, transform from Septopus to three.js
                    cam.position.x ,
                    cam.position.y - step,
                    cam.position.z ,
                );
            }
        },single);

        setTimeout(()=>{
            clearInterval(tt);
            return ck && ck();
        },total);
    },
    deathCamera:(height,ck)=>{
        UI.show("toast",`set camera position as death, ${height}m`);
        const cvt=self.getConvert();
        const single=20,total=2000;
        const step=height*cvt*single/total;
        const tt=setInterval(()=>{
            for (let dom_id in env.camera) {
                const cam = env.camera[dom_id];
                cam.position.set(                    //!important, transform from Septopus to three.js
                    cam.position.x ,
                    cam.position.y - step,
                    cam.position.z ,
                );
            }
        },single);

        setTimeout(()=>{
            clearInterval(tt);
            return ck && ck();
        },total);
        return ck && ck();
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
        self.setCompass(ak);
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
        if (env.player === null) env.player = VBW.cache.get(["env", "player"])
        //1.set body height
        //data.position[2]+=config.body.height;

        //2. set auto update and camera synchronous keyframe loop
        const world = data.world;
        const chain = ["block", dom_id, world, "loop"];
        if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
        const queue = VBW.cache.get(chain);
        queue.push({ name: "player", fun: self.auto });

        //3.set camera
        if (env.camera[dom_id] === undefined) {
            env.camera[dom_id] = VBW.cache.get(["active", "containers", dom_id, "camera"]);
        }

        //4. player event
        VBW.event.on("player","fall",(ev)=>{
            env.lock=true;      //set to lock movement;
            self.fallCamera(ev.fall,()=>{
                env.lock=false;
            });
        });

        VBW.event.on("player","death",(ev)=>{
            env.lock=true;      //set to lock movement;
            console.log(`death`,ev)
            self.deathCamera(ev.fall,()=>{

                UI.show("countdown", 10, {callback:()=>{
                    env.lock=false;
                }});
            });
        });

        // const target={x:2024,y:619,world:0,index:0,adjunct:"trigger"}
        // VBW.event.on("trigger","in",(ev)=>{
        //     console.log(`Trigger in, `, ev);
        // },target);

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

    initial: (local, dom_id) => {
        const side = self.getSide();
        const cvt = self.getConvert();

        const pos = [
            env.camera[dom_id].position.x + (local.block[0] - 1) * side[0] + local.position[0] * cvt,
            env.camera[dom_id].position.y + (local.block[1] - 1) * side[1] + local.position[1] * cvt,
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
    },

    /**
    * synchronous player movement to camera
    * @param   {object|array}    diff   - {position:[0,0,0],rotation:[0,0,0]}
    */
    synchronous: (diff) => {
        //console.log(`Changing: `,JSON.stringify(diff))
        if (Array.isArray(diff)) {

        } else {
            if (diff.position) self.syncCameraPosition(diff.position);
            if (diff.rotation) self.syncCameraRotation(diff.rotation);
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
    * player leave special object to block
    */
    leave:(check)=>{
        console.log("Player leave:", JSON.stringify(check));

        //1. location update
        const cvt=self.getConvert();
        const player=env.player;
        const fall=player.location.position[2];
        player.location.position[2]=0;

        console.log(`Leave height:`,fall);

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

        //console.log(fall,capacity.span)
        if(fall>=capacity.death){
            const evt={
                from:target,
                fall:fall,
                stamp:Toolbox.stamp(),
            }
            //!important, `player.death` event trigger
            VBW.event.trigger("player","death",evt);
        }else if(fall>=capacity.span){
            //console.log(`Falling...`)
            const evt={
                from:target,
                fall:fall,
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