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
    },
    manual:{
        container: "man_container",
        title: "man_title",
    },
    system:{
        container: "sys_container",
        title: "sys_title",
    },
    world:{
        container: "wd_container",
        title: "wd_title",
    },
    setting:{
        container: "setting_container",
        title: "setting_title",
    },
}

const self={
    getDom:(data)=>{
        const parser = new DOMParser();
        return  parser.parseFromString(data, 'text/html');
    },
    getCameraHeight:()=>{
        const dom_id=VBW.cache.get(["active","current"]);
        const camera=VBW.cache.get(["active","containers",dom_id,"camera"]);
        console.log(camera);
        return camera.position.y;
    },

    formatPlayer:(player)=>{
        let table=`<table><thead></thead><tbody>`;
        table+=`<tr><td>Account</td><td>${player.address} </td><tr>`;
        table+=`<tr><td>Block</td><td>${JSON.stringify(player.location.block)}</td><tr>`;
        table+=`<tr><td>Position</td><td>${JSON.stringify(player.location.position)}</td><tr>`;
        table+=`<tr><td>Rotation</td><td>${JSON.stringify(player.location.rotation)}</td><tr>`;
        table+=`<tr><td>Stand</td><td>${JSON.stringify(player.location.stop)}</td><tr>`;
        table+=`<tr><td>Capacity</td><td><tr>`;
        table+=`<tr><td>Move Speed</td><td>${player.capacity.move}</td><tr>`;
        table+=`<tr><td>Rotate Speed</td><td>${player.capacity.rotate}</td><tr>`;
        table+=`<tr><td>Span Height</td><td>${player.capacity.span}</td><tr>`;
        table+=`<tr><td>Squat Height</td><td>${player.capacity.squat}</td><tr>`;
        table+=`<tr><td>Jump Height</td><td>${player.capacity.jump}</td><tr>`;
        table+=`<tr><td>Death Height</td><td>${player.capacity.death}</td><tr>`;
        table+=`<tr><td>Strength Rate</td><td>${player.capacity.strength}</td><tr>`;
        table+=`<tr><td>Camera</td><td><tr>`;
        table+=`<tr><td>Z height</td><td>${self.getCameraHeight()}</td><tr>`;
        table+=`</tbody><table>`;
        return self.getDom(table);
    },
};


const Pages = {
    //2D map
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
    //User details
    card: () => {
        const container_id = config.card.container;
        const title_id = config.card.title;
        const ctx = {
            title: `<div id="${title_id}">User Details & Setting</div>`,
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
                //console.log(player);
                const el=document.getElementById(container_id);
                const dom=self.formatPlayer(player);
                el.appendChild(dom.firstChild);
            },
        };
        UI.show("dialog", ctx, cfg);
    },
    //news page of Septopus World
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
    //manual page to help player understand the conception of Septopus World
    manual:()=>{
        const container_id = config.manual.container;
        const title_id = config.manual.title;
        const ctx = {
            title: `<div id="${title_id}">Manual</div>`,
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

            },
        };
        UI.show("dialog", ctx, cfg);
    },
    //system information, such as time, weather ...
    system:()=>{
        const container_id = config.system.container;
        const title_id = config.system.title;
        const ctx = {
            title: `<div id="${title_id}">System Details</div>`,
            content: `<div class="map" id="${container_id}"></div>`,
        }
        const cfg = {
            events: {
                close: () => {
                    console.log(`System page closed.`);
                },
                show:()=>{
                    console.log(`Get system details.`);
                },
            },
            auto: () => {

            },
        };
        UI.show("dialog", ctx, cfg);
    },
    //world details, about the size, limit, owner, adjunts ...
    world:()=>{
        const container_id = config.world.container;
        const title_id = config.world.title;
        const ctx = {
            title: `<div id="${title_id}">World Details</div>`,
            content: `<div class="map" id="${container_id}"></div>`,
        }
        const cfg = {
            events: {
                close: () => {
                    console.log(`World page closed.`);
                },
                show:()=>{
                    console.log(`Get world details.`);
                },
            },
            auto: () => {

            },
        };
        UI.show("dialog", ctx, cfg);
    },
    //setting page
    setting:()=>{
        const container_id = config.system.container;
        const title_id = config.system.title;
        const ctx = {
            title: `<div id="${title_id}">System Setting</div>`,
            content: `<div class="map" id="${container_id}"></div>`,
        }
        const cfg = {
            events: {
                close: () => {
                    console.log(`Setting page closed.`);
                },
                show:()=>{
                    console.log(`Get setting details.`);
                },
            },
            auto: () => {

            },
        };
        UI.show("dialog", ctx, cfg);
    },
}

export default Pages;