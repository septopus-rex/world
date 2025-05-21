/* 
*  VBW detector, confirm the system
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.check device
*/


const reg={
    name:"detect",       //组件名称
    category:'system',      //组件分类
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            return{
                chain:["env","device"],
                value:{
                    screen:{
                        width:window.innerWidth ,
                        height:window.innerHeight,
                        ratio:window.devicePixelRatio,
                    },
                    mobile:true,
                    network:"",
                }
            };
        },
    },
}

const vbw_detect={
    hooks:self.hooks,
    check:(id)=>{
        const dom=document.getElementById(id);
        const width=dom.clientWidth,height=dom.clientHeight;
        
        return {width:width,height:height}
    },
}

export default vbw_detect;