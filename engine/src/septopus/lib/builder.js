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
    single:(act)=>{
        const [condition,todo,abord,recover]=act;

        return (ev)=>{
            console.log(`Single action`);
            
        };
    },
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

let vbw=null;
const TriggerBuilder = {

    definition:(def)=>{
        //console.log(def);
        
    },

    /**  set funs for trigger
     * @param   {object[]}    funs   //[{},{}]
     * */
    set:(funs,root)=>{
        //console.log(funs);
        for(let i=0;i<funs.length;i++){
            if(!objects[i]) continue;
            const row=funs[i];
            objects[i].default=row;
        }

        vbw=root;
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