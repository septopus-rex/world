/**
 * Adjunct - box
 *
 * @fileoverview
 *  1. box with texture
 *
 * @author Fuu
 * @date 2025-04-23
 */

const def={
    "INDEX_OF_SIZE":            0,
    "INDEX_OF_POSITION":        1,
    "INDEX_OF_ROTATION":        2,
    "RESOURCE_ID_ON_CHAIN":     3,
    "TEXTURE_REPEAT_SETTING":   4,
    "ANIMATION_OPTION":         5,
    "AUTO_STOP":                6,
}

const reg={
    name:"box",
    category:'basic',
    short:0x00a2,
    desc:"",
    version:"1.0.0",
    definition:def,
}

const config={
    default:[[1.2,1.2,1.2],[8,8,2],[0,0,0],2,[1,1],0,0,1,2025],
    definition:{
        2025:[
            ['x','y','z'],      //0.
            ['ox','oy','oz'],   //1.
            ['rx','ry','rz'],   //2.
            'texture_id',       //3.
            ['rpx','rpy'],      //4.
            "animate",          //5.
            "stop",             //6.
        ],
    },
    color:0xf3f5f6,
    stop:{
        offset: 0.05,
        color: 0xffffff,
        opacity:0.5,    
    },
    animate:[
        {way:"rotate",param:{speed:0.2,ax:"x"}},
    ],
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        //`cfg` to support more complex animation
        animate:(meshes,cfg)=>{
            for(let i=0;i<meshes.length;i++){
                const mesh=meshes[i];
                mesh.rotation.x+=0.1;
                mesh.rotation.y+=0.1;
                mesh.rotation.z+=0.1;
            }
        },
    },
    attribute:{

    },
    transform:{
        raw_std:(arr,cvt)=>{
            const rst=[]
            for(let i in arr){
                const d=arr[i],s=d[0],p=d[1],r=d[2],tid=d[3],rpt=d[4];
                const dt={
                    x:s[0]*cvt,y:s[1]*cvt,z:s[2]*cvt,
                    ox:p[0]*cvt,oy:p[1]*cvt,oz:p[2]*cvt+s[2]*cvt*0.5,
                    rx:r[0],ry:r[1],rz:r[2],
                    material:{
                        texture:tid,
                        repeat:rpt,
                        color:config.color,
                    },
                    stop:!d[6]?false:true,
                }
                
                if(d[5]!==undefined && config.animate[d[5]]!==undefined){
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
};

const basic_box={
    hooks:self.hooks,
    transform:self.transform,
    attribute:self.attribute,
}

export default basic_box;