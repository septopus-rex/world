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
    location: {
        block: [2025, 501],
        world: 0,
        position: [8, 14, 0],
        rotation: [0, 0, 0],
        stop:{
            on:false,               //whether on stop ( including adjunct type )
            adjunct:"",             //adjunct support stop attribution, need to figure out
            index:0,                //adjunct index
        },
        extend: 2,
        posture: 0,                 //movement posture. ["stand","walking","running","climbing","squatting","lying"]
    },
    body: {
        height: 1.7,
        shoulder: 0.5,
        chest: 0.22,
    },
    capacity: {
        move: 0.03,          //move speed, meter/second
        rotate: 0.05,        //rotate speed of head
        span: 0.31,          //max height of walking
        squat: 0.1,          //height of squat
        jump: 1,            //max height of jump
        death: 3,            //min height of fall death
        speed: 1.5,          //move speed, meter/second
        strength: 1,         //strength time for jump. Not used yet.
    },
    autosave: {
        interval: 60,        //frames for player status autosaving
        key: "vbw_player",
    },
    map: {
        id: "map_2d",
    },
}

let count = 0;          //count to fresh, reduce the fresh frequence
let player = null;      //player link to cache

const self = {
    hooks: {
        reg: () => {
            return reg;
        },
        init: () => {
            const py = Toolbox.clone(config);
            py.avatar = "";
            py.address = "";
            py.stamp = Toolbox.stamp();

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
            return {world:0};
        } else {
            try {
                const data = JSON.parse(pp);
                return data;
            } catch (error) {
                //localStorage.setItem(key, JSON.stringify(config.location));
                localStorage.removeItem(key);
                return {world:0};
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
        const dom_id=config.map.id;
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
}

const vbw_player = {
    hooks: self.hooks,
    autosave: () => {
        //return false;
        if (player === null) {
            player = VBW.cache.get(["env", "player", "location"]);
            player.position[2]-=config.body.height;     //dec the body height
        }

        if (count > config.autosave.interval) {
            const key = config.autosave.key;
            localStorage.setItem(key, JSON.stringify(player));
            count = 0;
            self.updateStatus();
        } else {
            count++;
        }
    },

    //get the player status.
    start: (dom_id, ck) => {
        const data = self.getPlayerLocation();

        //const body={};

        //1.set body height
        //data.position[2]+=config.body.height;

        //2. set auto update
        const chain = ["block", dom_id, data.world, "loop"];
        if (!VBW.cache.exsist(chain)) VBW.cache.set(chain, []);
        const queue = VBW.cache.get(chain);
        queue.push({ name: "player", fun: vbw_player.autosave });

        return ck && ck(data);
    },
}

export default vbw_player;