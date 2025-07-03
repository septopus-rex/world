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

const buttons = {
    buy: {
        label: "Buy", icon: "", action: async () => {
            console.log(`Buy button clicked.`);
            const res = await VBW.datasource.contract.call("buy", [2000, 1290, 0]);
            console.log(res);
        }
    },
    edit: {
        label: "Edit", icon: "", action: () => {
            const player=VBW.cache.get(["env", "player"]);
            if (player.error) return UI.show("toast", player.error, { type: "error" });
            const {world,block}=player.location;
            const active=VBW.cache.get(["active"]);
            const dom_id=active.current;
            World.edit(dom_id, world, block[0], block[1]);
        }
    },
    normal: {
        label: "Normal", icon: "", action: () => {
            const player=VBW.cache.get(["env", "player"]);
            if (player.error) return UI.show("toast", player.error, { type: "error" });
            const {world}=player.location;
            const active=VBW.cache.get(["active"]);
            const dom_id=active.current;
            World.normal(dom_id, world, (done) => {
                console.log(done);
            });
        }
    },
    detail: {
        label: "Detail", icon: "", action: () => {
            const ctx = {
                title: "Hello",
                content: "This a dailog to show more details.",
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
    world: {
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
    }
};

const actions={
    buttons:buttons,
}

export default actions;