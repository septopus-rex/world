/**
 * Core - detector
 *
 * @fileoverview
 *  1. check device
 *  2. confirm the system env
 *
 * @author Fuu
 * @date 2025-04-23
 */

const reg={
    name:"detect",
    category:'system',
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