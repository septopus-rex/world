/**
 * Adjunct - box
 *
 * @fileoverview
 *  1. box with texture
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"box",
    category:'basic',         
    desc:"",
    version:"1.0.0",
}

const config={
    color:0xf3f5f6,
    stop:{
        offset: 0.05,
        color: 0xffffff,
        opacity:0.5,    
    },
    animate:[
        {way:"rotate",param:{speed:0.2,ax:"x"}},
        {way:"rotateZ",param:{speed:0.2,ax:"x"}},
        {way:"rotateX",param:{speed:0.2,ax:"x"}},
    ],
}

const valid={
    x:(val,cvt,std)=>{
        console.log(val,cvt,std);
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    y:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    z:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    ox:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return n;
    },
    oy:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    oz:(val,cvt,std)=>{
        const n=parseInt(val);
        if(isNaN(n)) return false;
        if(n<=0) return false;
        return parseFloat(n/cvt);
    },
    rx:(val,cvt,std)=>{

    },
    ry:(val,cvt,std)=>{

    },
    rz:(val,cvt,std)=>{

    },
}

let definition=null;       //cache adjunct definition here.
const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        def:(data)=>{
            definition=data;
        },
        //`cfg` to support more complex animation
        animate:(meshes,cfg)=>{
            //console.log(cfg);
            const effect=cfg.effect-1;
            if(effect<0) return false;
            if(config.animate[effect]===undefined) return false;
            const param=config.animate[effect];

            switch (effect) {
                case 0:
                    for(let i=0;i<meshes.length;i++){
                        const mesh=meshes[i];
                        mesh.rotation.x+=0.1;
                        mesh.rotation.y+=0.1;
                        mesh.rotation.z+=0.1;
                    }
                    break;
                
                case 1:
                    for(let i=0;i<meshes.length;i++){
                        const mesh=meshes[i];
                        //mesh.rotation.x+=0.1;
                        mesh.rotation.y+=0.1;
                        //mesh.rotation.z+=0.1;
                    }
                    break;
                case 2:
                    for(let i=0;i<meshes.length;i++){
                        const mesh=meshes[i];
                        mesh.rotation.x+=0.1;
                        //mesh.rotation.y+=0.1;
                        //mesh.rotation.z+=0.1;
                    }
                    break;
            
                default:
                    break;
            }
        },
    },
    menu: {
        pop: (std) => {
            return [
                {type:"button",label:"Info",icon:"",action:(ev)=>{
                    console.log(ev);
                }},
                {type:"button",label:"Remove",icon:"",action:(ev)=>{
                    console.log(ev);
                }},
                {type:"button",label:"Copy",icon:"",action:(ev)=>{
                    console.log(ev);
                }},
            ];
        },
        sidebar: (std) => {
            const animate_options=[
                {key:"Null",value:0},
            ];
            return {
                size:[
                    {type:"number",key:"x",value:std.x,label:"X",icon:"",desc:"X of wall",valid:(val,cvt)=>{return valid.x(val,cvt,std)}},
                    {type:"number",key:"y",value:std.y,label:"Y",icon:"",desc:"Y of wall",valid:(val,cvt)=>{return valid.y(val,cvt,std)}},
                    {type:"number",key:"z",value:std.z,label:"Z",icon:"",desc:"Z of wall",valid:(val,cvt)=>{return valid.z(val,cvt,std)}},
                ],
                position:[
                    {type:"number",key:"ox",value:std.ox,label:"X",icon:"",desc:"X of postion",valid:(val,cvt)=>{return valid.ox(val,cvt,std)}},
                    {type:"number",key:"oy",value:std.oy,label:"Y",icon:"",desc:"Y of postion",valid:(val,cvt)=>{return valid.oy(val,cvt,std)}},
                    {type:"number",key:"oz",value:std.oz,label:"Z",icon:"",desc:"Z of postion",valid:(val,cvt)=>{return valid.oz(val,cvt,std)}},
                ],
                rotation:[
                    {type:"number",key:"rx",value:std.rx,label:"X",icon:"",desc:"X of rotation",valid:(val,cvt)=>{return valid.rx(val,cvt,std)}},
                    {type:"number",key:"ry",value:std.ry,label:"Y",icon:"",desc:"Y of rotation",valid:(val,cvt)=>{return valid.ry(val,cvt,std)}},
                    {type:"number",key:"rz",value:std.rz,label:"Z",icon:"",desc:"Z of rotation",valid:(val,cvt)=>{return valid.rz(val,cvt,std)}},
                ],
            }
        },
    },
    attribute:{
        add: (p, raw) => {
            raw.push(self.attribute.combine(p));
            return raw;
        },
        set: (p, raw, limit) => {
            if (p.index === undefined) return false;
            const index = p.index;
            if (limit === undefined) {
                raw[index] = self.attribute.combine(p, raw[index]);
            } else {
                //const pp = self.attribute.revise(p, raw[index], limit);
                //raw[index] = self.attribute.combine(pp, raw[index]);
            }
            return raw;
        },
        remove: (p, raw) => {
            if (p.index === undefined) return false;
            const rst = [];
            for (let i in raw) if (i != p.index) rst.push(raw[i]);
            return rst;
        },
        combine: (p, row) => {
            const dd = row || JSON.parse(JSON.stringify(config.default));
            dd[0][0] = p.x === undefined ? dd[0][0] : p.x;
            dd[0][1] = p.y === undefined ? dd[0][1] : p.y;
            dd[0][2] = p.z === undefined ? dd[0][2] : p.z;
            dd[1][0] = p.ox === undefined ? dd[1][0] : p.ox;
            dd[1][1] = p.oy === undefined ? dd[1][1] : p.oy;
            dd[1][2] = p.oz === undefined ? dd[1][2] : p.oz;
            dd[2][0] = p.rx === undefined ? dd[2][0] : p.rx;
            dd[2][1] = p.ry === undefined ? dd[2][1] : p.ry;
            dd[2][2] = p.rz === undefined ? dd[2][2] : p.rz;
            dd[3] = p.texture === undefined ? dd[3] : p.texture;
            dd[5] = p.animate === undefined ? dd[5] : p.animate;
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
    transform:{
        raw_std:(arr,cvt)=>{
            const rst=[]
            for(let i in arr){
                const d=arr[i],s=d[0],p=d[1],r=d[2],tid=d[3],rpt=d[4];
                const dt={
                    x:s[0]*cvt,y:s[1]*cvt,z:s[2]*cvt,
                    ox:p[0]*cvt,oy:p[1]*cvt,oz:p[2]*cvt,
                    rx:r[0],ry:r[1],rz:r[2],
                    material:{
                        texture:tid,
                        repeat:rpt,
                        color:config.color,
                    },
                    stop:!d[6]?false:true,
                }
                
                if(d[5]!==undefined && config.animate[d[5]-1]!==undefined){
                    dt.animate=d[5];
                }
                
                rst.push(dt);
            }
            return rst;
        },

        std_3d:(stds,va)=>{
            const arr=[];
            for(let i=0;i<stds.length;i++){
                const row=stds[i];
                const single={
                    type:"box",
                    index:i,
                    params:{
                        size:[row.x,row.y,row.z],
                        position:[row.ox,row.oy,row.oz+va],
                        rotation:[row.rx,row.ry,row.rz],
                    },
                    material:row.material,
                    animate:row.animate,
                }
                
                if(row.stop){
                    single.stop={
                        opacity:config.stop.opacity,
                        color:!config.stop.color?0xfffffff:config.stop.color
                    }
                }
                arr.push(single);
            }
            return arr;
        },
        std_active:(stds,va,index)=>{
            const ds={stop:[],helper:[]};
            return ds;
        },


        std_raw:(arr,cvt)=>{

        },

        std_box:(obj)=>{

        },
        std_2d:(arr,face)=>{

        },
        active_2d:()=>{

        },
    },
    task:{
        dance:(meshes)=>{

        },
        hide:(meshes)=>{

        },
        show:(meshes)=>{

        },
        router:["hide","show","dance"],
    }
};

const basic_box={
    hooks:self.hooks,
    transform:self.transform,
    attribute:self.attribute,
    menu:self.menu,
    task:self.task,
}

export default basic_box;