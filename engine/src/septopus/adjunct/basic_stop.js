/**
 * Basic component - Stop
 *
 * @fileoverview
 *  1. Stop player from going cross.
 *  2. Support player to stand on.
 *
 * @author Fuu
 * @date 2025-04-23
 */

import Toolbox from "../lib/toolbox";
import Calc from "../lib/calc";

const reg = {
    name: "stop",
    category: "basic",
    desc: "Special component to avoid move forward.",
    version: "1.0.0",
}

const config = {
    style: {
        color: 0xffffff,
        opacity: 0.8,
    },
    stop: {
        'BODY_STOP': 1,//stop the body
        'FOOT_STOP': 2,//stop on foot
        'HEAD_STOP': 3,//stop beyond header
    },
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

const self = {
    hooks: {
        reg: () => {
            return reg;
        },
    },
    menu: {
        pop: (std) => {
            return [
                {
                    type: "button", label: "Info", icon: "", action: (ev) => {
                        console.log(ev);
                    }
                },
                {
                    type: "button", label: "Remove", icon: "", action: (ev) => {
                        console.log(ev);
                    }
                },
                {
                    type: "button", label: "Copy", icon: "", action: (ev) => {
                        console.log(ev);
                    }
                },
            ];
        },
        sidebar: (std) => {
            const animate_options = [
                { key: "Null", value: 0 },
            ];
            return {
                size: [
                    { type: "number", key: "x", value: std.x, label: "X", icon: "", desc: "X of wall", valid: (val, cvt) => { return valid.x(val, cvt, std) } },
                    { type: "number", key: "y", value: std.y, label: "Y", icon: "", desc: "Y of wall", valid: (val, cvt) => { return valid.y(val, cvt, std) } },
                    { type: "number", key: "z", value: std.z, label: "Z", icon: "", desc: "Z of wall", valid: (val, cvt) => { return valid.z(val, cvt, std) } },
                ],
                position: [
                    { type: "number", key: "ox", value: std.ox, label: "X", icon: "", desc: "X of postion", valid: (val, cvt) => { return valid.ox(val, cvt, std) } },
                    { type: "number", key: "oy", value: std.oy, label: "Y", icon: "", desc: "Y of postion", valid: (val, cvt) => { return valid.oy(val, cvt, std) } },
                    { type: "number", key: "oz", value: std.oz, label: "Z", icon: "", desc: "Z of postion", valid: (val, cvt) => { return valid.oz(val, cvt, std) } },
                ],
                rotation: [
                    { type: "number", key: "rx", value: std.rx, label: "X", icon: "", desc: "X of rotation", valid: (val, cvt) => { return valid.rx(val, cvt, std) } },
                    { type: "number", key: "ry", value: std.ry, label: "Y", icon: "", desc: "Y of rotation", valid: (val, cvt) => { return valid.ry(val, cvt, std) } },
                    { type: "number", key: "rz", value: std.rz, label: "Z", icon: "", desc: "Z of rotation", valid: (val, cvt) => { return valid.rz(val, cvt, std) } },
                ],
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
    },
    transform: {
        raw_std: (arr, cvt) => {
            const rst = []
            for (let i in arr) {
                const d = arr[i], s = d[0], p = d[1], r = d[2], type = d[3];
                const dt = {
                    x: s[0] * cvt, y: s[1] * cvt, z: s[2] * cvt,
                    ox: p[0] * cvt, oy: p[1] * cvt, oz: p[2] * cvt,
                    rx: r[0], ry: r[1], rz: r[2],
                    type: type === 1 ? "box" : "ball",
                    stop: true,
                }
                rst.push(dt);
            }
            return rst;
        },
        std_3d: (stds, va) => {
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
                }
                if (row.stop) {
                    obj.stop = {
                        opacity: config.style.opacity,
                        color: !config.style.color ? 0xfffffff : config.style.color
                    }
                }
                if (row.animate !== null) obj.animate = row.animate;
                arr.push(obj);
            }
            return arr;
        },
        std_active: (stds, va, index) => {
            const ds = { stop: [], helper: [] };
            return ds;
        },
    },
    calculate: {
        //TODO, calculate the related blocks;
        blocks: (pos, delta, x, y, side) => {
            const blocks = [[x, y]];
            const to = [
                pos[0] + delta[0],
                pos[1] + delta[1]
            ];

            return blocks;
        },

        // whether in stop projection surface
        projection: (px, py, stops) => {
            const list = {};

            for (let i in stops) {
                const row = stops[i];
                const { size, position, side, block, orgin } = row;

                switch (orgin.type) {
                    case "box":
                        const xmin = position[0] - size[0] * 0.5, xmax = position[0] + size[0] * 0.5;
                        const ymin = position[1] - size[1] * 0.5, ymax = position[1] + size[1] * 0.5;
                        //const cx=px+(block[0]-1)*side[0];
                        //const cy=py+(block[1]-1)*side[1];

                        //console.log();

                        if ((px > xmin && px < xmax) &&
                            (py > ymin && py < ymax)) {
                            list[i] = row;
                        }
                        break;

                    case "ball":
                        const radius = 0.5 * size[0];
                        const center = [position[0], position[1]];     //ball center
                        const dis = Calc.distance([px, py], center);
                        //console.log(radius,dis);
                        if (dis < radius) {
                            list[i] = row;
                        }
                        break;

                    default:
                        break;
                }

            }
            return list;
        },

        /** player Z position calculation
         * @param   {number}    stand       //player stand height
         * @param{number}    body        //player body height
         * @param{number}    cap         //max height player can go cross
         * @param{number}    elevation    //player elevacation
         * @param{object[]}  list        //{id:stop,id:stop,...}, stop list to check
         * 
         * */
        relationZ: (stand, body, cap, elevation, list) => {
            // console.log(`Basic, player stand height: ${stand}, 
            //     body height ${body}, able to cross ${cap}, elevation: ${elevation}`);
            const arr = [];
            const def = {
                "BODY_STOP": 1,  //stop the body
                "FOOT_STOP": 2,  //stop on foot
                "HEAD_STOP": 3,  //stop beyond header
            }

            for (let id in list) {
                const row = list[id];
                const { position, size } = row;
                const zmin = position[2] - size[2] * 0.5 - row.elevation;
                const zmax = position[2] + size[2] * 0.5 - row.elevation;

                //console.log(`Object[${id}], stop from ${zmin} to ${zmax}`,row);

                //TODO, here to check BALL type stop

                if (zmin >= stand + body) {
                    //a.stop upon header
                    arr.push({
                        stop: false,
                        way: def.HEAD_STOP,
                        index: parseInt(id),
                        orgin: row.orgin,
                    });
                } else if (zmin < stand + body && zmin >= stand + cap) {
                    //b.normal stop 
                    arr.push({
                        stop: true,
                        way: def.BODY_STOP,
                        index: parseInt(id),
                        orgin: row.orgin,
                    });
                } else {
                    //c.stop on foot
                    const zd = zmax - stand; //height to cross
                    if (zd > cap) {
                        arr.push({
                            stop: true,
                            way: def.FOOT_STOP,
                            index: parseInt(id),
                            orgin: row.orgin,
                        });
                    } else {
                        arr.push({
                            stop: false,
                            delta: zd,
                            index: parseInt(id),
                            orgin: row.orgin,
                        });
                    }
                }
            }
            return arr;
        },

        filter: (arr) => {
            const rst = { stop: false, index: -1 }
            let max = null;
            for (let i in arr) {
                const row = arr[i];
                if (row.stop == true) {
                    rst.stop = true;
                    rst.index = row.index;
                    rst.way = row.way;
                    rst.orgin = row.orgin;
                    return rst;
                }

                if (row.delta != undefined) {
                    if (max == null) max = row;
                    if (row.delta > max.delta) max = row;
                }
            }
            if (max != null) {
                //console.log("Max:",JSON.stringify(max));
                rst.index = max.index;
                rst.orgin = arr[max.index].orgin;
                rst.delta = max.delta;
            }
            return rst;
        },

    }
}

const basic_stop = {
    hooks: self.hooks,
    transform: self.transform,
    attribute: self.attribute,
    calculate: self.calculate,
    menu: self.menu,

    /** 
     * check whether stopped or on a stop
     * @param {number[]}   pos    - [x,y,z], check position
     * @param {object[]}   stops  - STOP[], stops nearby for checking
     * @param {object}     cfg    - {cap:0.2,height:1.8,elevation:0.6,pre:0.3}
     * @returns
     * @return {object}  - {on:[],stop:[]}
     */
    check: (pos, stops, cfg) => {
        //console.log(stops);
        const rst = { //stop result
            interact: false,     //whether on a stop
            move: true,          //whether allow to move
            index: -1            //index of stops
        }
        if (stops.length < 1) return rst;

        //1.check whether interact with stop from top view ( in projection ).
        const [dx, dy, stand] = pos;       //player position
        const list = self.calculate.projection(dx, dy, stops);
        if (Toolbox.empty(list)) return rst;
        rst.interact = true;

        //2.check position of stop;
        const cap = cfg.cap + (cfg.pre !== undefined ? cfg.pre : 0)
        const body = cfg.height;
        const arr = self.calculate.relationZ(stand, body, cap, cfg.elevation, list);

        console.log(arr);

        //3.filter out the target stop for movement;
        const fs = self.calculate.filter(arr);
        console.log(fs);
        rst.move = !fs.stop;
        rst.index = fs.index;
        if (fs.delta != undefined) rst.delta = fs.delta;
        if (fs.orgin) rst.orgin=fs.orgin;
        
        return rst;
    },
}

export default basic_stop;