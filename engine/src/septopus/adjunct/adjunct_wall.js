/**
 * Adjunct - wall
 *
 * @fileoverview
 *  1. basic wall
 *  2. hole support in the furture
 *
 * @author Fuu
 * @date 2025-04-24
 */

const reg = {
    name: "wall",
    category: "adjunct",
    desc: "Wall with texture. Hole on it will be support soon.",
    version: "1.0.0",
}

const config = {
    color: 0xf8f8f8,        //color for pending
    grid: {                 //grid setting
        offsetX: 0.5,           //offset of X
        offsetY: 0.5,           //offset of Y
    },
    stop: {
        offset: 0.05,
        color: 0xffffff,
        opacity: 0.5,
    },
    animate: [              //support animation list
        { way: "none" },
        { way: "fadeout" },
        { way: "fadein" },
        { way: "moveup" },
    ],
}

const valid={
    x:(val,cvt,std)=>{
        console.log(val,cvt,std);
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    y:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    z:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    ox:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return n;
    },
    oy:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    oz:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    rx:(val,cvt,std)=>{

    },
    ry:(val,cvt,std)=>{

    },
    rz:(val,cvt,std)=>{

    },
    texture:(val,cvt,std)=>{

    },
    tx:(val,cvt,std)=>{

    },
    ty:(val,cvt,std)=>{

    },
    animate:(val,cvt,std)=>{

    },
    stop:(val,cvt,std)=>{

    },
}

