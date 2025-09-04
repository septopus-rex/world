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
        fillStyle:"#000000",
        globalAlpha:1,
    },
}

const self = {
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
    clean: (env, color) => {
        const { pen, width, height, ratio } = env;
        pen.fillStyle = color;
        pen.fillRect(0, 0, width * ratio, height * ratio);
    },

    setStyle:(pen,style)=>{
        if(style.width) pen.lineWidth = style.width;
        if(style.color) pen.strokeStyle =  `#${style.color.toString(16)}`;
        if(style.fill) pen.fillStyle = `#${style.fill.toString(16)}`;
        if(style.opacity) pen.globalAlpha = style.opacity;
    },
    resetStyle:(pen)=>{
        pen.lineWidth=config.style.lineWidth;
        pen.strokeStyle=config.style.strokeStyle;
        pen.fillStyle=config.style.fillStyle;
        pen.globalAlpha=config.style.globalAlpha;
    },
}

const drawing={
    line:{
        format:(raw)=>{
            const fmt={ points:[] };
            fmt.points.push(raw.from);
            fmt.points.push(raw.to);
            if(raw.segement){
                fmt.segement=[];
            }
            return fmt;
        },
        drawing:(data,pen,env,cfg)=>{
            const {scale, offset, height, density, ratio } = env;
            const antiHeight = cfg.anticlock?height * ratio:0;
            const pBtoC = self.calculate.point.b2c;

            //1. line drawing
            const start = pBtoC(data.points[0], scale, offset, density, antiHeight);
            const end = pBtoC(data.points[1], scale, offset, density, antiHeight);
            pen.beginPath();
            pen.moveTo(start[0] + 0.5, start[1] + 0.5);
            pen.lineTo(end[0] + 0.5, end[1] + 0.5);
            pen.stroke();
    
            //2. segements drawing
            if(data.segement){

            }
        },
        sample:{        //format input 
            from:[0,100],
            to:[300,600],
            segement:3,
        },
    },
    rectangle:{
        format:(raw)=>{
            const fmt={ points:[] };
            const {size , position }=raw;
            fmt.points.push([position[0]-0.5*size[0],position[1]-0.5*size[1]]);
            fmt.points.push([position[0]+0.5*size[0],position[1]-0.5*size[1]]);
            fmt.points.push([position[0]+0.5*size[0],position[1]+0.5*size[1]]);
            fmt.points.push([position[0]-0.5*size[0],position[1]+0.5*size[1]]);
            return fmt;
        },
        drawing:(data,pen,env,cfg)=>{
            //console.log(cfg);
            const {scale, offset, height, density, ratio } = env;
            const antiHeight =cfg.anticlock?height * ratio:0;
            const pBtoC = self.calculate.point.b2c;

            pen.beginPath();
            const len=data.points.length;
            for (let i = 0; i < len; i++) {
                const point=data.points[i];
                const p = pBtoC(point, scale, offset, density, antiHeight);
                if (i === 0) pen.moveTo(p[0] + 0.5, p[1] + 0.5);
                if (i > 0 && i < len) pen.lineTo(p[0] + 0.5, p[1] + 0.5);
            }
            pen.closePath();
            pen.stroke();
            if(cfg.fill) pen.fill();
        },
        sample:{        //format input 
            size:[100,200],
            position:[600,900],     //[left,bottom]
        },
    },
    
    sector:{
        format:(raw)=>{
            return {
                radius:raw.radius,
                center:raw.position,
                start:raw.radian[0],
                end:raw.radian[1],
            };
        },
        drawing:(data,pen,env,cfg)=>{
            
            const {scale, offset, height, density, ratio } = env;
            const pBtoC = self.calculate.point.b2c;
            const disBtoC = self.calculate.distance.b2c;
            const anClear = self.calculate.angle.clean;

            const rotation=0;
            const antiHeight = cfg.anticlock?height * ratio:0;

            const center= pBtoC(data.center, scale, offset, density, antiHeight);            
            const radius=disBtoC(data.radius, rotation, scale, ratio, density);

            const zj=Math.PI*0.5;
            //const start= cfg.anticlock?-Math.PI*data.start/180-zj:Math.PI*data.start/180;
            //const end = cfg.anticlock?-Math.PI*data.end/180-zj:Math.PI*data.end/180;
            const start= cfg.anticlock?-Math.PI*data.start/180:Math.PI*data.start/180;
            const end = cfg.anticlock?-Math.PI*data.end/180:Math.PI*data.end/180;

            //1.Radial Gradient support
            if (cfg.grad) {
                let grd = null;
                grd = pen.createRadialGradient(center[0], center[1], 1, center[0], center[1], radius);
                for (let i in cfg.grad) {
                    const stop = cfg.grad[i];
                    grd.addColorStop(stop[0],`#${stop[1].toString(16)}`);
                }
                pen.fillStyle =grd;
            }

            //2. actual drawing of sector
            pen.beginPath();
            pen.moveTo(center[0], center[1]);
            if(cfg.anticlock){
                pen.arc(center[0], center[1], radius,anClear(end), anClear(start));
            }else{
                pen.arc(center[0], center[1], radius,anClear(start), anClear(end));
            }
            pen.closePath();
            pen.fill();
        },
        sample:{
            radius:600,             // sector radius
            radian:[0,360],         // [start,end]
            position:[600,900],     // circle center
        },
    },
    arc:{
        format:(raw)=>{
            return {
                radius:raw.radius,
                center:raw.position,
                start:raw.radian[0],
                end:raw.radian[1],
            };
        },
        drawing:(data,pen,env,cfg)=>{
            const {scale, offset, height, density, ratio } = env;
            const pBtoC = self.calculate.point.b2c;
            const disBtoC = self.calculate.distance.b2c;
            const anClear = self.calculate.angle.clean;

            const rotation=0;
            const antiHeight = cfg.anticlock?height * ratio:0;

            const center= pBtoC(data.center, scale, offset, density, antiHeight);            
            const radius=disBtoC(data.radius, rotation, scale, ratio, density);

            const zj=Math.PI*0.5;
            const start= cfg.anticlock?-Math.PI*data.start/180:Math.PI*data.start/180;
            const end = cfg.anticlock?-Math.PI*data.end/180:Math.PI*data.end/180;

            //2. actual drawing of sector
            pen.beginPath();
            //pen.moveTo(center[0], center[1]);
            if(cfg.anticlock){
                pen.arc(center[0], center[1], radius,anClear(end), anClear(start));
            }else{
                pen.arc(center[0], center[1], radius,anClear(start), anClear(end));
            }
            //pen.closePath();
            pen.stroke();
        },
        sample:{
            radius:600,             // sector radius
            radian:[0,360],         // [start,end]
            position:[600,900],     // circle center
        },
    },
    
    text:{
        format:(raw)=>{
            return {
                content:raw.text,
                size:raw.size,
                position:raw.position,
            }
        },
        drawing:(data,pen,env,cfg)=>{
            const {scale, offset, height, density, ratio } = env;
            const pBtoC = self.calculate.point.b2c;
            const disBtoC = self.calculate.distance.b2c;

            // const left=10;
            // const top=50;
            const antiHeight = cfg.anticlock?height * ratio:0;
            const pos= pBtoC(data.position, scale, offset, density, antiHeight);   
            const [left,top]=pos;
            const rotation=0;
            const font=disBtoC(data.size, rotation, scale, ratio, density);
            pen.font=`${font}px Arial`;

            pen.fillText(data.content,left,top);
        },
        sample:{
            text:"text sample",      //sample text
            font:14,                    //screen pixel
            position:[600,900],         //[left,bottom]
        },
    },
    image:{
        format:(raw)=>{

        },
        drawing:(data,pen,env,cfg)=>{
            const {scale, offset, height, density, ratio } = env;
        },
        sample:{
            content:"raw image",    //sample text
            width:100,              //world size
            height:300,             //world size
            position:[600,900],     //[left,bottom]
        },
    },
    ring:{
        format:(raw)=>{
            return {
                outer:raw.radius[0],
                inner:raw.radius[1],
                center:raw.position,
                start:raw.radian[0],
                end:raw.radian[1],
            };
        },
        drawing:(data,pen,env,cfg)=>{
            const {scale, offset, height, density, ratio } = env;
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
        drawing:(data,pen,env,cfg)=>{
            const {scale, offset, height, density, ratio } = env;
        },
        sample:{
            points:[[300,0],[250,600],[900,300]],
            position:[600,900],     //[left,bottom]
            close:true,
        },
    },
    curves:{
        format:(raw)=>{

        },
        drawing:(data,pen,env,cfg)=>{
            const {scale, offset, height, density, ratio } = env;
        },
        sample:{
        },
    },

}   

const TwoObject = {
    calculate: self.calculate,
    get: (type, raw ,style,cfg) => {
        if(!drawing[type]) return {error:`Type "${type}" of 2D object is not support yet.`};

        const fmt={type:type,params:{}};
        if(style!==undefined) fmt.style = style;
        if(cfg!==undefined) fmt.more=cfg;
        fmt.params=drawing[type].format(raw);

        return fmt;
    },
    show:(pen,env,arr,ck)=>{
        const errors=[];
        //console.log(env);
        for(let i=0;i<arr.length;i++){
            const row=arr[i];
            
            //0. check data;
            if(!row.type || !drawing[row.type]){
                errors.push({error:`Failed to drawing row[${i}]: ${JSON.stringify(row)}`});
                continue;
            }

            //1.if style, set it;
            if(row.style) self.setStyle(pen,row.style);

            if(row.style.fill) row.more.fill=true;
            drawing[row.type].drawing(row.params,pen,env,row.more);

            //2. if style ,recover it;
            if(row.style) self.resetStyle(pen);
        }

        return ck && ck(errors);
    },
    clean:self.clean,
}

export default TwoObject