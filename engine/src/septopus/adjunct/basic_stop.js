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
import Calc from "../lib/calc";

const def={
    "INDEX_OF_SIZE":            0,
    "INDEX_OF_POSITION":        1,
    "INDEX_OF_ROTATION":        2,
    "TYPE_OF_STOP":             3,
    "BODY_STOP":                1,		//stop the body
    "FOOT_STOP":                2,		//stop on foot
    "HEAD_STOP":                3,		//stop beyond header
}

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

            return blocks;
        },

        // wether in stop projection surface
        projection:  (px, py, stops)=>{
            const list = {};
            
            for (let i in stops) {
                const row= stops[i];
                const {size,position,side,block,orgin} = row;
                
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
                        const radius=0.5*size[0];
                        const center=[position[0],position[1]];     //ball center
                        const dis=Calc.distance([px,py],center);
                        //console.log(radius,dis);
                        if(dis<radius){
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
		 * @param   {number}    z	    //player stand height
		 * @param	{number}    h       //player body height
		 * @param	{number}    cap     //max height player can go cross
		 * @param	{number}    va      //player elevacation
		 * @param	{object[]}  list    //{id:stop,id:stop,...}, stop list to check
		 * 
		 * */
		relationZ:(z,h,cap,va,list)=>{
			const arr=[];
			for(let id in list){
				const row=list[id];
                const {position,size}=row;
                const zmin=position[2]-size[2]*0.5+va;
                const zmax=position[2]+size[2]*0.5+va;
                //console.log(zmin,zmax);
                //TODO, here to check BALL type stop

				if(zmin>=z+h){
                    //a.stop upon header
					arr.push({
                        stop:false,
                        way:def.HEAD_STOP,
                        index:parseInt(id)
                    });
				}else if(zmin<z+h && zmin>=z+cap){
                    //b.normal stop 
					arr.push({
                        stop:true,
                        way:def.BODY_STOP,
                        index:parseInt(id)
                    });
				}else{
                    //c.stop on foot
					const zd=zmax-z; //height to cross
					if(zd>cap){
						arr.push({
                            stop:true,
                            way:def.FOOT_STOP,
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
				const row=arr[i];
				if(row.stop==true){
					rst.stop=true;
					rst.index=row.index;
					rst.way=row.way;
					return rst;
				}
				
				if(st.delta!=undefined){
					if(max==null) max=row;
					if(row.delta>max.delta) max=row;
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
        
        //1.check wether interact with stop from top view ( in projection ).
		const [dx,dy,dz]=pos;
		const list=self.calculate.projection(dx,dy,stops);
		if(Toolbox.empty(list)) return rst;
		rst.interact=true;
        
        //console.log(list);

        //2.check position of stop;
		const cap=cfg.cap+(cfg.pre!=undefined?cfg.pre:0),h=cfg.height;
		const arr=self.calculate.relationZ(dz,h,cap,cfg.elevation,list);

        console.log(arr);
        //3.filter out the target stop for movement;
		const fs=self.calculate.filter(arr);
		rst.move=!fs.stop;
		rst.index=fs.index;
		if(fs.delta!=undefined)rst.delta=fs.delta;

		return rst;
    },
}

export default basic_stop;