/**
 * Lib - trigger function builder
 *
 * @fileoverview
 *  1. build a function from script
 *  2. task router
 *
 * @author Fuu
 * @date 2025-06-18
 */

import Toolbox from "./toolbox";

//["不等于","等于","大于","小于","大于等于","小于等于"]

const operator={
    "!=":(pa,pb)=>{

    },
    "==":(pa,pb)=>{

    },
    ">":(pa,pb)=>{

    },
    "<":(pa,pb)=>{

    },
    ">=":(pa,pb)=>{

    },
    "<=":(pa,pb)=>{

    },
}

//!import, there is key `router` is an array, help to link to the task function
// {
//     fun_a:()=>{},
//     fun_b:()=>{},
//     fun_c:()=>{},
//     router:["fun_a","fun_b","fun_c"]
// }
const objects=[
    {name:"system"},
    {name:"adjunct"},
    {name:"player"},
    {name:"bag"},
];

let Reader=null;
let Pusher=null;
const self={
    validCondition:(condition)=>{

        return true;
    },
    //check whether win the task, if not, task abord
    isAbort:(todo)=>{

    },
    getTargetObject:()=>{

    },
    getAdjunctNameByIndex:(index)=>{
        const data=Reader.get(["map",index]);
        if(data.error) return false;
        return data;
    },
    getTaskByRouter:(arr,group)=>{
        if(arr.length===0) return group;
        const index=arr.shift();
        if(index<1 || !group.router || !group.router[index-1]) return false;
        const key=group.router[index-1];
        return  self.getTaskByRouter(arr,group[key]);
    },
    getTaskFunction:(arr)=>{
        console.log(`Function array`,JSON.stringify(arr));
        const cat=arr.shift();
        if(cat < 1 || !objects[cat-1]) return {error:"Invalid task category"};
        const group=objects[cat-1];
        //console.log(group,JSON.stringify(arr));
        if(group.name==="adjunct"){
            //console.log(arr);
            const index=arr.shift();
            const adj=self.getAdjunctNameByIndex(index);
            if(adj===false) return {error:"Invalid adjunct index."};
            const res=self.getTaskByRouter(arr,group[adj]);
            if(!res) return {error:"Failed to get task function."}
            return res;
        }else{
            const res=self.getTaskByRouter(arr,group);
            if(!res) return {error:"Failed to get task function."}
            return res;
        }
    },
    getMeshes:(target)=>{
        //console.log(target);
        if( target.x===undefined || 
            target.y === undefined || 
            target.adjunct===undefined) return [];

        const chain=["active","containers",target.container,"scene"];
        const scene=Reader.get(chain);
        if(scene.error) return [];

        const arr=[];
        for(let i=0;i<scene.children.length;i++){
            const data=scene.children[i].userData;
            //console.log(data);
            if(data.x===undefined || 
                data.y===undefined || 
                data.name===undefined ||
                !scene.children[i].isMesh
            ) continue;

            //console.log(scene.children[i])

            if(data.x===target.x && 
                data.y===target.y && 
                data.name===target.adjunct) arr.push(scene.children[i]);
        }
        //console.log(arr);
        return arr;
    },
    getTaskParams:(arr,ev,type)=>{
        //console.log(`Parameter array`,arr,ev,type);
        switch (type) {
            case 'system':
                return ["Hello world","trigger title"];
                break;
            case 'adjunct':
                
                const target={x:ev.x,y:ev.y,adjunct:"box",container:ev.container};
                //console.log(`Get meshes by`,target);
                const meshes=self.getMeshes(target);
                return [meshes,arr];
                break;
            default:
                break;
        }
    },
    //!important, need closure function to keep the parameters from adjunct `trigger`
    single:(act)=>{
        return ((act)=>{
            let [condition,todo,abord,recover]=act;

            return (ev)=>{
                if(!self.validCondition(condition)) return false;

                const task=self.getTaskFunction(Toolbox.clone(todo[0]));
                if(task.error) return false;
                const cat=todo[0][0];
                const type=objects[cat-1].name;
                const params=self.getTaskParams(Toolbox.clone(todo[1]),ev,type);
                //console.log(params);
                //console.log(task);
                if(params.error) return false;

                const keyFun = task(...params);        //run task defined in trigger.
                //console.log(keyFun);

                //!important, if there is animation, return framesync function
                if(Pusher!==null) Pusher(keyFun[0],keyFun[1]);
                
            };
        })(act);
    },

    //!important, need closure function to isolate the actions
    decode:(actions)=>{
        //console.log(objects);
        const funs=[];
        for(let i=0;i<actions.length;i++){
            const row=actions[i];
            funs.push(self.single(row));
        }

        return ((funs)=>{
            return (ev)=>{
                for(let i=0;i<funs.length;i++){
                    const fun=funs[i];
                    fun(ev);
                }
            };
        })(funs);
    },
};


const TriggerBuilder = {

    definition:(def)=>{
        //console.log(def);
        
    },

    /**  set funs for trigger
     * @param   {object[]}    funs      //[{},{}]
     * @param   {function}    root      //VBW.cache
     * */
    set:(funs,root)=>{
        //1. cache task functions
       
        for(let i=0;i<funs.length;i++){
            if(!objects[i]) continue;
            const row=funs[i];
            for(let k in row){
                objects[i][k]=row[k];
            }
        }

        //2. set system functions
        Reader=root.get;
        Pusher=root.push;
    },  

    /**  get frame sync function
     * @param   {object[]}    actions   //formatted action array
     * @param   {object}      cfg       //{}
     * */
    get: (actions, cfg) => {
        //console.log(actions);
        const fun=self.decode(actions);
        return fun;
    },

    /**  filter out on-chain content, download when in game mode
     * @param   {object[]}    actions   //formatted action array
     * */
    filter:(actions)=>{

    },
}

export default TriggerBuilder;