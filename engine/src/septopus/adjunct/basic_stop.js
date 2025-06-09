/**
 * Basic component - Stop
 *
 * @fileoverview
 *  1. Stop use from move in.
 *
 * @author Fuu
 * @date 2025-04-23
 */

import Toolbox from "../lib/toolbox";

const reg = {
    name: "stop",
    category: "basic",
    short: 0x00b4,
    desc: "Special component to avoid move forward.",
    version: "1.0.0",
}
const config = {
    default: [[1.2, 1.2, 1.2], [8, 8, 2], [0, 0, 0], 1, 2025],
    definition: {
        2025: [
            ['x', 'y', 'z'],      //0.
            ['ox', 'oy', 'oz'],   //1.
            ['rx', 'ry', 'rz'],   //2.
            'type',             //3. stop type, [1.box, 2.ball, ], box default
        ],
    },
    style:{
        color: 0xffffff,
        opacity:0.8,
    },
    stop:{
        'BODY_STOP':1,		//stop the body
        'FOOT_STOP':2,		//stop on foot
        'HEAD_STOP':3,		//stop beyond header
	},
}

const self = {
    hooks: {
        reg: () => {
            return reg;
        },
    },
    attribute: {
        
    },
    transform: {
        raw_std: (arr, cvt) => {
            const rst = []
            for (let i in arr) {
                const d = arr[i], s = d[0], p = d[1], r = d[2], type = d[3];
                const dt = {
                    x: s[0] * cvt, y: s[1] * cvt, z: s[2] * cvt,
                    ox: p[0] * cvt, oy: p[1] * cvt, oz: p[2] * cvt + s[2] * cvt * 0.5,
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
                if(row.stop){
                    obj.stop={
                        opacity:config.style.opacity,
                        color:!config.style.color?0xfffffff:config.style.color
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
    calculate:{
        //TODO, calculate the related blocks;
        blocks: (pos, delta, x, y, side) => {
            const blocks = [[x, y]];
            const to = [
                pos[0] + delta[0],
                pos[1] + delta[1]
            ];

            //console.log(to);

            return blocks;
        },

        // wether in stop projection surface
        projection:  (px, py, stops)=>{
            const list = {};
            for (let i in stops) {
                const st = stops[i];
                const xmin = st.ox - st.x * 0.5, xmax = st.ox + st.x * 0.5;
                const ymin = st.oy - st.y * 0.5, ymax = st.oy + st.y * 0.5;
                if ((px > xmin && px < xmax) && 		//进入stop的平面投影
                    (py > ymin && py < ymax)) {
                    list[i] = st;
                }
            }
            return list;
        },
        
        /** player Z position calculation
		 * @param   {number}    z	    //player stand height
		 * @param	{number}    h       //player body height
		 * @param	{number}    cap     //max height player can go cross
		 * @param	{number}    va      //player elevacation
		 * @param	{object[]}  list    //{id:stop,id:stop,...}, stop list to check
		 * 
		 * */
		relationZ:function(z,h,cap,va,list){
			const arr=[];
			const option=config.stop;

			for(let id in list){
				const st=list[id];
				const zmin=st.oz-st.z*0.5+va,zmax=st.oz+st.z*0.5+va;

                //TODO, here to check BALL type stop

				if(zmin>=z+h){
                    //a.stop upon header
					arr.push({
                        stop:false,
                        way:option.HEAD_STOP,
                        index:parseInt(id)
                    });
				}else if(zmin<z+h && zmin>=z+cap){
                    //b.normal stop 
					arr.push({
                        stop:true,
                        way:option.BODY_STOP,
                        index:parseInt(id)
                    });
				}else{
                    //c.stop on foot
					const zd=zmax-z; //height to cross
					if(zd>cap){
						arr.push({
                            stop:true,
                            way:option.FOOT_STOP,
                            index:parseInt(id)
                        });
					}else{
						arr.push({
                            stop:false,
                            delta:zd,
                            index:parseInt(id)
                        });
					}
				}
			}
			return arr;
		},

        filter: (arr) => {
			const rst={stop:false,index:-1}
			let max=null;
			for(let i in arr){
				const st=arr[i];
				if(st.stop==true){
					rst.stop=true;
					rst.index=st.index;
					rst.way=st.way;
					return rst;
				}
				
				if(st.delta!=undefined){
					if(max==null) max=st;
					if(st.delta>max.delta) max=st;
				}
			}
			if(max!=null){
				rst.index=max.index;
				rst.delta=max.delta;
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

    /** 
     * check wether stopped or on a stop
     * @param {number[]}   pos    - [x,y,z], check position
     * @param {object[]}   stops  - STOP[], stops nearby for checking
     * @param {object}     cfg    - {cap:0.2,height:1.8,elevation:0.6,pre:0.3}
     * @returns
     * @return {object}  - {on:[],stop:[]}
     */
    check: (pos, stops, cfg) => {
        //console.log(stops);
        const rst={ //stop result
            interact:false,     //wether on a stop
            move:true,          //wether allow to move
            index:-1            //index of stops
        }		
		if(stops.length<1) return rst;
			
		const [dx,dy,dz]=pos;
		const list=self.calculate.projection(dx,dy,stops);
		if(Toolbox.empty(list)) return rst;
		rst.interact=true;
			
		const cap=cfg.cap+(cfg.pre!=undefined?cfg.pre:0),h=cfg.height;
		const arr=self.calculate.relationZ(dz,h,cap,cfg.elevation,list);
		const fs=self.calculate.filter(arr);
		rst.move=!fs.stop;
		rst.index=fs.index;
		if(fs.delta!=undefined)rst.delta=fs.delta;

		return rst;
    },
}

export default basic_stop;