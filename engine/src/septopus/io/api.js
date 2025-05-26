
/* 
*  Septopus API router
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.API router, manage all access to different network
*  2.mock data to test quickly.
*/

import api_solana from "./api_solana";
import api_sui from "./api_sui";
import IPFS from "../lib/ipfs";
import Toolbox from "../lib/toolbox";
import VBW from "../core/framework";

const reg = {
    name: "api",
    type: 'datasource',     //set API as datasource entry
}

const config={
    debug:true,
}

const router = {
    solana: api_solana,
    sui: api_sui,
}

const mock = {
    world: () => {
        return {
            name: "Septopus World",      //World name
            desc: "Septopus world, a virtual block world on chain.",     //Description of world
            size: [4096, 4096],           //limit of world 
            side: [16, 16],             //size of block
            accuracy: 1000,             //accuracy, 1000 as 1mm. Default data as "m"
            block: {
                size: [16, 16, 20],
                diff: 3,                //周边4块的平均高度的升高值
                status: ["raw", "public", "private", "locked"],
            },
            time: {                          //设计速度为正常的20倍，相当于现实世界1年，VBW里20年
                slot: 1000,                  //1 hour 对应的slot数量，需要计算清晰
                year: 360,                   //每年的天数
                month: 12,                   //月数
                hour: 24,                    //每天小时数
            },
            sky: {                           //天空的设置
                sun: 1,                      //太阳的数量
                moon: 3,                     //月亮的数量
            },
            weather: {
                category: ["cloud", "rain", "snow"],
                grading: 8,                  //每种气候里面的分级
            },
            address: "SOLANA_ACCOUNT_ADDRESS",      //数据合约地址
            blockheight: 1123456,                   //世界启动的slot                 
        };
    },
    block: (x, y, world) => {
        const rand = Toolbox.rand;
        return {
            x: x,
            y: y,
            world: world,
            data: [
                0.2,        //block elevation
                1,          //block status
                [
                    ["a1", [[[1.5, 0.2, rand(2, 5)], [2, 6, 0], [0, 0, 0], rand(60, 90), [1, 1], 1, [], 2025]]],
                    ["a2", [[[rand(1, 3), rand(1, 3), rand(1, 3)], [8, 8, 2], [0, 0, 0], rand(100, 300), [1, 1], 0, 2025]]],
                    ["a4", [[[rand(2, 4), rand(2, 4), rand(2, 4)], [8, 12, 0.5], [0, 0, 0], rand(1, 30), 0, 2025]]]
                ]
            ],
            owner: "SOLANA_ADDRESS",
        };
    },
    texture: (id) => {
        const arr = [
            "texture/vbw.png",
            "texture/grass.jpg",
            "texture/avatar.jpg",
            "texture/qr.png",
        ]

        return {
            index: id,
            image: arr[Toolbox.rand(0, arr.length - 1)],
            repeat: [1, 1]
        }
    },
    module: (id) => {
        return {
            index: id,
            type: ["3DS", "DAE", "FBX", "MMD"][Toolbox.rand(0, 3)],
            raw: "RAW_DATA_OF_3D_MODULE",
            params: {

            },
        }
    }
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
    getBlocks: (arr, world, ck, map) => {
        if (map === undefined) map = {};
        if (arr.length === 0){
            if(config.debug){
                return setTimeout(()=>{
                    return ck && ck(map);
                },Toolbox.rand(5000,15000));
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
}

const API = {
    /** 
     * Hooks for system register and initialization
     */
    hooks: self.hooks,

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
     * get blocks data by coordinate
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
        //0. input check
        //0.1. check limit of x,y

        //0.2.check limit of world

        //1. set loading status;
        ck && ck({loading:true});

        //2. ready to get data;

        const arr = self.getExtBlocks(x, y, ext, limit);
        return self.getBlocks(arr, world, ck);
    },

    /** 
     * get modules data by IDs
     * !important, here to implement the frontend cache for module, can get data from indexedDB
     * @param   {number[]}    IDs   //module ids.
     * @param   {function}    ck	//callback function
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
            return ck && ck(map);
        } else {
            const dt = mock.module(ids);
            return ck && ck(dt);
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
            return ck && ck(map);
        } else {
            const dt = mock.texture(ids);
            return ck && ck(dt);
        }
    },
}

export default API;