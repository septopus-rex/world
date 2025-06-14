/**
 * Render - 2D Render
 *
 * @fileoverview
 *  1. 2D render from `STD` data
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"rd_two",
    type:'render',
}

const config={
    scale:{
        range:18,       //scale to show range
        detail:8,       //scale to show details
    },
    canvas:{
        id:"canvas_2d",
    },
    limit:{
        max:30,     //max scale
        min:1,      //min scale
    },
}

const env={
    pen:null,
    scale:10,
    offset:[0,0],
    height:100,         //canvas height
    width:100,
    density:10,
    ratio:1,
};

const test={
    rectangle:(pen)=>{
        pen.lineWidth = 2;
		pen.strokeStyle = '#FF0000';
		pen.beginPath();
		pen.moveTo(100,100);
        pen.lineTo(100,300);
        pen.lineTo(250,300);
        pen.lineTo(250,100);
		pen.closePath();
		pen.stroke();
    },
};

const self={
    hooks:{
        reg:()=>{return reg},
        // init:()=>{

        // },
    },
    getDom:(data)=>{
        const parser = new DOMParser();
        return  parser.parseFromString(data, 'text/html');
    },
    construct:(dom_id)=>{
        let cvs=document.getElementById(config.canvas.id);
        if(cvs===null){
            const el=document.getElementById(dom_id);
            const width=el.clientWidth,height=el.clientHeight;
            env.width=width;
            env.height=height;
            env.ratio= window.devicePixelRatio;

            const ctx=`<canvas 
                id="${config.canvas.id}" 
                class="" 
                width="${width*env.ratio}" height="${height*env.ratio}"
                style="width:${width}px;height:${height}px"
            ></canvas>`;
            const doc=self.getDom(ctx);
            el.appendChild(doc.body);

            cvs=document.getElementById(config.canvas.id);
        }
        //set pen, ready to render
		env.pen=cvs.getContext("2d");
        test.rectangle(env.pen);
    },
};

export default {
    hooks:self.hooks,
    show:(dom_id)=>{
        if(env.pen===null) self.construct(dom_id);

        console.log(`Showing 2D map of ${dom_id}`,env.pen);
    },
}