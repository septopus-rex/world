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
                    mobile:self.isMobile(),
                    network:"",
                    input:self.decode(window.location.hash),
                }
            };
        },
    },
    decode:(hash)=>{
        //#20025_504_0|8_3_0|0_0_36
        const result={
            block:[0,0],
            position:[8,8,0],
            rotation:[0,0,0],
        }
        
        return result;
    },
    isMobile:()=>{
        return window.innerWidth<768?true:false;
    }
}

const vbw_detect={
    hooks:self.hooks,
    check:(id)=>{
        const info={};
        const dom=document.getElementById(id);
        info.width=dom.clientWidth;
        info.height=dom.clientHeight;
        return info;
    },
}

export default vbw_detect;