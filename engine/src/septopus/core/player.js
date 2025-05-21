/* 
*  Player basic component 
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.save the location.
*  2.save the body parameters.
*/

import Toolbox from "../lib/toolbox";
import VBW  from "./framework";

const reg={
    name:"player",       //组件名称
    category:'system',      //组件分类
}

//配置数据，初始化可以放在这里
const config={
    location:{
        block:[2025,501],
        world:0,
        position:[8,8,1.7],
        rotation:[Math.PI*0.5,0,0],
        headAx:"y",
    },
    body:{
        height:1.5,		//默认的人物高度
        shoulder:0.5,	//player的肩宽
        chest:0.22,		//player的胸厚
    },
    capacity:{
        move:0.03,          //每次移动的距离m，测试时候用的0.03
        rotate:0.05,        //头部旋转的的速度
        span:0.31,          //走过的高差
        squat:0.1,          //蹲下的高度
        jump:1,	            //跳过的高差
        death:3,            //死亡坠落高度
        speed:1.5,          //移动速度，m/s，测试时候用1.5
        strength:1,         //蓄力，用于跳跃
    },
    extend:2,               //周边显示的扩展数
    autosave:60,            //多少帧进行自动位置保存
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        init:()=>{
            
            const py=Toolbox.clone(config);
            py.avatar="";
            py.address="";
            py.stamp=Toolbox.stamp();
            return {
                chain:["env","player"],
                value:py,
            };
        },
    },
    getPlayerLocation:()=>{
        const key="vbw_player";
        const pp=localStorage.getItem(key);
        if(pp===null){
            localStorage.setItem(key,JSON.stringify(config.location));
            return Toolbox.clone(config.location);
        }else{
            try {
                const data=JSON.parse(pp);
                return data;
            } catch (error) {
                localStorage.setItem(key,JSON.stringify(config.location));
                return Toolbox.clone(config.location);
            }
        }
    },
}

let count=0;
let player=null;
const vbw_player={
    hooks:self.hooks,

    //set the player parameters
    body:()=>{

    },

    autosave:()=>{
        if(count>config.autosave){
            if(player===null){
                player=VBW.cache.get(["env","player","location"]);
            }
            //console.log(`Player status saved.`);
            //const active=VBW.cache.get(["active"]);
            const key="vbw_player";
            console.log(JSON.stringify(player));
            localStorage.setItem(key,JSON.stringify(player));
            count=0;
        }else{
            count++;
        }
    },

    //get the player status.
    start:(dom_id,ck)=>{
        //1.获取本地的启动信息
        const data=self.getPlayerLocation();

        //2.设置帧同步操作
        //2.1.设置好方法
        const chain=["block",dom_id,data.world,"loop"];
        if(!VBW.cache.exsist(chain)) VBW.cache.set(chain,[]);
        const queue=VBW.cache.get(chain);
        queue.push({name:"player",fun:vbw_player.autosave});

        return ck && ck(data);
    },
}

export default vbw_player;