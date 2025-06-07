/**
 * Basic component - Stop
 *
 * @fileoverview
 *  1. Stop use from move in.
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"stop",
    category:"basic",
    short:0x00b4,
    desc:"Special component to avoid move forward.",
    version:"1.0.0",
}
const config={
    default:[[1.2,1.2,1.2],[8,8,2],[0,0,0],1,2025],
    definition:{
        2025:[
            ['x','y','z'],      //0.
            ['ox','oy','oz'],   //1.
            ['rx','ry','rz'],   //2.
            'type',             //3. stop type, [1.box, 2.ball, ], box default
        ],
    },
    color:0xffffff,
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        // init:()=>{

        // },
    },
    attribute:{

    },
    transform:{
        raw_std: (arr, cvt) => {
            const rst = []
            for (let i in arr) {
                const d = arr[i], s = d[0], p = d[1], r = d[2], type = d[3];
                const dt = {
                    x: s[0] * cvt, y: s[1] * cvt, z: s[2] * cvt,
                    ox: p[0] * cvt, oy: p[1] * cvt, oz: p[2] * cvt + s[2] * cvt * 0.5,
                    rx: r[0], ry: r[1], rz: r[2],
                    type:type===1?"box":"ball",
                    stop:true,
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
                    stop:!row.stop?false:true,
                }
                if (row.animate !== null) obj.animate = row.animate;
                arr.push(obj);
            }
            return arr;
        },
        std_active:(stds,va,index)=>{
            const ds={stop:[],helper:[]};
            return ds;
        },
    },
}

const basic_stop={
    hooks:self.hooks,
    transform:self.transform,  
    attribute:self.attribute,
}

export default basic_stop;