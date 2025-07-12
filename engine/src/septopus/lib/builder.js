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

//support function attatch here.
const objects=[
    {
        name:"system",
        default:{},
    },
    {
        name:"adjunct",
        default:{},
    },
    {
        name:"player",
        default:{},
    },
    {
        name:"bag",
        default:{},
    },
];

const self={
    getValueByOrgin:()=>{

    },
};

const TriggerBuilder = {
    /**  set funs for trigger
     * @param   {object[]}    funs   //[{},{}]
     * */
    set:(funs)=>{
        for(let i=0;i<funs.length;i++){
            if(!objects[i]) continue;
            const row=funs[i];
            objects[i].default=row;
        }
    },  

    /**  get frame sync function
     * @param   {object[]}    actions   //formatted action array
     * @param   {object}      cfg       //{}
     * @param   {object}      VBW      //VBW root to get all data needed
     * */
    get: (actions, cfg, VBW) => {

        return ()=>{
            console.log(`Builded function`);
        };
    }
}

export default TriggerBuilder;