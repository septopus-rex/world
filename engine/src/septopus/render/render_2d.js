/**
 * Render - 2D Render
 *
 * @fileoverview
 *  1. 2D render from `STD` data
 *
 * @author Fuu
 * @date 2025-04-23
 */

import VBW from "../core/framework";
import Toolbox from "../lib/toolbox";
import TwoObject from "../lib/two";

const reg = {
    name: "rd_two",
    type: 'render',
}

const config = {
    background: "#eeeeee",
    scale: {
        limit:[20,50],   //scale limit
        range: 18,      //scale to show range
        detail: 30,     //scale to show details
        detailKey:"detail", 
    },
    canvas: {
        id: "canvas_2d",
    },
    limit: {
        max: 100,     //max scale
        min: 1,      //min scale
    },
    fov: 50,        //3D fov setting
}

const env = {
    pen: null,
    scale: 15,          //scale, more big more details
    offset: [0, 0],     //offset of whole world
    size: [0, 0],       //canvas size as meter
    side: [0, 0],       //block side
    limit: null,        //block number limit
    height: 100,        //canvas height
    width: 100,         //canvas width
    density: 0.21,      // px/meter,
    ratio: 1,           // for apple device, screen ratio
    convert: 1,         //system convert 
    player: null,       //link to player
    selected: [0, 0],   //selected block
    special:{           //special drawing area

    },
};

const test = {
    rectangle: (pen) => {
        pen.lineWidth = 2;
        pen.strokeStyle = '#FF0000';
        pen.beginPath();
        pen.moveTo(100, 100);
        pen.lineTo(100, 300);
        pen.lineTo(250, 300);
        pen.lineTo(250, 100);
        pen.closePath();
        pen.stroke();
    },
};

