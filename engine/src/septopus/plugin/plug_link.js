/* 
*  VBW link plugin
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-23
*  @functions
*  1.link to basic website link
*/

const reg={
    name:"qr",        //组件名称
    type:"plugin",     //组件分类
    short:"e1",
};

const map={};       // world_x_y --> block data,    cache block data
const self={
    transform:{

    },
}

const plug_link={
    transform:self.transform,
}

export default plug_link;