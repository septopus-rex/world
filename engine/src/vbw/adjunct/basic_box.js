/* 
*  Module block, single block
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.
*/

const reg={
    name:"box",         //组件名称
    category:'basic',       //组件分类
    short:"a2",         //key的缩写，用于减少链上数据
    desc:"",
    version:"1.0.0",
}

const config={
    default:[[1.2,1.2,1.2],[8,8,2],[0,0,0],2,[1,1],0,0,2025],
    definition:{
        2025:[
            ['x','y','z'],
            ['ox','oy','oz'],
            ['rx','ry','rz'],
            'texture_id',
            ['rpx','rpy'],
            "animate",
        ],
    },
    color:0xf3f5f6,
    animate:[               //支持的动画效果
        {way:"rotate",param:{speed:0.2,ax:"x"}},        //动画效果
    ],
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        animate:(ms)=>{
            for(let i=0;i<ms.length;i++){
                const mesh=ms[i];
                mesh.rotation.x+=0.1;
                mesh.rotation.y+=0.1;
                mesh.rotation.z+=0.1;
            }
        },
    },
    transform:{
        //链上数据转换成std的中间体
        //return [objs, preload]
        raw_std:(arr,cvt)=>{
            const rst=[]
            for(let i in arr){
                const d=arr[i],s=d[0],p=d[1],r=d[2],tid=d[3],rpt=d[4];
                //root.core.setTextureQueue(tid);		//推送材质队列
                const dt={
                    x:s[0]*cvt,y:s[1]*cvt,z:s[2]*cvt,
                    ox:p[0]*cvt,oy:p[1]*cvt,oz:p[2]*cvt+s[2]*cvt*0.5,
                    rx:r[0],ry:r[1],rz:r[2],
                    material:{
                        texture:tid,
                        repeat:rpt,
                        color:config.color,
                    },
                    stop:d[6],
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
                    material:row.material,
                    animate:row.animate,
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

const basic_box={
    hooks:self.hooks,
    transform:self.transform,
}

export default basic_box;