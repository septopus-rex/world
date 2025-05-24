/* 
*  Basic components, trigger for logic
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.
*/

const reg={
    name:"trigger",
    category:"basic",
    short:"b8",         //key的缩写，用于减少链上数据
    desc:"Trigger to make the scene interactable, great component.",
    version:"1.0.0",
}


const self={
    hooks:{
        reg:()=>{
            return reg;
        }
    }
}

const basic_trigger={
    hooks:self.hooks,
}

export default basic_trigger;