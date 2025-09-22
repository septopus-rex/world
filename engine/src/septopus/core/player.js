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
//import Effects from "../effects/entry";
import Actions from "../io/actions";
import Pages from "../io/pages";

const reg = {
    name: "player",
    category: 'system',
    events:["fall","death","start","hold","rotate"],
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
    prepareBlocks:(to)=>{
        const player=env.player;
        const from=player.location.block;
        const ext=player.location.extend;
        const world=player.location.world;
        const dom_id=VBW.cache.get(["active","current"]);
        
        const change = self.cross(from, to, ext);
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

        VBW.event.trigger("block","in",{stamp:Toolbox.stamp()},{x:to[0],y:to[1],world:world,adjunct:"block",index:0});
        VBW.event.trigger("block","out",{stamp:Toolbox.stamp()},{x:from[0],y:from[1],world:world,adjunct:"block",index:0});

        VBW.update(dom_id, world,(done)=>{
            VBW.event.trigger("system","update",{stamp:Toolbox.stamp(),container:dom_id,world:world});
        });
    },

    syncCameraPosition: (pos) => {
        if(env.lock) return false;
        //1. change camera position
        for (let dom_id in env.camera) {
            const cam = env.camera[dom_id];
            cam.position.set(                    //!important, transform from Septopus to three.js
                cam.position.x + pos[0],
                cam.position.y + pos[2],
                cam.position.z - pos[1],
            );
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
        }
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
    updateRotation:(ro)=>{
        //2. increate player rotation
        const player=env.player;
        player.location.rotation[0] += ro[0];
        player.location.rotation[1] += ro[1];
        player.location.rotation[2] += ro[2];

        //3. update compass
        const ak = player.location.rotation[2];
        Actions.common.compass(ak);
    },
    updatePosition:(pos,block)=>{
        const player=env.player;
        const cvt=self.getConvert();
        if(!block){
            player.location.position[0] += pos[0]/cvt;
            player.location.position[1] += pos[1]/cvt;
            player.location.position[2] += pos[2]/cvt;

        }else{
            const side = self.getSide();
            const sx=side[0]/cvt,sy=side[1]/cvt;
            const px=player.location.position[0]+pos[0]/cvt;
            const py=player.location.position[1]+pos[1]/cvt;
            player.location.position[0] = px>0?px%sx:px+sx;
            player.location.position[1] = py>0?py%sy:py+sy;
            player.location.position[2] += pos[2]/cvt;
            player.location.block = [block[0],block[1]];
        }
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
    backup:(sub)=>{

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
}

const vbw_player = {
    //component hooks
    hooks: self.hooks,

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

    /**
    * entry of start player component
    * @functions
    * 1. set player location to camera
    * @param   {string}     dom_id  - container DOM id.
    * @param   {function}   ck      - callback function
    * @callback
    * @param    {object}    data   - details of player
        {
            "block":[2025,619],
            "position":[6.906,11.748,0],
            "rotation":[-0.012567,0,47.218136],
            "world":0,
            "extend":2,
            "stop":{"on":false,"adjunct":"","index":0}
        }
    */
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
            VBW.effects.set(camera,scene);
        }

        //4. player event
        VBW.event.on("player","fall",(ev)=>{
            if(env.lock) return false;
            env.lock=true;      //set to lock movement;
            const cfg={
                height:ev.fall,
                convert:self.getConvert()
            };
            VBW.effects.get("camera","fall",cfg,()=>{
                env.lock=false;
            });
        });

        VBW.event.on("player","death",(ev)=>{
            env.lock=true;      //set to lock movement;
            const cfg={ 
                height:ev.fall,
                convert:self.getConvert(),
                skip:true
            };
            VBW.effects.get("camera","fall",cfg,()=>{
                UI.show("countdown", 10, {callback:()=>{
                    env.lock=false;
                }});
            });
        });

        return ck && ck(data);
    },

    /**
    * clean player location of frontend
    * @return void
    */
    clean:()=>{
        env.clean=true;
        setTimeout(()=>{
            localStorage.removeItem(config.autosave.key);
        },50);
    },

    /**
    * format player parameters
    * @functions
    * 1. set player location
    * 2. calc player capacity by basic parameters
    * @param   {object}    local    - {"block":[x,y],"position":[x,y,z],"rotation":[x,y,z],"world":0,"extend":2,"stop":{"on":false,"adjunct":"","index":0}}
    * @param   {object}    basic    - player basic details
        {
            "start":{"block":[2025,619],"position":[12,12,0],"rotation":[0,0,0],"world":0,"extend":2,"stop":{"on":false,"adjunct":"","index":0}},
            "body":{"shoulder":0.5,"chest":0.22,"section":[0.3,0.4,0.2,0.8],"head":[0.25,0.05],"hand":[0.2,0.2,0.1],"leg":[0.5,0.5,0.1]},
            "capacity":{"rotate":0.05,"strength":1},
            "bag":{"max":100},
            "avatar":{"max":2097152,"scale":[2,2,2]}
        }
    * @return void
    */
    format: (local, basic) => {
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

    /**
    * initial player location
    * @functions
    * 1. set player location to camera
    * 2. binding `block.loaded` event to reset player stand height.
    * @param   {object}    local    - {position:[],rotation:[],block:[x,y],world:0}
    * @param   {string}    dom_id   - container DOM id.
    */
    initial: (local, dom_id) => {
        const side = self.getSide();
        const cvt = self.getConvert();
        const [x,y]=local.block;

        //1. set player location
        //!important, set the coordination as Septopus World in three.js system
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

        //2. reset player stand height.
        //sync player stand height to block elevation
        const target={x:x,y:y,world:local.world,index:0,adjunct:"block",}
        VBW.event.on("block","loaded",(ev)=>{
            //!impotant, when loaded, only raw data, need to calc elevation of block
            const va = VBW.cache.get(["block",dom_id,ev.world,`${ev.x}_${ev.y}`,"raw","data",0]);
            self.syncCameraPosition([0,0,va*cvt],true);
            VBW.event.off("block","loaded",target);
        },target);
    },

    /**
    * synchronous location changing to camera and player.
    * @param   {object|object[]}    diff        - {position:[0,0,0],rotation:[0,0,0]}
    * @param   {boolean}            check       -  {"interact":false,"move":true,"index":-1,"cross":true,"edelta":-1700,block:[0,0]}
    * @return  void
    */
    update:(diff,check)=>{
        //console.log(diff,check);
        if(check && check.cross) console.log(diff,check);

        //1. cross stuff
        if(check && check.cross){
            self.prepareBlocks(check.block);
        }

        //2. player status update
        //2.1. update stand status
        if (check && check.orgin) vbw_player.stand(check.orgin);

        //2.2. update rotation
        if (diff.rotation){
            self.syncCameraRotation(diff.rotation);
            self.updateRotation(diff.rotation);
        }

        //2.3. update XY position then Z position
        if (diff.position){
            const pos=[diff.position[0],diff.position[1],0];
            self.syncCameraPosition(pos);
            self.updatePosition(pos,check.block===undefined?false:check.block);
        }
        
    },

    /**
    * synchronous location changing to camera and player.
    * @param   {object|object[]}    diff     - {position:[0,0,0],rotation:[0,0,0]}
    * @param   {boolean}   cam_only - wether only set camera, ignore the player location checking
    * @return  void
    */
    _synchronous: (diff,cam_only) => {
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
        return true;
    },

    /**
    * teleport player to target block
    * @functions
    * 1. set player location
    * 2. sync camera to new location
    * @param   {number}    x        - block.x
    * @param   {number}    y        - block.y
    * @param   {number}    world    - world to teleport
    * @param   {number[]}  pos      - [x,y,z],position to teleport
    * @return  void
    */
    teleport:(x,y,world,pos)=>{

        env.player.location.world=world;
        env.player.location.block=[x,y];
        env.player.location.position=pos;

        const side = self.getSide();
        const cvt = self.getConvert();

        //!important, transform from Septopus to three.js
        const npos=[
            (x-1)*side[0] + pos[0]*cvt,
            pos[2],
            -((y-1)*side[1] + pos[1]*cvt),
        ]
        for (let kk in env.camera) {
            const cam = env.camera[kk];
            cam.position.set(
                npos[0],
                npos[1],
                npos[2],
            );
        }

        return true;
    },

    /**
    * player stand on stop which can be the `stop` of adjunct
    * @functions
    * 1. set player location
    * 2. trigger `stop.on` event
    * @param   {object}    orgin   - {adjunct:"wall",index:0}
    * @return {boolean}
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
    * @param {boolean}   skip  - weather skip syncCameraPosition
    */
    cross:(fall,skip)=>{
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
            //only for effects, stand height should be modified right now
            VBW.event.trigger("player","death",evt);
        }else if(fall>=capacity.span){
            //2.2 player fall normally
            const evt={
                from:target,
                fall:fall,
                stamp:Toolbox.stamp(),
            }
            //!important, `player.fall` event trigger
            //only for effects, stand height should be modified right now
            VBW.event.trigger("player","fall",evt);
        }else{
            //2.3 block elevation sync
            //if(!skip) self.syncCameraPosition([0,0,fall*cvt],true);
            //self.syncCameraPosition([0,0,fall*cvt],!skip);
        }   
        return true;
    },

    /**
    * player leave from special object to block
    * @functions
    * 1. reset player position.
    * 2. trigger event `stop.leave` trigger.
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
        //!important, `stop.leave` event trigger
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
            //const skip=true;
            //self.syncCameraPosition([0,0,-fall*cvt],skip);
        }
        return true;
    },
}

export default vbw_player;