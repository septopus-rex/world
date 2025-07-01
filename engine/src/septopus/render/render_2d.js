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
import TwoObject from "../lib/two";

const reg = {
    name: "rd_two",
    type: 'render',
}

const config = {
    background: "#eeeeee",
    scale: {
        range: 18,       //scale to show range
        detail: 8,       //scale to show details
    },
    canvas: {
        id: "canvas_2d",
    },
    limit: {
        max: 30,     //max scale
        min: 1,      //min scale
    },
    fov: 50,        //3D fov setting
}

const env = {
    pen: null,
    scale: 20,            //scale, more big more details
    offset: [0, 0],       //
    size: [0, 0],         //canvas size as meter
    side: [0, 0],         //block side
    limit: [4096, 4096],   //block number limit
    height: 100,         //canvas height
    width: 100,          //canvas width
    density: 0.21,       // px/meter,
    ratio: 1,            // for apple device, screen ratio
    convert: 1,          //system convert 
    player: null,        //link to player
    selected: [0, 0],      //selected block
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
        // init:()=>{

        // },
    },
    getDom: (data) => {
        const parser = new DOMParser();
        return parser.parseFromString(data, 'text/html');
    },
    getSide: () => {
        return VBW.cache.get(["env", "world", "side"]);
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
    detail: () => {

    },
    avatar: () => {
        const player = env.player.location;
        const [x, y] = player.block;
        const pos = player.position;
        const ro = player.rotation;
        const s = env.side[0];
        const hf = Math.PI * config.fov / 360, rz = ro[1], r = s, zj = Math.PI / 2

        const cen = [(x - 1) * s + pos[0], (y - 1) * s + pos[1]];
        const p = { center: cen, start: -rz - hf - zj, end: -rz + hf - zj, radius: r }
        const grad = [
            [0.2, '#666666'],
            [1, '#FFFFFF'],
        ];
        const cfg = { width: 1, color: "#FF99CC", anticlock: true, grad: grad, alpha: 0.3 };
        TwoObject.drawing.sector(env, p, cfg);

        // const pp={center:cen,start:0,end:Math.PI+Math.PI,radius:1};
        // const pcfg={width:1,color:"#FF9999",anticlock:true};
        // TwoObject.drawing.arc(env,pp,pcfg);
    },
    render: (force) => {
        if (force) self.start();
        self.clean();               //clean canvas;
        self.grid();                //drawing block grid;
        self.active();              //fill active block;
        self.avatar();              //drawing player;
    },

    cvsMove: (dx, dy) => {
        env.offset[0] -= dx;
        env.offset[1] += dy;
    },
    cvsScale: (dx, dy, ds) => {
        env.offset[0] -= dx;
        env.offset[1] += dy;
        env.scale += ds;
    },
};

const renderer = {
    hooks: self.hooks,
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
        //console.log(`Showing 2D map of ${dom_id}`, env.pen);
        self.render();
    },
    clean: (dom_id) => {
        const el = document.getElementById(dom_id);
        el.innerHTML = "";

        env.pen = null;
    },
    control: {
        scale: (cx, cy, rate) => {
            //console.log(`Scale on ${JSON.stringify(point)} by delta ${delta}`);
            const pCtoB = TwoObject.calculate.distance.c2b;
            const rotation = 0;
            const dx = pCtoB(cx, rotation, env.scale, env.ratio, env.density);
            const dy = pCtoB(cy, rotation, env.scale, env.ratio, env.density);
            const cs = (rate - 1) * env.scale;
            self.cvsScale(dx, dy, cs);
            self.render();
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
            //console.log(pos,cfg);
            //const cp=root.calc.pCtoB(pos, env.scale, env.offset, env.multi, env.pxperm);
            const pCtoB = TwoObject.calculate.point.c2b;
            const point = pCtoB(pos, env.scale, env.offset, env.density, env.ratio);
            const x = Math.ceil(point[0] / env.side[0]);
            const y = Math.ceil(point[1] / env.side[1]);

            //console.log(x,y);
            self.render();
            self.block(x, y, cfg);
            return [x, y];
        },
    }
}

export default renderer;