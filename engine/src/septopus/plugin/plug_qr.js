/* 
*  Septopus World QR plugin
*  @auth [ Fuu ]
*  @creator Fuu
*  @date 2025-04-29
*  @functions
*  1.show block owner QR, or donation QR.
*/

const reg={
    name:"qr",        //组件名称
    type:"plugin",     //组件分类
    short:"e2",
};

const map={};       // world_x_y --> block data,    cache block data
const self={
    transform:{

    },
}

const plug_qr={
    transform:self.transform,
}

export default plug_qr;