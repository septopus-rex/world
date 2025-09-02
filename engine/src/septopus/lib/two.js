/**
 * Lib - 2D calculation
 *
 * @fileoverview
 *  1. 2D convert and calcultion points
 *  2. canvas drawing methods
 *
 * @author Fuu
 * @date 2025-04-29
 */

const config={
    style:{
        lineWidth:1,
        strokeStyle:"#000000",
        fillStyle:"#FFFFFF",
        globalAlpha:1,
    },
}

const self = {
    drawing: {
        line: (env, ps, cfg) => {
            if (env.pen === null) return { error: "Canvas is not init yet." }
            const { pen, scale, offset, height, density, ratio } = env;
            const pBtoC = self.calculate.point.b2c;
            const antiHeight = cfg.anticlock ? height * ratio : 0;

            pen.lineWidth = !cfg.width ? 1 : cfg.width;
            pen.strokeStyle = !cfg.color ? "#000000" : cfg.color;
            pen.beginPath();
            for (let i = 0, len = ps.length; i < len; i++) {
                const p = pBtoC(ps[i], scale, offset, density, antiHeight);
                if (i == 0) pen.moveTo(p[0] + 0.5, p[1] + 0.5);
                if (i > 0 && i < len) pen.lineTo(p[0] + 0.5, p[1] + 0.5);
            }
            pen.closePath();
            pen.stroke();
        },
        dash: () => {
            if (env.pen === null) return { error: "Canvas is not init yet." }
            const { pen, scale, offset, height, density, ratio } = env;
        },
        arc: (env, center, radius, angle) => {
            if (env.pen === null) return { error: "Canvas is not init yet." }
            const { pen, scale, offset, height, density, ratio } = env;
            const antiHeight = cfg.anticlock ? height * ratio : 0;

            const [start, end] = angle;
            const rotation = 0;

            const pBtoC = self.calculate.point.b2c;
            const disBtoC = self.calculate.distance.b2c;
            const anClear = self.calculate.angle.clean;
            const c = pBtoC(center, scale, offset, density, antiHeight);
            const r = disBtoC(radius, rotation, scale, ratio, density);
            const startAngle = anClear(start), endAngle = anClear(end);

            let grd;
            if (cfg.grad) {
                grd = pen.createRadialGradient(c[0], c[1], 1, c[0], c[1], r);
                for (let i in cfg.grad) {
                    const stop = cfg.grad[i];
                    grd.addColorStop(stop[0], stop[1]);
                }
            }

            pen.beginPath();
            pen.fillStyle = cfg.grad ? grd : cfg.color;
            pen.strokeStyle = cfg.color;
            pen.moveTo(c[0], c[1]);
            pen.arc(c[0], c[1], r, startAngle, endAngle);
            pen.closePath();
            pen.fill();
        },
        fill: (env, ps, cfg) => {
            if (env.pen === null) return { error: "Canvas is not init yet." }
            const { pen, scale, offset, height, density, ratio } = env;        // density=== px per meter
            const b2c = self.calculate.point.b2c;

            pen.fillStyle = cfg.color;
            pen.beginPath();
            for (let i = 0, len = ps.length; i < len; i++) {
                const p = b2c(ps[i], scale, offset, density, cfg.anticlock ? height * ratio : 0);
                if (i == 0) pen.moveTo(p[0] + 0.5, p[1] + 0.5);
                if (i > 0 && i < len) pen.lineTo(p[0] + 0.5, p[1] + 0.5);
            }
            pen.closePath();
            pen.fill();
        },
        sector: (env, param, cfg) => {
            if (env.pen === null) return { error: "Canvas is not init yet." }
            const { pen, scale, offset, height, density, ratio } = env;
            if (cfg.alpha) pen.globalAlpha = cfg.alpha;

            const rotation = 0;
            const zj = Math.PI / 2;
            const antiHeight = cfg.anticlock ? height * ratio : 0;
            const pBtoC = self.calculate.point.b2c;
            const disBtoC = self.calculate.distance.b2c;
            const anClear = self.calculate.angle.clean;

            //const s=run.scale,o=run.offset,px=run.pxperm,ro=0,m=run.multi,zj=Math.PI/2
            //const h=cfg.anticlock?run.height*run.multi:0;
            //const calc=root.calc,pBtoC=calc.pBtoC,disBtoC=calc.disBtoC,anClear=calc.anClean
            const c = pBtoC(param.center, scale, offset, density, antiHeight);
            const r = disBtoC(param.radius, rotation, scale, ratio, density);
            const ss = anClear(param.start), e = anClear(param.end);
            //console.log(r)
            let grd;
            if (cfg.grad) {
                //console.log(cfg.grad)
                grd = pen.createRadialGradient(c[0], c[1], 1, c[0], c[1], r);
                for (let i in cfg.grad) {
                    const stop = cfg.grad[i];
                    grd.addColorStop(stop[0], stop[1]);
                }
            }

            pen.beginPath();
            pen.fillStyle = cfg.grad ? grd : cfg.color;
            pen.strokeStyle = cfg.color;
            pen.moveTo(c[0], c[1]);
            pen.arc(c[0], c[1], r, ss, e);
            pen.closePath();
            pen.fill();
            if (cfg.alpha) pen.globalAlpha = 1;
        },
        image: () => {
            if (env.pen === null) return { error: "Canvas is not init yet." }
            const { pen, scale, offset, height, density, ratio } = env;
        },
        text: () => {
            if (env.pen === null) return { error: "Canvas is not init yet." }
            const { pen, scale, offset, height, density, ratio } = env;
        },
        grid: () => {

        },
        clean: (env, color) => {
            const { pen, width, height, ratio } = env;
            //console.log(pen,width,height,ratio);
            pen.fillStyle = color;
            pen.fillRect(0, 0, width * ratio, height * ratio);
        },
    },
    calculate: {
        point: {
            extend: (point, distance, angle) => {
                return [
                    Math.round(point[0] + distance * Math.cos(angle)),
                    Math.round(point[1] + distance * Math.sin(angle))
                ]
            },
            a2b: (point, angle, offset) => {
                const sin = Math.sin(angle), cos = Math.cos(angle);
                return [
                    offset[0] + point[0] * cos - point[1] * sin,
                    offset[1] + point[0] * sin + point[1] * cos
                ];
            },
            b2a: (point, angle, offset) => {
                const sin = Math.sin(angle), cos = Math.cos(angle);
                return [
                    (point[0] - offset[0]) * cos + (point[1] - offset[1]) * sin,
                    (offset[0] - point[0]) * sin + (point[1] - offset[1]) * cos
                ];
            },
            b2c: (point, scale, offset, density, height) => {
                const mm = density * scale;
                if (!height) return [            //anticlock converting
                    Math.ceil((point[0] - offset[0]) * mm),
                    Math.ceil((point[1] - offset[1]) * mm)
                ];
                return [
                    Math.ceil((point[0] - offset[0]) * mm),
                    height - Math.ceil((point[1] - offset[1]) * mm)
                ];
            },
            c2b: (point, scale, offset, density, radio) => {
                const mm = density * scale / radio;
                return [
                    point[0] / mm + offset[0],
                    point[1] / mm + offset[1]
                ];
            },
        },
        distance: {
            b2c: (dis, rotation, scale, ratio, density) => {
                if (rotation == undefined) rotation = 0
                return dis * density * scale / ratio
            },
            c2b: (dis, rotation, scale, ratio, density) => {
                if (rotation == undefined) rotation = 0
                return dis * ratio / (density * scale)
            },
        },
        angle: {
            r2n: () => {

            },
            n2r: () => {

            },
            merge: (angle) => {

            },
            clean: (angle) => {
                const x = Math.PI + Math.PI;
                const clean = self.calculate.angle.clean;
                if (angle < 0) return clean(angle + x);
                if (angle >= x) return clean(angle - x);
                return angle;
            },
        },
        line: {
            plumb: (point, line) => {
                const pa = line[0], pb = line[1];
                const k = ((point[0] - pa[0]) * (pb[0] - pa[0]) + (point[1] - pa[1]) * (pb[1] - pa[1])) / ((pb[0] - pa[0]) * (pb[0] - pa[0]) + (pb[1] - pa[1]) * (pb[1] - pa[1]));
                return [
                    pa[0] + k * (pb[0] - pa[0]),
                    pa[1] + k * (pb[1] - pa[1])
                ];
            },
            distance: (point, line) => {
                const pa = line[0], pb = line[1]
                const a = pb[1] - pa[1], b = pa[0] - pb[0], c = pb[0] * pa[1] - pa[0] * pb[1];
                return Math.abs((point[0] * a + b * point[1] + c) / Math.sqrt(a * a + b * b));
            },
            midpoint: (pa, pb) => {

            },
            intersect: (pa, pb) => {
                const [a, b] = pa, [c, d] = pb;
                const abc = (a[0] - c[0]) * (b[1] - c[1]) - (a[1] - c[1]) * (b[0] - c[0]), abd = (a[0] - d[0]) * (b[1] - d[1]) - (a[1] - d[1]) * (b[0] - d[0]);
                if (abc * abd >= 0) return false;
                const cda = (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]), cdb = cda + abc - abd;
                if (cda * cdb >= 0) return false;
                return true;
            },
            offset: () => {

            },
        },
        area: {
            padding: (ps) => {
                const pad = [null, null, null, null];
                for (let i in ps) {
                    const p = ps[i];
                    pad[0] = (pad[0] == null) ? p[1] : (p[1] < pad[0] ? pad[0] : p[1]);
                    pad[1] = (pad[1] == null) ? p[0] : (p[0] > pad[1] ? p[0] : pad[1]);
                    pad[2] = (pad[2] == null) ? p[1] : (p[1] > pad[2] ? pad[2] : p[1]);
                    pad[3] = (pad[3] == null) ? p[0] : (p[0] < pad[3] ? p[0] : pad[3]);
                }
                return pad;
            },
            rectangle: (ps) => {

            },
            girth: (ps) => {
                if (ps.length < 3) return false;
                const ppDis = self.calculate.point.distance;

                let dis = 0;
                for (let i in ps) {
                    dis += ppDis(ps[i], i == (ps.length - 1) ? ps[0] : ps[i + 1]);
                }
                return dis;
            }
        },
    },
    setStyle:(pen,style)=>{
        if(style.width) pen.lineWidth = style.width;
        if(style.color) pen.strokeStyle = style.color;
        if(style.fill) pen.fillStyle = style.fill;
        if(style.opacity) pen.globalAlpha = style.opacity;
    },
    resetStyle:(pen)=>{
        pen.lineWidth=config.style.lineWidth;
        pen.strokeStyle=config.style.strokeStyle;
        pen.fillStyle=config.style.fillStyle;
        pen.globalAlpha=config.style.globalAlpha;
    },
}

