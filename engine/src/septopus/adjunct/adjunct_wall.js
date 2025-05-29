/* 
*  Module wall
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-24
*  @functions
*  1.single wall
*/

const reg = {
    name: "wall",        //组件名称
    category: "adjunct",     //组件分类
    short: "a1",         //key的缩写，用于减少链上数据
    desc: "Wall with texture. Hole on it support.",
    version: "1.0.0",
}

const config = {
    default: [[1.5, 0.2, 0.5], [1, 0.3, 0], [0, 0, 0], 2, [1, 1], 0, [], 2025],       //2025为默认version
    hole: [0.5, 0.6, 0.9, 0.6, 2025],        //[ offset,width,height,windowsill,version ]
    definition: {
        2025: [
            ['x', 'y', 'z'],
            ['ox', 'oy', 'oz'],
            ['rx', 'ry', 'rz'],
            'texture_id',           //由链上合约管理，可以控制被版权问题封禁的
            ['rpx', 'rpy'],
            'animate',
            ["hole"],
        ],
    },
    color: 0xf8f8f8,        //材质加载失败的替换颜色
    grid: {					//辅助定位格栅的配置
        offsetX: 0.5,		//相对x轴的偏移
        offsetY: 0.5,		//相对y轴的偏移
    },
    animate: [               //支持的动画效果
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
            //console.log(p,raw,limit);
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
                    //stop:d[6],
                }
                rst.push(dt);
            }
            return rst;
        },

        //std中间体，转换成3D需要的object
        std_3d: (stds, va) => {
            //console.log(`Wall: ${JSON.stringify(stds)}`);
            const arr = [];
            for (let i = 0; i < stds.length; i++) {
                const row = stds[i];
                const three = {
                    type: "box",
                    index: i,
                    params: {
                        size: [row.x, row.y, row.z],
                        position: [row.ox, row.oy, row.oz + va],
                        rotation: [row.rx, row.ry, row.rz],
                    },
                    material: row.material,
                }
                if (row.animate !== null) three.animate = row.animate;
                arr.push(three);
            }
            return arr;
        },


        //3D高亮时候，需要的3D的object
        std_active: (std, va) => {
            const ds = { stop: [], helper: [] };
            return ds;
        },

        std_raw: (arr, cvt) => {

        },

        std_box: (obj) => {

        },

        //std中间体，转换成2D需要的数据
        std_2d: (arr, face) => {

        },



        //2D高亮时候，需要的2D的object
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