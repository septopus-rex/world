/* 
*  3D FPV controller for PC
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-25
*  @functions
*  1. 
*/

import Movment from "../core/movement";
import VBW from "../core/framework";

const reg = {
    name: "con_first",       //组件名称
    category: 'controller',      //组件分类
}

let player = null;            //player information
let camera = null;            //FPV camera object
let actions = null;           //Pressed key queue
let side = null;              //Block size
let container = null;         //init DOM id
let world = null;             //active world
const config = {
    id: "fpv_control",
    code: {          //Definition of keyboard
        FORWARD: 87,     //W
        BACKWARD: 83,     //S
        LEFT: 65,     //A
        RIGHT: 68,     //D
        BODY_RISE: 82,     //R
        BODY_FALL: 70,     //F
        HEAD_LEFT: 37,     //Arrow left
        HEAD_RIGHT: 39,     //Arrow right
        HEAD_RISE: 38,     //Arrow up
        HEAD_DOWN: 40,     //Arrow down
        JUMP: 32,     //Space
        SQUAT: 17,     //Ctrl
    },
    queue: "keyboard",
    move: {
        distance: 100,
        angle: Math.PI * 0.01,
    },
}

const status = {
    locked: false,               //wether lock the movement input
    limit: null,                 //limit of movement
};

