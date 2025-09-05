/**
 * IO - Basic actions components
 *
 * @fileoverview
 *  1. buttons of actions
 *  2. pops of actions
 * 
 * @author Fuu
 * @date 2025-07-03
 */

import VBW from "../core/framework";
import World from "../core/world";
import UI from "./io_ui";
import Pages from "./pages";

const config = {
    map: {
        container: "map_2d",
        title: "map_title",
    },
    card: {
        container: "card_body",
        title: "card_title",
    }
}

const self={

};

const buttons = {
    stop: {
        label: "Stop", icon: "", action: async () => {
            console.log(`Stop rendering button clicked.`);
            //const res = await VBW.datasource.contract.call("buy", [2000, 1290, 0]);
            //console.log(res);
            const active = VBW.cache.get(["active"]);
            const dom_id = active.current;
            World.stop(dom_id);
        }
    },
    start: {
        label: "Start", icon: "", action: async () => {
            console.log(`Restart rendering button clicked.`);
            //const res = await VBW.datasource.contract.call("buy", [2000, 1290, 0]);
            //console.log(res);
            const active = VBW.cache.get(["active"]);
            const dom_id = active.current;
            World.start(dom_id);
        }
    },
    buy: {
        label: "Buy", icon: "", action: async () => {
            console.log(`Buy button clicked.`);
            const res = await VBW.datasource.contract.call("buy", [2000, 1290, 0]);
            console.log(res);
        }
    },
    edit: {
        label: "Edit", icon: "", action: () => {
            const player = VBW.cache.get(["env", "player"]);
            if (player.error) return UI.show("toast", player.error, { type: "error" });

            const { world, block } = player.location;
            const active = VBW.cache.get(["active"]);
            const dom_id = active.current;
            World.edit(dom_id, world, block[0], block[1]);
        }
    },
    normal: {
        label: "Normal", icon: "", action: () => {
            const player = VBW.cache.get(["env", "player"]);
            if (player.error) return UI.show("toast", player.error, { type: "error" });
            const { world } = player.location;
            const active = VBW.cache.get(["active"]);
            const dom_id = active.current;
            World.normal(dom_id, world, (done) => {
                console.log(done);
            });
        }
    },
    detail: {
        label: "Detail", icon: "", action: () => {
            const ctx = {
                title: `Game detail.`,
                content: "This a dailog to show more details.",
            }

            const dom_id = VBW.cache.get(["active", "current"]);
            const player = VBW.cache.get(["env", "player"]);
            const world = player.location.world;
            const [x, y] = player.location.block;
            const chain = ["block", dom_id, world, `${x}_${y}`, 'std', 'block', 0];
            const bk = VBW.cache.get(chain);
            if (bk.error || !bk.game) {
                ctx.title = "Error";
                ctx.content = bk.error;
            } else {
                const data = VBW.cache.get(["resource", "game", `${world}_${bk.game}`]);
                if (data.error) {
                    ctx.title = "Error: resource is not loaded.";
                    ctx.content = data.error;
                } else {
                    ctx.title = `Game: ${data.raw.game}`;
                    ctx.content = "Enjoy!";
                }
            }
            UI.show("dialog", ctx, { position: "center" });
        }
    },

    mint: {
        label: "Mint", icon: "", action: async () => {
            const res = await VBW.datasource.contract.call("mint", [2000, 1290, 0]);
            console.log(res);
        }
    },

    clean: {
        label: "Clean", icon: "", action: async () => {
            VBW.player.clean();
            console.log(`Player location is cleaned, please reset system.`);
        }
    },

    news: {
        label: "News", icon: "", action: async () => {
            Pages.news();
        }
    },

    manual: {
        label: "Manual", icon: "", action: async () => {
            Pages.manual();
        }
    },

    system: {
        label: "System", icon: "", action: async () => {
            Pages.system();
        }
    },
    setting: {
        label: "Setting", icon: "", action: async () => {
            Pages.setting();
        }
    },
    world: {
        label: "World", icon: "", action: async () => {
            Pages.world();
        }
    },

    game: {
        label: "Game", icon: "", action: async () => {
            const dom_id = VBW.cache.get(["active", "current"]);
            const player = VBW.cache.get(["env", "player"]);
            const world = player.location.world;
            const [x, y] = player.location.block;
            const chain = ["block", dom_id, world, `${x}_${y}`, 'std', 'block', 0];
            const bk = VBW.cache.get(chain);
            console.log(`${x}_${y}`, bk);
            const game = VBW.cache.get(["resource", "game", `${world}_${bk.game}`]);
            const def = VBW.cache.get(["def", "common"]);
            console.log(game);
            
            //const current=VBW.cache.get(["active","current"]);
            const cfg = { blocks: [[2024, 614], [2024, 614, 2, 3], []]};
            VBW.mode(def.MODE_GAME,{container:dom_id},()=>{

            },cfg);
        }
    },
    demo: {
        label: "World", icon: "", action: () => {
            const inputs = [
                {
                    type: "string",
                    key: "desc",
                    value: "",
                    desc: "Description of this Septopus Worlod",
                    placeholder: "200 max",
                    valid: (val) => {
                        if (!val) return "Invalid description.";
                        if (val.length > 200) return "200 bytes max";
                        return true;
                    }
                },
                {
                    type: "integer",
                    key: "index",
                    value: 1,
                    desc: "World index on chain",
                    placeholder: "Index of world",
                    valid: (val) => {
                        console.log(val);
                        if (val !== 2) return "Invalid World Index, please check."
                        return true;
                    }
                },
            ];
            const cfg = {
                title: "World Setting",
                buttons: { save: true, recover: false },
                events: {
                    save: (obj) => {
                        console.log(obj);
                    },
                    close: () => {

                    },
                }
            }
            UI.show("form", inputs, cfg);
        }
    },
};

const common = {
    compass: (ak) => {
        const angle = 180 * ak / Math.PI;
        const cfg_compass = {
            events: {
                click: (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    //console.log(`Compass clicked`);
                    Pages.card();
                    //Pages.news();
                },
            },
        }
        UI.show("compass", angle, cfg_compass);
    },
    mode:()=>{
        
    }
}

const Actions = {
    buttons: buttons,
    common: common,
}

export default Actions;