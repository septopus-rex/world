/**
 * Lib - trigger function builder
 *
 * @fileoverview
 *  1. build a function from script
 *
 * @author Fuu
 * @date 2025-06-18
 */

const self={
    
};

const TriggerBuilder = {
    /**  get frame sync function
     * @param	{object[]}    actions   //formatted action array
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