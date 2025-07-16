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
        router:["","","",""],
    },
    {
        name:"adjunct",
        default:{},
    },
    {
        name:"player",
        default:{},
        router:["","","",""],
    },
    {
        name:"bag",
        default:{},
        router:["","","",""],
    },
];

let Reader=null;
const self={
    validCondition:(condition)=>{

        return true;
    },
    //check whether win the task, if not, task abord
    isAbort:(todo)=>{

    },
    getTargetObject:()=>{

    },
    //!important, need closure function to keep the parameters from adjunct `trigger`
    single:(act)=>{
        return ((act)=>{
            let [condition,todo,abord,recover]=act;
            return (ev)=>{
                if(!self.validCondition(condition)) return false;
                console.log(ev)
                console.log(`Reader`,Reader);
                console.log(`Todo`,todo);
            };
        })(act);
    },

    //!important, need closure function to isolate the actions
    decode:(actions)=>{
        const funs=[];
        for(let i=0;i<actions.length;i++){
            const row=actions[i];
            funs.push(self.single(row));
        }

        return ((funs)=>{
            return (ev)=>{
                console.log(ev);
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
            objects[i].default=row;
        }

        //2. set VBW as root
        Reader=root;
    },  

    /**  get frame sync function
     * @param   {object[]}    actions   //formatted action array
     * @param   {object}      cfg       //{}
     * */
    get: (actions, cfg) => {
        //console.log(actions);
        const fun=self.decode(actions);
        return fun;
    }
}

export default TriggerBuilder;