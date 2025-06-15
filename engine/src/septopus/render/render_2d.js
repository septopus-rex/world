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
}

const env = {
    pen: null,
    scale: 10,
    offset: [0, 0],       //
    size: [0, 0],         //canvas size as meter
    side: [0, 0],         //block side
    limit:[4096,4096],   //block number limit
    height: 100,         //canvas height
    width: 100,          //canvas width
    density: 0.21,       // px/meter,
    ratio: 1,            // for apple device, screen ratio
    convert: 1,          //system convert 
    player: null,        //link to player
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
            el.appendChild(doc.body);

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

    },
    grid: () => {
        //const env = run[target], tpl = env.theme, size = env.size, m = env.multi
        //console.log(env)
        //const wd = me.core.world, s = wd.sideLength, mx = wd.xMax * s, my = wd.yMax * s
        const s=env.side[0], mx=env.limit[0]*s,my=env.limit[1]*s;
        const x = env.offset[0], y = env.offset[1], xw = env.size[0], yw = env.size[1];

        const xs = x < 0 ? 0 : (x - x % s);
        const ys = y < 0 ? 0 : (y - y % s);					//开始坐标位置
        const xe = x + xw > mx ? mx : x + xw;
        const ye = y + yw > my ? my : y + yw;			//结束坐标位置
        const xn = (x + xw) > mx ? Math.ceil((mx - xs) / s + 1) : Math.ceil((x + xw - xs) / s);		//竖线条数
        const yn = (y + yw) > my ? Math.ceil((my - ys) / s + 1) : Math.ceil((y + yw - ys) / s);		//横线条数
        //console.log('绘制竖线条数:'+xn+',绘制横线条数:'+yn)
        //console.log(JSON.stringify(size))
        //console.log('x轴开始绘制的位置:'+xs+',y轴开始绘制的位置:'+ys)
        const cfg = { width: 1, color: "#888888", anticlock: true }
        const line = TwoObject.drawing.line;

        let ystep = ys
        for (let i = 0; i < yn; i++) {		//绘制横线
            const pa = [xs, ystep], pb = [xe, ystep];
            line(env,[pa, pb], cfg);
            ystep += s;
        }

        let xstep = xs
        for (let i = 0; i < xn; i++) {		//绘制竖线
            const pa = [xstep, ys], pb = [xstep, ye];
            line(env,[pa, pb], cfg);
            xstep += s;
        }
    },

    active: () => {

    },
    detail: () => {

    },
    avatar: () => {

    },
    render: (force) => {
        if (force) self.start();
        self.clean();               //clean canvas;
        self.grid();                //drawing block grid;
        self.active();              //fill active block;
        self.avatar();              //drawing player;
    },
};

export default {
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
        console.log(`Showing 2D map of ${dom_id}`, env.pen);
        self.render();
    },
}