let definition=null;       //cache adjunct definition here.
const self = {
    hooks: {
        reg: () => {
            return reg;
        },
        def:(data)=>{
            definition=data;
        },
        animate: (ms) => {

        },
    },
    
    menu: {
        pop: (std) => {
            return [
                {type:"button",label:"Info",icon:"",action:(ev)=>{
                    console.log(ev);
                }},
                {type:"button",label:"Remove",icon:"",action:(ev)=>{
                    console.log(ev);
                }},
                {type:"button",label:"Copy",icon:"",action:(ev)=>{
                    console.log(ev);
                }},
            ];
        },
        sidebar: (std) => {
            const animate_options=[
                {key:"Null",value:0},
            ];
            return {
                size:[
                    {type:"number",key:"x",value:std.x,label:"X",icon:"",desc:"X of wall",valid:(val,cvt)=>{return valid.x(val,cvt,std)}},
                    {type:"number",key:"y",value:std.y,label:"Y",icon:"",desc:"Y of wall",valid:(val,cvt)=>{return valid.y(val,cvt,std)}},
                    {type:"number",key:"z",value:std.z,label:"Z",icon:"",desc:"Z of wall",valid:(val,cvt)=>{return valid.z(val,cvt,std)}},
                ],
                position:[
                    {type:"number",key:"ox",value:std.ox,label:"X",icon:"",desc:"X of postion",valid:(val,cvt)=>{return valid.ox(val,cvt,std)}},
                    {type:"number",key:"oy",value:std.oy,label:"Y",icon:"",desc:"Y of postion",valid:(val,cvt)=>{return valid.oy(val,cvt,std)}},
                    {type:"number",key:"oz",value:std.oz,label:"Z",icon:"",desc:"Z of postion",valid:(val,cvt)=>{return valid.oz(val,cvt,std)}},
                ],
                rotation:[
                    {type:"number",key:"rx",value:std.rx,label:"X",icon:"",desc:"X of rotation",valid:(val,cvt)=>{return valid.rx(val,cvt,std)}},
                    {type:"number",key:"ry",value:std.ry,label:"Y",icon:"",desc:"Y of rotation",valid:(val,cvt)=>{return valid.ry(val,cvt,std)}},
                    {type:"number",key:"rz",value:std.rz,label:"Z",icon:"",desc:"Z of rotation",valid:(val,cvt)=>{return valid.rz(val,cvt,std)}},
                ],
                // texture:[
                //     {type:"number",key:"texture",value:row[3],label:"Texture",icon:"",desc:"Resource ID",valid:(val)=>{valid.texture(val,raw)}},
                //     {type:"number",key:"tx",value:row[4][0],label:"RepeatX",icon:"",desc:"Repeat of X",valid:(val)=>{valid.tx(val,raw)}},
                //     {type:"number",key:"ty",value:row[4][1],label:"RepeatY",icon:"",desc:"Repeat of Y",valid:(val)=>{valid.ty(val,raw)}},
                // ],
                // animation:[
                //     {type:"select",key:"animate",value:row[5],option:animate_options,label:"Animate",icon:"",desc:"Animation setting",valid:(val)=>{valid.animate(val,raw)}},
                // ],
                // stop:[
                //     {type:"bool",key:"stop",value:row[6],label:"Stop",icon:"",desc:"Auto STOP",valid:(val)=>{valid.stop(val,raw)}},
                // ],
            }
        },
    },

    attribute: {
        add: (p, raw) => {
            raw.push(self.attribute.combine(p));
            return raw;
        },
        set: (p, raw, limit) => {
            if (p.index === undefined) return false;
            const index = p.index;
            if (limit === undefined) {
                raw[index] = self.attribute.combine(p, raw[index]);
            } else {
                const pp = self.attribute.revise(p, raw[index], limit);
                raw[index] = self.attribute.combine(pp, raw[index]);
            }
            return raw;
        },
        remove: (p, raw) => {
            if (p.index === undefined) return false;
            const rst = [];
            for (let i in raw) if (i != p.index) rst.push(raw[i]);
            return rst;
        },
        combine: (p, row) => {
            const dd = row || JSON.parse(JSON.stringify(config.default));
            dd[0][0] = p.x === undefined ? dd[0][0] : p.x;
            dd[0][1] = p.y === undefined ? dd[0][1] : p.y;
            dd[0][2] = p.z === undefined ? dd[0][2] : p.z;
            dd[1][0] = p.ox === undefined ? dd[1][0] : p.ox;
            dd[1][1] = p.oy === undefined ? dd[1][1] : p.oy;
            dd[1][2] = p.oz === undefined ? dd[1][2] : p.oz;
            dd[2][0] = p.rx === undefined ? dd[2][0] : p.rx;
            dd[2][1] = p.ry === undefined ? dd[2][1] : p.ry;
            dd[2][2] = p.rz === undefined ? dd[2][2] : p.rz;
            dd[3] = p.texture === undefined ? dd[3] : p.texture;
            dd[5] = p.animate === undefined ? dd[5] : p.animate;
            return dd;
        },
        revise: (p, row, limit) => {
            const reviseSizeOffset = self.reviseSizeOffset
            if (p.x != undefined) {
                const o = row[1][0], s = limit[0], rst = reviseSizeOffset(o, p.x, s);
                p.ox = rst.offset != o ? rst.offset : p.ox;
                p.x = rst.size != p.x ? rst.size : p.x;
            }
            if (p.y != undefined) {
                const o = row[1][1], s = limit[1], rst = reviseSizeOffset(o, p.y, s);
                p.oy = rst.offset != o ? rst.offset : p.oy;
                p.y = rst.size != p.y ? rst.size : p.y;
            }
            if (p.z != undefined) {
                const o = row[1][2], s = limit[2], rst = reviseSizeOffset(o, p.z, s);
                p.oz = rst.offset != o ? rst.offset : p.oz;
                p.z = rst.size != p.y ? rst.size : p.z;
            }

            if (p.ox != undefined) {
                const w = row[0][0], s = limit[0], rst = reviseSizeOffset(p.ox, w, s);
                p.ox = rst.offset != p.ox ? rst.offset : p.ox;
                p.x = rst.size != w ? rst.size : p.x;
            }

            if (p.oy != undefined) {
                const w = row[0][1], s = limit[1], rst = reviseSizeOffset(p.oy, w, s);
                p.oy = rst.offset != p.oy ? rst.offset : p.oy;
                p.y = rst.size != w ? rst.size : p.y;
            }
            if (p.oz != undefined) {
                const w = row[0][2], s = limit[2], rst = reviseSizeOffset(p.oz, w, s);
                p.oz = rst.offset != p.oz ? rst.offset : p.oz;
                p.z = rst.size != w ? rst.size : p.z;
            }
            return p;
        },
    },
    transform: {
        raw_std: (arr, cvt) => {
            const rst = []
            for (let i in arr) {
                const d = arr[i], s = d[0], p = d[1], r = d[2], tid = d[3], rpt = d[4];
                const dt = {
                    x: s[0] * cvt, y: s[1] * cvt, z: s[2] * cvt,
                    ox: p[0] * cvt, oy: p[1] * cvt, oz: p[2] * cvt + s[2] * cvt * 0.5,
                    rx: r[0], ry: r[1], rz: r[2],
                    material: {
                        texture: tid,
                        repeat: rpt,
                        color: config.color,
                    },
                    animate: Array.isArray(d[5]) ? d[5] : null,
                    stop: !d[6] ? false : true,
                }
                rst.push(dt);
            }
            return rst;
        },
        std_3d: (stds, va) => {
            //console.log(`Wall: ${JSON.stringify(stds)}`);
            const arr = [];
            for (let i = 0; i < stds.length; i++) {
                const row = stds[i];
                const obj = {
                    type: "box",
                    index: i,
                    params: {
                        size: [row.x, row.y, row.z],
                        position: [row.ox, row.oy, row.oz + va],
                        rotation: [row.rx, row.ry, row.rz],
                    },
                    material: row.material,
                    //stop:!row.stop?false:true,
                }
                if (row.stop) {
                    obj.stop = {
                        opacity: config.stop.opacity,
                        color: !config.stop.color ? 0xfffffff : config.stop.color
                    }
                }
                if (row.animate !== null) obj.animate = row.animate;
                arr.push(obj);
            }
            return arr;
        },

        std_active: (std, va, cvt) => {
            const ds = { stop: [], helper: [] };
            const offset = config.stop.offset * cvt;
            for (let i = 0; i < std.length; i++) {
                const row = std[i];
                // if(row.stop){
                //     ds.stop.push({
                //         type: "box",
                //         params: {
                //             size: [row.x + 2*offset, row.y  + 2*offset , row.z  + 2*offset ],
                //             position: [row.ox, row.oy, row.oz + va],
                //             rotation: [row.rx, row.ry, row.rz],
                //         },
                //         orgin:{
                //             index:i,
                //             adjunct: reg.name,
                //             opacity:config.stop.opacity,
                //             color:!config.stop.color?0xfffffff:config.stop.color
                //         }
                //     });
                // }
            }
            return ds;
        },

        std_raw: (arr, cvt) => {

        },

        std_box: (obj) => {

        },
        std_2d: (arr, face) => {

        },
        active_2d: () => {

        },
    },

    reviseSizeOffset: (o, d, s) => {
        const fs = d > s ? s * 0.5 : d * .5 + o > s ? s - 0.5 * d : o < 0.5 * d ? 0.5 * d : o, sz = d > s ? s : d;
        return { offset: fs, size: sz }
    },
};

const adj_wall = {
    hooks: self.hooks,
    transform: self.transform,
    attribute: self.attribute,
    menu: self.menu,
}

export default adj_wall;