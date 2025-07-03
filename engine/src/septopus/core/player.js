/**
 * Core - player
 *
 * @fileoverview
 *  1. save the location of player
 *  2. save the body parameters of player.
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
}

const capacity = {
    move: 0.03,          //move speed, meter/second
    rotate: 0.05,        //rotate speed of head
    span: 0.31,          //max height of walking
    squat: 0.1,          //height of squat
    jump: 1,            //max height of jump
    death: 3,            //min height of fall death
    speed: 1.5,          //move speed, meter/second
    strength: 1,         //strength time for jump. Not used yet.
}

let count = 0;          //count to fresh, reduce the fresh frequence
let player = null;      //player link to cache
let camera = null;      //camera to sync
const self = {
    hooks: {
        reg: () => {
            return reg;
        },
        init: () => {
            // const py = Toolbox.clone(config);
            // py.avatar = "";
            // py.address = "";
            // py.stamp = Toolbox.stamp();

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
    updateStatus: () => {
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
        UI.show("status", JSON.stringify(player.block), cfg_status);
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
}

const vbw_player = {
    hooks: self.hooks,
    autosave: () => {
        if (player === null) {
            player = VBW.cache.get(["env", "player"]);
        }

        if (count > config.autosave.interval) {
            const key = config.autosave.key;
            localStorage.setItem(key, JSON.stringify(player.location));
            count = 0;
            self.updateStatus();
        } else {
            count++;
        }
    },

    //get the player status.
    start: (dom_id, ck) => {
        const data = self.getPlayerLocation();
        if (player === null) player = VBW.cache.get(["env", "player"])
        //1.set body height
        //data.position[2]+=config.body.height;

        //2. set auto update
        const chain = ["block", dom_id, data.world, "loop"];
        if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
        const queue = VBW.cache.get(chain);
        queue.push({ name: "player", fun: vbw_player.autosave });

        //3.set camera
        if (camera === null) {
            camera = VBW.cache.get(["active", "containers", dom_id, "camera"]);
        }

        return ck && ck(data);
    },

    format: (local, basic) => {
        console.log(local, basic, player);

        //1. set basic location
        if (local.block === undefined) {
            player.location = basic.start;
        } else {
            player.location = local;
        }

        //2. caculate capacity
        player.body = basic.body
        player.body.height = self.getHeight(basic.body.section);
        self.calcCapacity(player.body);
    },

    synchronous: (local) => {
        const side = self.getSide();
        const cvt = self.getConvert();
        const pos = [
            camera.position.x + (local.block[0] - 1) * side[0] + local.position[0] * cvt,
            camera.position.y + (local.block[1] - 1) * side[1] + local.position[1] * cvt,
            local.position[2] * cvt
        ]
        camera.position.set(pos[0], pos[2], -pos[1]);
        camera.rotation.set(...local.rotation);
    },
}

export default vbw_player;