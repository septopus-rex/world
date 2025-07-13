/**
 * Basic component - Trigger
 *
 * @fileoverview
 *  1. Trigger event in 3D env.
 *  2. Interact with 3D Objects.
 *
 * @author Fuu
 * @date 2025-04-23
 */

// const def={
//     "INDEX_OF_SIZE":            0,
//     "INDEX_OF_POSITION":        1,
//     "INDEX_OF_ROTATION":        2,
//     "TRIGGER_SHAPE_OPTION":     3,      //["box","ball","more"]
//     "TRIGGER_OPTION":           4,      //[""]
//     "ACTION_GROUP":             5, 
//     "CONTRACT_ID_ON_CHAIN":     6,
//     "RUN_ONE_TIME":             7,
// };

const reg={
    name:"trigger",
    category:"basic",
    desc:"Trigger of engine, for building games.",
    version:"1.0.0",
};

const events={
    in:{
        origin:["player","adjunct"],
        condition:[],
        index:0,
        action:()=>{

        },
    },
    out:{
        origin:["player","adjunct"],
        condition:[],
        index:1,
        action:()=>{

        },
    },
    hold:{
        origin:["player","adjunct"],
        condition:[],
        index:2,
        action:()=>{

        },
    },
    on:{
        origin:["player","adjunct"],
        condition:[],
        index:3,
        action:()=>{

        },
    },
    beside:{
        origin:["player","adjunct"],
        condition:[],
        index:4,
        action:()=>{

        },
    },
};

//trigger control target
//1. adjuncts;                  //including objects, lights and more
//2. player, or player basic parameters;
//3. system env;
//4. bag system

const config={
    //default: [[1.5, 0.2, 0.5], [1, 0.3, 0], [0, 0, 0], 1, 2, [ "ACTION_0", "ACTION_1"] , 4, 0],
    action:[     //action data struct
        ["CONDITIONS_TO_START"],        //check condition
        ["ACTIONS_TODO"],               //action todo format
        ["CONDITIONS_TO_ABORD"],        //condition to abord
        ["ACTIONS_RECOVER"],            //action todo after abord
    ],
    sample:{
        condition:[         //[ TYPE_OF_OBJECT, CACULATION, VALUE_NEEDED ]
            [[1,0x00a1,0,1,2],1,100], 
            [],
        ],
        todo:[              //[ TYPE_OF_OBJECT,ACTION,VALUE,]
            [[1,0x00a1,0,1,2],1,0.1],       //["SELECT_WALL_POSIOTION_Z", "ADD_DELTA", 100 ]       
            [[3,1,2],0,0.3],                //["PLAYER_ROTAIION_Z", "SET", 0.3 ]     
        ],
    },
    style:{     //trigger object in 3D scene style
        color: 0xff3298,
        opacity:0.8,
    },
}

let definition=null;       //cache adjunct definition here.
const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        def:(data)=>{
            //console.log(data);
            definition=data;
        },
    },
    attribute:{

    },
    transform:{
        raw_std: (arr, cvt) => {
            //console.log(arr);
            const rst = []
            for (let i in arr) {
                const d = arr[i], s = d[0], p = d[1], r = d[2];
                const dt = {
                    x: s[0] * cvt, y: s[1] * cvt, z: s[2] * cvt,
                    ox: p[0] * cvt, oy: p[1] * cvt, oz: p[2] * cvt,
                    rx: r[0], ry: r[1], rz: r[2],
                    type: "box",
                    event:self.decode(d[5]),           //construct event function here
                }
                rst.push(dt);
            }
            return rst;
        },
        std_3d:(stds, va)=>{
            const arr = [];
            for (let i = 0; i < stds.length; i++) {
                const row = stds[i];
                const obj = {
                    type: row.type,
                    index: i,
                    params: {
                        size: [row.x, row.y, row.z],
                        position: [row.ox, row.oy, row.oz + va],
                        rotation: [row.rx, row.ry, row.rz],
                    },
                    material:{
                        color:config.style.color,
                    },
                    hidden:true,        //whether hidden in scene
                }
                arr.push(obj);
            }
            return arr;
        },
        std_active: (stds, va, index) => {
            const ds = { stop: [], helper: [] };
            return ds;
        },
    },
    decode:(actions)=>{
        //console.log(actions);
        return actions;
    },
    getObject:()=>{

    },
}

const basic_trigger={
    hooks:self.hooks,
    transform:self.transform,  
    attribute:self.attribute,
}

export default basic_trigger;