/**
 * Adjunct - module
 *
 * @fileoverview
 *  1. load static module to block.
 *  2. import from different applications.
 *
 * @author Fuu
 * @date 2025-04-29
 */

const reg={
    name:"module",
    category:'basic',
    short:0x00a4,
    desc:"Load 3D module to locate on block",
    version:"1.0.0",
}

const config={
    default:[[3,4,3],[8,12,0],[0,0,0],27,0,1,2025],
    definition:{
        2025:[
            ['x','y','z'],      //0.
            ['ox','oy','oz'],   //1.
            ['rx','ry','rz'],   //2.
            'module_id',        //3.
            "animate",          //4.
            "stop",             //5.
        ],
    },
    color:0x3456f3,     
    animate:[
        {way:"rotate",param:{speed:0.2,ax:"x"}},
    ],
}

const self={
    hooks:{
        reg:()=>{return reg;},
        animate:(meshes,cfg)=>{

        },
    },
    transform:{
        //链上数据转换成std的中间体
        //return [objs, preload]
        raw_std:(arr,cvt)=>{
            const rst=[]
            for(let i in arr){
                const d=arr[i],s=d[0],p=d[1],r=d[2],mid=d[3];
                //root.core.setTextureQueue(tid);		//推送材质队列
                const dt={
                    x:s[0]*cvt,y:s[1]*cvt,z:s[2]*cvt,
                    ox:p[0]*cvt,oy:p[1]*cvt,oz:p[2]*cvt+s[2]*cvt*0.5,
                    rx:r[0],ry:r[1],rz:r[2],
                    module:mid,
                    material:{
                        color:config.color,
                    },
                    stop:!d[5]?false:true,
                }
                
                if(d[5]!==undefined && config.animate[d[5]]!==undefined){
                    dt.animate=d[5];
                }
                
                rst.push(dt);
            }
            return rst;
        },

        //std中间体，转换成3D需要的object
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
                    material:row.material,                      //用于处理没有加载时候的显示color的材质
                    animate:row.animate,
                    module:row.module,
                    stop:row.stop,
                }
                arr.push(single);
            }
            return arr;
        },

        //3D高亮时候，需要的3D的object
        std_active:(stds,va,index)=>{
            const ds={stop:[],helper:[]};
            return ds;
        },

        std_raw:(arr,cvt)=>{

        },

        std_box:(obj)=>{

        },

        //std中间体，转换成2D需要的数据
        std_2d:(arr,face)=>{

        },

        

        //2D高亮时候，需要的2D的object
        active_2d:()=>{

        },
    },
};

const basic_module={
    hooks:self.hooks,
    transform:self.transform,
}

export default basic_module;