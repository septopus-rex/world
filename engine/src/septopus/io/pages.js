/**
 * IO - Basic pages of output
 *
 * @fileoverview
 *  1. pages of detail
 * 
 * @author Fuu
 * @date 2025-08-23
 */

import VBW from "../core/framework";
import World from "../core/world";
import UI from "./io_ui";

const config = {
    map: {
        container: "map_2d",
        title: "map_title",
    },
    card: {
        container: "card_body",
        title: "card_title",
    },
    news: {
        container: "news_container",
        title: "news_title",
    }
}

const self={

};


const Pages = {
    map: () => {
        const container_id = config.map.container;
        const title_id = config.map.title;
        const ctx = {
            title: `<div id="${title_id}">2D map</div>`,
            content: `<div class="map" id="${container_id}"></div>`,
        }
        const cfg = {
            events: {
                close: () => {
                    console.log(`Map closed, clean the objects to access.`);
                    VBW.con_two.clean(container_id);
                    VBW.rd_two.clean(container_id);
                },
            },
            auto: () => {  //run after the DOM is loaded
                //1. run 2D map
                VBW.rd_two.show(container_id);
                VBW.con_two.start(container_id, title_id);
            },
        };
        UI.show("dialog", ctx, cfg);
    },
    card: () => {
        const container_id = config.card.container;
        const title_id = config.card.title;
        const ctx = {
            title: `<div id="${title_id}">User Details</div>`,
            content: `<div class="map" id="${container_id}"></div>`,
        }
        const cfg = {
            events: {
                close: () => {
                    console.log(`User card closed.`);
                },
            },
            auto: () => {
                const player=VBW.cache.get(["env","player"]);
                console.log(player);
            },
        };
        UI.show("dialog", ctx, cfg);
    },
    news:()=>{
        const container_id = config.news.container;
        const title_id = config.news.title;
        const ctx = {
            title: `<div id="${title_id}">News</div>`,
            content: `<div class="map" id="${container_id}"></div>`,
        }
        const cfg = {
            events: {
                close: () => {
                    console.log(`News page closed.`);
                },
                show:()=>{
                    console.log(`Ready to get news via API.`);
                },
            },
            auto: () => {
                //const player=VBW.cache.get(["env","player"]);
                //console.log(player);

            },
        };
        UI.show("dialog", ctx, cfg);
    },
}

export default Pages;