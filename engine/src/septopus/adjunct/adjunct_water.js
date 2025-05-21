/* 
*  VBW water component
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.
*/

const reg={
    name:"water",
    category:"adjunct",
    short:"a3",         //key的缩写，用于减少链上数据
    desc:"Water adjunct, used to create special landscape.",
    version:"1.0.0",
}

const config={
    
};

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
        task:()=>{
            console.log(`wall task here.`);
        },
    }
}

const adj_water={
    hooks:self.hooks,
}

export default adj_water;