const router={
    line:{
        format:(raw)=>{

        },
        drawing:(params,pen,env,cfg)=>{

        },
        sample:{points:[[],[]]},
    },
    arc:{
        format:(raw)=>{

        },
        drawing:(params,pen,env,cfg)=>{

        },
        sample:{},
    },
    sector:{
        format:(raw)=>{

        },
        drawing:(params,pen,env,cfg)=>{

        },
        sample:{},
    },
    rectangle:{
        format:(raw)=>{

        },
        drawing:(params,pen,env,cfg)=>{

        },
        sample:{
            width:100,
            height:200,
            position:[600,900],     //[left,bottom]
        },
    },
    ring:{
        format:(raw)=>{

        },
        drawing:(params,pen,env,cfg)=>{

        },
        sample:{
            radius:[300,0],         //[outer,inner]
            radian:[0,360],         //[start,end]
            position:[600,900],     //rectangle center
        },
    },
    polygons:{
        format:(raw)=>{

        },
        drawing:(params,pen,env,cfg)=>{

        },
        sample:{
            points:[[300,0],[250,600],[900,300]],
            position:[600,900],     //[left,bottom]
            close:true,
        },
    },
    curves:{},
    text:{
        format:(raw)=>{

        },
        drawing:(params,pen,env,cfg)=>{

        },
        sample:{
            content:"text sample",      //sample text
            font:14,                    //screen pixel
            position:[600,900],         //[left,bottom]
        },
    },
    image:{
        format:(raw)=>{

        },
        drawing:(params,pen,env,cfg)=>{

        },
        sample:{
            content:"raw image",    //sample text
            width:100,              //world size
            height:300,             //world size
            position:[600,900],     //[left,bottom]
        },
    },
}   

const TwoObject = {
    get: (type, raw ,style,cfg) => {
        if(!router[type]) return {error:`Type "${type}" of 2D object is not support yet.`};

        const fmt={type:type,params:{}};
        if(style!==undefined) fmt.style = style;
        if(cfg!==undefined) fmt.more=cfg;
        fmt.params=router[type].format(raw);

        return fmt;
    },
    show:(pen,arr,ck)=>{
        const errors=[];
        for(let i=0;i<arr.length;i++){
            const row=arr[i];
            //0. check data;
            if(!row.type || !router[row.type]){
                errors.push({error:`Failed to drawing row[${i}]: ${JSON.stringify(row)}`});
                continue;
            } 

            //1.if style, set it;
            if(row.style) self.setStyle(pen,row.style);

            //router[row.type].drawing(row.params,pen,env,row.more);
            //2. if style ,recover it;
            if(row.style) self.resetStyle(pen);
        }

        return ck && ck(errors);
    },
    calculate: self.calculate,
    drawing: self.drawing,
}

export default TwoObject