const self = {
    hooks: {
        reg: () => { return reg },
    },
    drawing:{
        add:(name,arr)=>{
            if(env.special[name]===undefined) env.special[name]={};
            if(env.special[name].data===undefined){
                env.special[name].data=arr;
            }else{
                env.special[name].data= env.special[name].data.concat(arr);
            }
            env.special[name].show=true;
        },
        exsist:(name)=>{
            if(env.special[name]===undefined) return false;
            return true;
        },
        remove:(name)=>{
            delete env.special[name];
        },
        hide:(name)=>{
            if(!env.special[name]) return false;
            env.special[name].show=false;
        },
        show:(name)=>{
            if(!env.special[name]) return false;
            env.special[name].show=true;
        },
    },
    getDom: (data) => {
        const parser = new DOMParser();
        return parser.parseFromString(data, 'text/html');
    },
    getSide: () => {
        return VBW.cache.get(["env", "world", "side"]);
    },
    getBlock:(pos)=>{
        const pCtoB = TwoObject.calculate.point.c2b;
        const point = pCtoB(pos, env.scale, env.offset, env.density, env.ratio);
        const x = Math.ceil(point[0] / env.side[0]);
        const y = Math.ceil(point[1] / env.side[1]);
        return [x,y];
    },
    construct: (dom_id) => {
        let cvs = document.getElementById(config.canvas.id);
        if (cvs === null) {
            const el = document.getElementById(dom_id);
            const width = el.clientWidth, height = el.clientHeight;
            env.width = width;
            env.height = height;
            env.ratio = window.devicePixelRatio;

            const ctx = `<canvas 
                id="${config.canvas.id}" 
                class="" 
                width="${width * env.ratio}" height="${height * env.ratio}"
                style="width:${width}px;height:${height}px"
            ></canvas>`;
            const doc = self.getDom(ctx);
            el.appendChild(doc.body.firstChild);

            cvs = document.getElementById(config.canvas.id);
        }
        //set pen, ready to render
        env.pen = cvs.getContext("2d");
        //test.rectangle(env.pen);
    },
    offset: (ax, ay, bx, by) => {
        return [ax - 0.5 * bx, ay - 0.5 * by];
    },
    start: () => {
        const [x, y] = env.player.location.block;
        const side = env.side[0];
        const disCtoB = TwoObject.calculate.distance.c2b;
        const rotation = 0;
        const bx = disCtoB(env.width, rotation, env.scale, env.ratio, env.density);
        const by = disCtoB(env.height, rotation, env.scale, env.ratio, env.density);
        const ax = (x - 0.5) * side;
        const ay = (y - 0.5) * side;

        env.offset = self.offset(ax, ay, bx, by);
        env.size = [bx, by];
        return true;
    },
    clean: () => {
        TwoObject.drawing.clean(env, config.background);
    },
    grid: () => {
        const s = env.side[0], mx = env.limit[0] * s, my = env.limit[1] * s;
        const x = env.offset[0], y = env.offset[1], xw = env.size[0], yw = env.size[1];

        const xs = x < 0 ? 0 : (x - x % s);
        const ys = y < 0 ? 0 : (y - y % s);
        const xe = x + xw > mx ? mx : x + xw;
        const ye = y + yw > my ? my : y + yw;
        const xn = (x + xw) > mx ? Math.ceil((mx - xs) / s + 1) : Math.ceil((x + xw - xs) / s);
        const yn = (y + yw) > my ? Math.ceil((my - ys) / s + 1) : Math.ceil((y + yw - ys) / s);
        const cfg = { width: 1, color: "#888888", anticlock: true }
        const line = TwoObject.drawing.line;

        let ystep = ys
        for (let i = 0; i < yn; i++) {
            const pa = [xs, ystep], pb = [xe, ystep];
            line(env, [pa, pb], cfg);
            ystep += s;
        }

        let xstep = xs
        for (let i = 0; i < xn; i++) {//绘制竖线
            const pa = [xstep, ys], pb = [xstep, ye];
            line(env, [pa, pb], cfg);
            xstep += s;
        }
    },
    block: (x, y, cfg) => {
        //const wd=me.core.world,s=wd.sideLength,env=run[target];
        const s = env.side[0];
        const ps = [[(x - 1) * s, (y - 1) * s], [(x - 1) * s, y * s], [x * s, y * s], [x * s, (y - 1) * s]];
        //console.log(JSON.stringify(ps));
        //console.log(cfg,env.selected)
        TwoObject.drawing.fill(env, ps, cfg);
    },
    active: () => {
        const [x, y] = env.selected;
        if (x > 0 && y > 0) {
            self.block(x, y, { width: 1, color: '#00CCBB', anticlock: true });
        }
        const [px, py] = env.player.location.block;
        self.block(px, py, { width: 1, color: '#99CCBB', anticlock: true });
        //self.block(px+2,py+2,{width:1,color:'#00CCDD',anticlock:true})
    },

    avatar: () => {
        const player = env.player.location;
        const [x, y] = player.block;
        const pos = player.position;
        const ro = player.rotation;
        const s = env.side[0];
        const hf = Math.PI * config.fov / 360, rz = - ro[2], r = s, zj = Math.PI / 2

        const cen = [(x - 1) * s + pos[0], (y - 1) * s + pos[1]];
        const p = { center: cen, start: -rz - hf - zj, end: -rz + hf - zj, radius: r }
        const grad = [
            [0.2, '#666666'],
            [1, '#FFFFFF'],
        ];
        const cfg = { width: 1, color: "#FF99CC", anticlock: true, grad: grad, alpha: 0.3 };
        TwoObject.drawing.sector(env, p, cfg);
    },

    //drawing special
    //{type:"",points:[[x,y],[x,y]],fill:false,style:{width:2,fill:'#FF0000',stoke:"#FF0000"}}
    special:()=>{
        //console.log(`Drawing special...`);
        const dwg=TwoObject.show;
        const state_2d={
            scale:env.scale,
            offset:env.offset, 
            height:env.height, 
            density:env.density, 
            ratio:env.ratio,
        }
        for(let name in env.special){
            const sp=env.special[name];
            if(!sp.show) continue;

            
            dwg(env.pen,state_2d,sp.data,(done)=>{

            });
        }
    },
    render: (force) => {
        if (force) self.start();
        //console.log(JSON.stringify(env));
        self.clean();               //clean canvas;
        self.grid();                //drawing block grid;
        self.active();              //fill active block;
        self.special();             //drawing sepcial object;
        self.avatar();              //drawing player;
    },

    cvsMove: (dx, dy) => {
        env.offset[0] -= dx;
        env.offset[1] += dy;
    },
    cvsScale: (dx, dy, ds) => {
        //console.log(`Scale value: ${ds}`);

        env.offset[0] -= dx;
        env.offset[1] += dy;
        env.scale += parseFloat(ds);

        //2. reset size of drawing area
        const disCtoB = TwoObject.calculate.distance.c2b;
        const rotation = 0;
        const bx = disCtoB(env.width, rotation, env.scale, env.ratio, env.density);
        const by = disCtoB(env.height, rotation, env.scale, env.ratio, env.density);
        env.size=[bx,by];

        //3.check wether show details.
        const key=config.scale.detailKey;
        if(env.scale>=config.scale.detail){
            self.loadDetails(key,(errors)=>{
                //console.log(`Load errors:`,errors);
                //if(errors.length!==0) console.log(errors);
                self.drawing.show(key);
                self.render();
            });
        }else{
            self.drawing.hide(key);
            self.render();
        }
        return env.scale;
    },
    structTop:(x,y,world,dom_id)=>{
        const key = `${x}_${y}`;
        const two_chain = ["block", dom_id, world, key, "two"];
        if(VBW.cache.exsist(two_chain)) return true;

        const std_chain = ["block", dom_id, world, key, "std"];
        const bk=VBW.cache.get(std_chain);
        const def=VBW.cache.get(["def","common"]);
        const faces={
            TOP:def.FACE_TOP,
            BOTTOM:def.FACE_BOTTOM,
            FRONT:def.FACE_FRONT,
            BACK:def.FACE_BACK,
            LEFT:def.FACE_LEFT,
            RIGHT:def.FACE_RIGHT,
        }
        const result={}

        //1. get the 2D STD data from adjunct
        for(let adj in bk){
            const data=bk[adj];
            if(!VBW[adj] || !VBW[adj].transform || !VBW[adj].transform.std_2d) continue;
            if(!result[adj]) result[adj]={};
            const two = VBW[adj].transform.std_2d(data,faces.TOP,faces);
            result[adj][`face_${faces.TOP}`] = two;
        }
        VBW.cache.set(two_chain,result);
        return true;
    },
    loadDetails:(key,ck,force)=>{
        if(self.drawing.exsist(key)) return ck && ck();

        self.drawing.remove(key);

        const errors=[];
        const dom_id=VBW.cache.get(["active","current"]);
        const {player,limit} = env;
        const {block,extend,world} = player.location;
        const [x,y]=block;
        const def=VBW.cache.get(["def","common"]);
        const side=self.getSide();

        const fun=self.structTop;
        const get=TwoObject.get;

        for (let i = - extend; i < extend + 1; i++) {
            for (let j = - extend; j < extend + 1; j++) {
                const cx = x + i, cy = y + j
                if (cx < 1 || cy < 1) continue;
                if (cx > limit[0] || cy > limit[1]) continue;

                //1. construct 2D data and attach to "two" key
                fun(cx,cy,world,dom_id);

                //2. calculate the special objects
                //2.1. check wether data structed.
                const d_chain=["block",dom_id,world,`${cx}_${cy}`,"two"];
                const dt=VBW.cache.get(d_chain);
                if(dt.error) continue;

                const final=[];
                for(let k in dt){
                    const list=dt[k][`face_${def.FACE_TOP}`];
                    for(let i=0;i<list.length;i++){
                        const row=list[i];
                        const cfg=row.more===undefined?{}:row.more;

                        //console.log(`Before:`,JSON.stringify(row.params));
                        if(row.params.position){
                            row.params.position[0]=(cx-1)*side[0]+ row.params.position[0];
                            row.params.position[1]=(cy-1)*side[1]+ row.params.position[1];
                        }

                        const fmt=get(row.type,row.params,row.style,cfg);
                        //console.log(`Final:`,JSON.stringify(fmt));
                        if(fmt.error){
                            errors.push(fmt);
                        }else{
                            final.push(fmt);
                        }
                    }
                }
                self.drawing.add(key,final);
            }
        }
        return ck && ck(errors);
    },
};

