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
    short: 0x00a1,
    desc: "Wall with texture. Hole on it support.",
    version: "1.0.0",
}

const config = {
    default: [[1.5, 0.2, 0.5], [1, 0.3, 0], [0, 0, 0], 2, [1, 1], 0, 1,[], 2025],
    hole: [0.5, 0.6, 0.9, 0.6, 2025],        //[ offset,width,height,windowsill,version ]
    definition: {
        2025: [
            ['x', 'y', 'z'],        //0.
            ['ox', 'oy', 'oz'],     //1.
            ['rx', 'ry', 'rz'],     //2.
            'texture_id',           //3.
            ['rpx', 'rpy'],         //4.
            'animate',              //5.
            'stop',                 //6.wether stop
            ["hole"],               //7.hole arr
        ],
    },
    color: 0xf8f8f8,        //color for pending
    grid: {					//grid setting
        offsetX: 0.5,		//offset of X
        offsetY: 0.5,		//offset of Y
    },
    animate: [              //support animation list
        { way: "fadeout" },
        { way: "fadein" },
        { way: "moveup" },
    ],
}

const self = {
    hooks: {
        reg: () => {
            return reg;
        },
        task: () => {
            console.log(`wall task here.`);
        },
        animate: (ms) => {

        },
    },
    reviseSizeOffset: (o, d, s) => {
        const fs = d > s ? s * 0.5 : d * .5 + o > s ? s - 0.5 * d : o < 0.5 * d ? 0.5 * d : o, sz = d > s ? s : d;
        return { offset: fs, size: sz }
    },

    attribute: {
        add: (p,raw) => {
            raw.push(self.attribute.combine(p));
			return raw;
        },
        set: (p,raw,limit) => {
            if(p.index===undefined) return false;
			const index=p.index;
            if(limit===undefined){
                raw[index]=self.attribute.combine(p,raw[index]);
            }else{
                const pp=self.attribute.revise(p,raw[index],limit);
                raw[index]=self.attribute.combine(pp,raw[index]);
            }
			return raw;
        },
        remove: (p,raw) => {
            if(p.index===undefined) return false;
			const rst=[];
			for(let i in raw)if(i!=p.index)rst.push(raw[i]);
			return rst;
        },
        combine: (p,row) => {
            const dd=row || JSON.parse(JSON.stringify(config.default));
			dd[0][0]=p.x===undefined?dd[0][0]:p.x;
			dd[0][1]=p.y===undefined?dd[0][1]:p.y;
			dd[0][2]=p.z===undefined?dd[0][2]:p.z;
			dd[1][0]=p.ox===undefined?dd[1][0]:p.ox;
			dd[1][1]=p.oy===undefined?dd[1][1]:p.oy;
			dd[1][2]=p.oz===undefined?dd[1][2]:p.oz;
			dd[2][0]=p.rx===undefined?dd[2][0]:p.rx;
			dd[2][1]=p.ry===undefined?dd[2][1]:p.ry;
			dd[2][2]=p.rz===undefined?dd[2][2]:p.rz;
			dd[3]=p.texture===undefined?dd[3]:p.texture;
			dd[5]=p.animate===undefined?dd[5]:p.animate;
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
                    stop:!d[6]?false:true,
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
                    stop:!row.stop?false:true,
                    // stop:{
                    //     exsist:!row.stop?false:true,
                    //     type:1,
                    // }
                }
                if (row.animate !== null) obj.animate = row.animate;
                arr.push(obj);
            }
            return arr;
        },

        std_active: (std, va) => {
            const ds = { stop: [], helper: [] };
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

};

const adj_wall = {
    hooks: self.hooks,               //注册的hook部分，供主动调用
    transform: self.transform,
    attribute: self.attribute,
    animate: {

    },

    //数据属性处理


    //显示操作菜单
    menu: {

    },

    //控制响应
    control: {
        swipe: () => {

        },
    },
}

export default adj_wall;