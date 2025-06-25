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
    decodeBlock:(str)=>{
        const arr=str.substring(1).split("_");
        if(arr.length!==3) return false;
        for(let i=0;i<arr.length;i++){
            if(isNaN(parseFloat(arr[i]))) return false;
            arr[i]=parseFloat(arr[i]);
        }
        return arr;
    },
    decodePosition:(str)=>{
        const arr=str.split("_");
        if(arr.length!==3) return false;
        for(let i=0;i<arr.length;i++){
            if(isNaN(parseFloat(arr[i]))) return false;
            arr[i]=parseFloat(arr[i]);
        }
        return arr;
    },
    decodeRotation:(str)=>{
        const arr=str.split("_");
        if(arr.length!==3) return false;
        for(let i=0;i<arr.length;i++){
            if(isNaN(parseFloat(arr[i]))) return false;
            arr[i]=parseFloat(arr[i]);
        }
        return arr;
    },
    decode:(hash)=>{
        //#20025_504_0|8_3_0|0_0_36
        const result={
            block:[0,0],
            position:[0,0,0],
            rotation:[0,0,0],
            exsist:false,
        }
        if(!hash || hash==="#") return result;
        const arr=hash.split("|");
        if(arr[0]!==undefined) result.block=self.decodeBlock(arr[0]);
        if(arr[1]!==undefined) result.position=self.decodePosition(arr[1]);
        if(arr[2]!==undefined) result.rotation=self.decodeRotation(arr[2]);
        if(result.block!==false && result.position!==false && result.rotation!==false){
            result.exsist = true;
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