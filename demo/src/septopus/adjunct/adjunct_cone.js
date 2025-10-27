/**
 * Adjunct - cone
 *
 * @fileoverview
 *  1. cone with texture
 *  2. animation sample
 * 
 * @author Fuu
 * @date 2025-10-14
 */

const reg = {
    name: "cone",
    category: 'basic',
    desc: "Cone Geometry",
    version: "1.0.0",
    events: [],
}

const config = {
    color: 0xf3f5f6,
    stop: {
        offset: 0.05,
        color: 0xffffff,
        opacity: 0.5,
    },
}

const self={

}

const valid = {
    x: (val, cvt, std) => {
        console.log(val, cvt, std);
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },
    y: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },
    z: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },
    ox: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return n;
    },
    oy: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },
    oz: (val, cvt, std) => {
        const n = parseInt(val);
        if (isNaN(n)) return false;
        if (n <= 0) return false;
        return parseFloat(n / cvt);
    },
    rx: (val, cvt, std) => {

    },
    ry: (val, cvt, std) => {

    },
    rz: (val, cvt, std) => {

    },
}

let definition = null;       //cache adjunct definition here.
const effects = {
    rotateZ: (param) => {
        const val = !param ? 5 * Math.PI / 180 : param[0];
        return {
            name: "rotateZ",
            duration: 0,          //not set or 0, endless
            loops: 0,             //not set or 0, endless
            timeline: [
                {
                    type: "rotate",
                    mode: "add",
                    axis: "Z",
                    time: 0,                    //
                    value: val,          //when array, random | function to calculate
                }
            ],
        }
    },
};

const router = [
    effects.rotateZ,    //Animate 1
]

const hooks = {
    reg: () => {
        return reg;
    },
    def: (data) => {
        definition = data;
    },
    animate: (effect, param) => {
        const index = effect - 1;
        if (!router[index]) return false;

        if (typeof router[index] === 'function') {
            return router[index](param);
        }
        return JSON.parse(JSON.stringify(router[index]));
    },
};

const menu = {
    pop: (std) => {
        return [
            
        ];
    },
    sidebar: (std) => {
        
        return {
            
        }
    },
}

const attribute = {
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
            //const pp = self.attribute.revise(p, raw[index], limit);
            //raw[index] = self.attribute.combine(pp, raw[index]);
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
}

const transform = {
    raw_std: (arr, cvt) => {
        const rst = []
        for (let i in arr) {
            const d = arr[i], s = d[0], p = d[1], r = d[2], tid = d[3], rpt = d[4];
            const dt = {
                x: s[0] * cvt, y: s[1], z: s[2] * cvt,
                ox: p[0] * cvt, oy: p[1] * cvt, oz: p[2] * cvt,
                rx: r[0], ry: r[1], rz: r[2],  
                material: {
                    texture: tid,
                    repeat: rpt,
                    color: config.color,
                },
                stop: !d[6] ? false : true,
            }

            if (d[5] !== undefined) {
                if (Array.isArray(d[5])) {
                    dt.animate = {
                        router: d[5][0],
                        param: [...d[5].slice(1)],
                    }
                } else {
                    if (router[d[5] - 1] !== undefined) {
                        dt.animate = {
                            router: d[5],
                        }
                    }
                }
            }

            rst.push(dt);
        }
        return rst;
    },

    std_3d: (stds, va) => {
        const arr = [];
        for (let i = 0; i < stds.length; i++) {
            const row = stds[i];
            const single = {
                type: "cone",
                index: i,
                params: {
                    size: [row.x, row.y, row.z],
                    position: [row.ox, row.oy, row.oz + va],
                    rotation: [row.rx, row.ry, row.rz],
                },
                material: row.material,
                animate: row.animate,
            }

            if (row.stop) {
                single.stop = {
                    opacity: config.stop.opacity,
                    color: !config.stop.color ? 0xfffffff : config.stop.color
                }
            }
            arr.push(single);
        }
        return arr;
    },
    std_active: (stds, va, index) => {
        const ds = { stop: [], helper: [] };
        return ds;
    },


    std_raw: (arr, cvt) => {

    },

    std_box: (obj) => {

    },
    std_2d: (stds, face, faces) => {
        const objs = [];
        for (let i = 0; i < stds.length; i++) {
            const std = stds[i];
            switch (face) {
                case faces.TOP:
                    const row = {
                        type: "rectangle",
                        index: i,
                        params: {
                            size: [std.x, std.x],
                            position: [std.ox, std.oy],
                            rotation: std.rz,
                        },
                        style: {
                            fill: 0xfa3312,          //if no zero, fill the color
                            color: 0xfa0012,         //stroke color
                            opacity: 0.6,            //opacity of object
                            width: 1,                //stroke width
                        },
                    }

                    objs.push(row);
                    break;

                default:
                    break;
            }
        }
        return objs;
    },
    active_2d: () => {

    },
}
const task = {
    hide: (meshes, cfg) => {

    },
    show: (meshes, cfg) => {

    },
    router: [
        { method:"hide", gameonly:true},
        { method:"show", gameonly:true},
    ],
}

const events = {
    on:()=>{},
    beside:()=>{},
};

const adjunct_cone = {
    hooks: hooks,
    transform: transform,
    attribute: attribute,
    menu: menu,
    task: task,
    events: effects,
}

export default adjunct_cone;