/**
 * IO - API Router
 *
 * @fileoverview
 *  1.API router, manage all access to different network
 *  2.mock data to test quickly.
 *  3.events support and mock.
 *
 * @author Fuu
 * @date 2025-04-29
 */

import api_bitcoin from "./api_bitcoin";
import api_solana from "./api_solana";
import api_sui from "./api_sui";

import Toolbox from "../lib/toolbox";
import VBW from "../core/framework";
import mock from "./mock";

const reg = {
    name: "api",
    type: 'datasource',     //set API as datasource entry
}

const config={
    debug:true,
}


const router = {
    bitcoin:api_bitcoin,
    solana: api_solana,
    sui: api_sui,
}

//Events queue
let listener=null;
const events={
    height:{},      //block height change event
    price:{},       //price change event
    block:{},       //block data update event
    world:{},       //world update event
}


const self = {
    hooks: {
        reg: () => {
            return reg;
        },
        init: () => {
            return {
                chain: ["env", "api"],
                value: {
                    network: "solana",
                    loading: false,
                }
            };
        },
    },
    getExtBlocks: (x, y, ext, limit) => {
        const arr = [];
        for (let i = -ext; i < ext + 1; i++) {
            for (let j = -ext; j < ext + 1; j++) {
                const cx = x + i, cy = y + j
                if (cx < 1 || cy < 1) continue;
                if (cx > limit[0] || cy > limit[1]) continue;
                arr.push([cx, cy]);
            }
        }
        return arr;
    },
    getHolder:(arr,world)=>{
        const map={};
        for(let i=0;i<arr.length;i++){
            const [x,y]=arr[i];
            const key = `${x}_${y}`;
            map[key]={
                x:x,
                y:y,
                world:world,
                data:VBW.block.format(),
                owner:"DEFAULT_DATA_NO_OWNER",
                loading:true,
            }
        }
        return map;
    },
    getBlocks: (arr, world, ck, map) => {
        if (map === undefined)  map = {};
        if (arr.length === 0){
            if(config.debug){
                //return ck && ck(map);
                return setTimeout(()=>{
                    return ck && ck(map);
                },Toolbox.rand(1000,3000));
            }
            return ck && ck(map);
        } 

        if(config.debug){
            const [x, y] = arr.pop();
            const key = `${x}_${y}`;
            map[key] = mock.block(x, y, world);
            return self.getBlocks(arr, world, ck, map);
        }

        const [x, y] = arr.pop();
        const key = `${x}_${y}`;
        map[key] ={};
        return self.getBlocks(arr, world, ck, map);
    },

    listenerStart:()=>{
        console.log(`Listener start...`);
        for(let network in router){
            if(!router[network] ||!router[network].hooks || !router[network].hooks.auto){
                console.error(`${network} API not support auto bind.`);
                continue;
            }
            router[network].hooks.auto(self.dispose);
        }
    },
    //dispose function to send the subscribe data to component
    dispose:(data)=>{
        if(!data.event || !events[data.event]) return console.error(`Invalid event data.`,data);

        for(let name in events[data.event]){
            const agent=events[data.event][name];
            agent(data);
        }
    },
}

const contract={
    set:(reqs)=>{
        contract.instructions=reqs;       // attatch to contract directly
        return true;
    },

    call:async (method,params)=>{
        if(!contract.instructions || !contract.instructions[method]) return {error:`No such method "${method}"`}
        return await contract.instructions[method](...params);
    },
}

const API = {
    /** 
     * Hooks for system register and initialization
     */
    hooks: self.hooks,

    /** 
     * Contract calls for system
     */
    contract:contract,

    /** 
     * get single world setting
     * !important no need to fresh dynamic, wait the data back then rebuild the world
     * @param {number}      index   - world index
     * @param {function}    ck      -callback function
     * @returns
     * @return {object}  - world setting
     */
    world: (index, ck, cfg) => {
        if(config.debug) return ck && ck(mock.world());

        const data={};
        return ck && ck(data);
    },

    /** 
     * get blocks data by coordination
     * !important, here to solve the delay of network.
     * !important, set tag first, the system will check the result then rebuild all data
     * !important, here to implement the frontend cache, can get data from indexedDB
     * @param {number}      x       - coordinate X
     * @param {number}      y       - coordinate y
     * @param {number}      world   - world index
     * @param {function}    ck      - callback function
     * @param {number[]}    limit   - [ X_MAX,Y_MAX ], world size limit
     * @returns 
     * object key(`${x}_${y}`) --> BLOCK_DATA
     */
    view: (x, y, ext, world, ck, limit) => {
        //console.log(x, y, ext, world, limit);
        //0. input check
        //0.1. check limit of x,y

        //0.2.check limit of world

        const arr = self.getExtBlocks(x, y, ext, limit);
        const holder=self.getHolder(arr,world);
        holder.loaded=false;
        ck && ck(holder);        //callback holder

        return self.getBlocks(arr, world, (map)=>{
            map.loaded=true;
            return ck && ck(map);       //got data successful, callbackf
        });
    },

    /** 
     * get modules data by IDs
     * !important, here to implement the frontend cache for module, can get data from indexedDB
     * @param   {number[]}    IDs   //module ids.
     * @param   {function}    ck    //callback function
     * @returns 
     * @return {object} key(`${id}`) --> MODULE_DATA
     */
    module: (ids, ck, cfg) => {
        if (Array.isArray(ids)) {
            const map = {};
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                const dt = mock.module(id);
                map[id] = dt;
            }
            if(config.debug){
                setTimeout(()=>{
                    return ck && ck(map);
                },Toolbox.rand(100,300));
            }else{
                return ck && ck(map);
            }
        } else {
            const dt = mock.module(ids);
            if(config.debug){
                setTimeout(()=>{
                    return ck && ck(dt);
                },Toolbox.rand(100,300));
            }else{
                return ck && ck(dt);
            }
        }
    },

    /** 
     * get texture data by IDs
     * !important, here to implement the frontend cache for texture, can get data from indexedDB
     * @public
     * @param {number[]}    ids     //module ids.
     * @param {function}    ck      //callback function
     * @returns
     * @return {object}  key(`${id}`) --> TEXTURE_DATA
     */
    texture: (ids, ck, cfg) => {
        if (Array.isArray(ids)) {
            const map = {};
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                const dt = mock.texture(id);
                map[id] = dt;
            }
            if(config.debug){
                setTimeout(()=>{
                    return ck && ck(map);
                },Toolbox.rand(100,300));
            }else{
                return ck && ck(map);
            }
            
        } else {
            const dt = mock.texture(ids);
            if(config.debug){
                setTimeout(()=>{
                    return ck && ck(dt);
                },Toolbox.rand(100,300));
            }else{
                return ck && ck(dt);
            }
        }
    },
    /**
     * Set listener of events.
     * 
    */
    bind:(event,key,fun)=>{
        if(!events[event]) return {error:`"${event}" is not support yet.`}
        if(listener===null){
            self.listenerStart();
        }
        events[event][key]=fun;
    },

    /**
     * Remove listener of events.
     * 
    */
    unbind:(event,key)=>{
        if(!events[event]) return {error:`Invalid event.`};
        delete events[event][key];
        return true;
    },
    
}

export default API;