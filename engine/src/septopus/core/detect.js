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
                    mobile:window.innerWidth<768?true:false,
                    network:"",
                }
            };
        },
    },
}

const vbw_detect={
    hooks:self.hooks,
    check:(id)=>{
        const info={};
        const dom=document.getElementById(id);
        //const width=dom.clientWidth,height=om.clientHeight;
        info.width=dom.clientWidth;
        info.height=dom.clientHeight;
        return info;
    },
}

export default vbw_detect;