const renderer = {
    hooks: self.hooks,

    //function for more drawing
    drawing:self.drawing,

    //function for 2D controller
    control: {
        update:self.render,

        status:()=>{
            return {
                selected:Toolbox.clone(env.selected),
                scale:env.scale,
            }
        },
        limit:()=>{
            return Toolbox.clone(config.scale.limit);
        },
        scale: (cx, cy, rate) => {
            //1.do scale
            const pCtoB = TwoObject.calculate.distance.c2b;
            const rotation = 0;
            const dx = pCtoB(cx, rotation, env.scale, env.ratio, env.density);
            const dy = pCtoB(cy, rotation, env.scale, env.ratio, env.density);
            const cs = (rate - 1) * env.scale;
            const n= self.cvsScale(dx, dy, cs);
            return n;
        },

        target:(scale)=>{
            console.log(scale,env.scale);
            const rate=scale/env.scale;
            const dx= -env.size[0]*(rate-1)*0.5;
            const dy= env.size[1]*(rate-1)*0.5;
            const cs = (rate - 1) * env.scale;
            const n= self.cvsScale(dx,dy,cs);
            return n;
        },

        rate:(rate)=>{
            const cs = (rate - 1) * env.scale;
            const dx= -env.size[0]*(rate-1)*0.5;
            const dy= env.size[1]*(rate-1)*0.5;
            const n= self.cvsScale(dx,dy,cs);
            return n;
        },
        
        move: (cx, cy) => {
            const pCtoB = TwoObject.calculate.distance.c2b;
            const rotation = 0;
            const dx = pCtoB(cx, rotation, env.scale, env.ratio, env.density);
            const dy = pCtoB(cy, rotation, env.scale, env.ratio, env.density);
            self.cvsMove(dx, dy);
            self.render();
        },

        select: (pos, cfg) => {
            const block=self.getBlock(pos);
            const [x,y]=block;
            self.render();
            self.block(x, y, cfg);
            env.selected=[x,y];
            return block;
        },
    },

    /** clean 2D DOMs and selected block
     * @functions
     * 1. remove DOM
     * 2. clean selection of block
     * @param {string}      dom_id  - container DOM id
     * @return void
     * */
    clean: (dom_id) => {
        //1.remove DOMs
        const el = document.getElementById(dom_id);
        el.innerHTML = "";
        env.pen = null;

        //2.clean selected
        env.selected=[];
    },

    /** 2D renderer entry to fresh scene
     * @functions
     * 1. set env of 2D drawing.
     * 2. start to render.
     * @param   {string}    dom_id      - container DOM id
     * */
    show: (dom_id) => {
        if (env.pen === null) {
            env.player = VBW.cache.get(["env", "player"]);
            const cvt = VBW.cache.get(["env", "world", "accuracy"]);
            const side = VBW.cache.get(["env", "world", "side"]);
            env.convert = cvt;
            env.side = [side[0] / cvt, side[1] / cvt];

            self.construct(dom_id);
            self.start();
        }

        if(env.limit===null){
            env.limit=VBW.cache.get(["env","world","common","world","range"]);
        } 
        self.render();
    },
}

export default renderer;