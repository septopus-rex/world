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
}

let pen=null;

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
            const multi=window.devicePixelRatio;
            //console.log(width,height,multi);
            const ctx=`<canvas 
                id="${config.canvas.id}" 
                class="" 
                width="${width*multi}" height="${height*multi}"
                style="width:${width}px;height:${height}px"
            >
            </canvas>`;
            const doc=self.getDom(ctx);
            el.appendChild(doc.body);

            cvs=document.getElementById(config.canvas.id);
        }
        //set pen, ready to render
		pen=cvs.getContext("2d");
    },
};

export default {
    hooks:self.hooks,
    
    show:(dom_id)=>{
        if(pen===null) self.construct(dom_id);

        console.log(`Showing 2D map of ${dom_id}`,pen);
    },
}