const todo = {
    FORWARD: Movment.body.forward,
    BACKWARD: Movment.body.backward,
    LEFT: Movment.body.leftward,
    RIGHT: Movment.body.rightward,
    BODY_RISE: Movment.body.rise,
    BODY_FALL: Movment.body.fall,
    JUMP: Movment.body.jump,
    SQUAT: Movment.body.squat,
    HEAD_LEFT: Movment.head.left,
    HEAD_RIGHT: Movment.head.right,
    HEAD_RISE: Movment.head.up,
    HEAD_DOWN: Movment.head.down,
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
    lock: () => {
        status.locked = true;
    },
    recover: () => {
        status.locked = false;
    },
    keyboard: (dom_id) => {
        VBW.queue.init(config.queue);
        self.bind('keydown', (ev) => {
            const code = ev.which;
            if (config.keyboard[code]) VBW.queue.insert(config.queue, config.keyboard[code]);
        });

        self.bind('keyup', (ev) => {
            const code = ev.which;
            if (config.keyboard[code]) VBW.queue.remove(config.queue, config.keyboard[code]);
        });
    },

    screen: (dom_id) => {

    },
    active: (world, dom_id) => {
        if (actions === null) actions = VBW.queue.get(config.queue);
        if (camera === null) {
            const chain = ["active", "containers", dom_id, "camera"];
            camera = VBW.cache.get(chain);
        }
        if (player === null) {
            const chain = ["env", "player"];
            player = VBW.cache.get(chain);
        }

        if (side === null) {
            side = VBW.cache.get(["env", "world", "side"]);
        }
    },

    flip: (obj) => {
        return Object.entries(obj).reduce((acc, [key, value]) => {
            acc[value] = key;
            return acc;
        }, {});
    },
    cross: (from, to, ext) => {
        const delta=[to[0]-from[0],to[1]-from[1]];
        //console.log(JSON.stringify(from), JSON.stringify(to), JSON.stringify(delta), ext);
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
    getConvert: () => {
        return VBW.cache.get(["env", "world", "accuracy"]);
    },

    updateLocation: (camera, total, moved, rotated) => {
        const px = camera.position.x;
        const py = camera.position.y;

        //1.set player position
        if (moved) {
            const x = Math.floor(px / side[0] + 1);
            const y = Math.floor(py / side[1] + 1);
            //console.log(`Current ${JSON.stringify([x,y])}, player: ${JSON.stringify(player.location)}`)

            //2.处理跨越block的数据获取
            const [bx, by] = player.location.block;
            if (bx !== x || by !== y) {
                //console.log(`Cross block from ${JSON.stringify(player.location)} to ${JSON.stringify([x, y])}`);
                const change=self.cross(player.location.block, [x, y],player.location.extend);
                const tasks = VBW.cache.get(["task", container, world]);
                //console.log(JSON.stringify(change));

                if(change.load.length!==0){
                    for(let i=0;i<change.load.length;i++){
                        const bk=change.load[i];
                        //tasks.push({adjunct:"block",action:"load",param:{x:bk[0],y:bk[1]}});
                        tasks.push({block:bk,action:"load"});
                    }
                }

                if(change.destroy.length!==0){
                    for(let i=0;i<change.destroy.length;i++){
                        const bk=change.destroy[i];
                        //tasks.push({adjunct:"block",action:"unload",param:{x:bk[0],y:bk[1]}});
                        tasks.push({block:bk,action:"unload"});
                    }
                }

                //tasks.push({adjunct:"block",act:"remove",param:{x:bx,y:by}});
                //tasks.push({adjunct:"block",act:"remove",param:{x:x+1,y:y}});
                //tasks.push({adjunct:"block",act:"remove",param:{x:x,y:y+1}});
                //tasks.push({adjunct:"wall",act:"set",x:bx,y:by,world:0,param:{index:0,x:1.9}});
            }

            VBW.update(container, world);

            player.location.block = [x, y];
        }

        //2.check wether stop
        //TODO, need to check stop station, include nearby blocks

        //3.player sync
        const cvt = self.getConvert();
        player.location.position[0] = px % side[0] / cvt;
        player.location.position[1] = py % side[1] / cvt;
        player.location.position[2] = player.location.position[2] + total.position[2] / cvt;

        player.location.rotation[0] = player.location.rotation[0] + total.rotation[0];
        player.location.rotation[1] = player.location.rotation[1] + total.rotation[1];
        player.location.rotation[2] = player.location.rotation[2] + total.rotation[2];
    },


    //帧同步里的方法，在这里进行运动
    action: () => {
        const dis = [config.move.distance, config.move.angle];
        const ak = camera.rotation.y;

        //1.根据键盘操作获取移动参数
        let moved = false, rotated = false;
        const total = { position: [0, 0, 0], rotation: [0, 0, 0] }
        for (let i = 0; i < actions.length; i++) {
            const act = actions[i];
            if (!todo[act]) continue;
            const diff = todo[act](dis, ak);

            if (diff.position) {
                //1.1.检查会不会被stop阻挡

                //1.2.对位置进行移动处理
                moved = true;
                total.position[0] += diff.position[0];
                total.position[1] += diff.position[1];
                total.position[2] += diff.position[2];

                camera.position.set(
                    camera.position.x + total.position[0],
                    camera.position.y + total.position[1],
                    camera.position.z + total.position[2],
                );
            }

            if (diff.rotation) {
                rotated = true;
                total.rotation[0] += diff.rotation[0];
                total.rotation[1] += diff.rotation[1];
                total.rotation[2] += diff.rotation[2];

                camera.rotation.set(
                    camera.rotation.x + total.rotation[0],
                    camera.rotation.y + total.rotation[1],
                    camera.rotation.z + total.rotation[2],
                );
            }

            //TODO,这里对判断是否为数组，如果是的话，连续运动，lock住再动。这样就可以支持jump等操作
            //2.对连续动作的支持处理 [{position:[0,0,0],rotation:[0,0,0]},...]类型的数据
            if (diff.group) {
                self.lock();
                for (let i = 0; i < diff.group.length; i++) {
                    const single = diff.group[i];

                    //2.1.处理位置信息，并检测是否被阻挡

                    //2.2.处理旋转信息
                }
            }
        }

        //2.检测是否移动出了block位置
        if (!status.lock) {
            self.updateLocation(camera, total, moved, rotated);
        }
    },
}

const control_fpv = {
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
        console.log(`Start to get the input from outside, bind html events.`);
        //0.设置dom_id和控制器的关联
        container = dom_id

        //1.增加键盘的操作
        self.keyboard(dom_id);

        //2.增加screen的操作;
        self.screen(dom_id);

        //3.设置帧同步处理
        world = VBW.cache.get(["active", "world"]);
        const chain = ["block", dom_id, world, "loop"];
        if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
        const queue = VBW.cache.get(chain);
        queue.push({ name: "movement", fun: self.action });

        //4.获取到对应的变量，方便操作
        self.active(world, dom_id);

        //5.flip the code --> key to key --> code, run once.
        if (config.keyboard === undefined) config.keyboard = self.flip(config.code);
    },
}

export default control_fpv;