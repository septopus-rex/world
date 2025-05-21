import * as THREE from "three";

const self = {
    get:(params)=>{
        const {x,y,elevation,size,offset,face,side,density} = params;
        //getFaceConfig:  (x,y, elevation, size, offset, face, side , density)
        const gd=self.getFaceConfig(x,y,elevation,size,offset,face,side,density);
        if(gd.error) return {error:gd.error};

        //{"ax":"x","cen":[32385750,7984000,200],"color":10027008,"points":[],"countX":17,"countY":13,"cornor":true}
        const {ax,cen,color,me,countX,countY,cornor,material}=gd;
        const {offsetX,offsetY,limitZ}=density;
        const  lines=self.grid(cen,ax,offsetX,offsetY,countX,countY,cornor,material);
        //console.log(lines);
        return lines;
    },
    /* Location grid create
     * @param   cen     array       //[x,y,z]类型的坐标点
     * @param	ax      string		//['x','y','z']表示和ax的轴垂直
     * @param	dv		number      //从ax正方向向反方向看去，位于右侧的轴为"转换x轴"，和该轴垂直的线间距
     * @param	dp		number      //从ax正方向向反方向看去，位于右侧的轴为"转换x轴"，和该轴平行的线间距
     * @param	cv      number      //dv间距的轴数量
     * @param	cp      number      //dp间距的轴数量
     * @param	color   string      //格栅绘制的颜色
     * @param	cornor  boolean     //基点坐标定位是否从左下角开始
     * 
     * return 
     * three.group		//three.js的group对象
     * */
    grid: (cen, ax, dv, dp, cv, cp, cornor, material) => {
        //计算获取的格栅的左下角坐标点
        let start = [0, 0, 0]
        if (!cornor) {
            switch (ax) {
                case 'x':
                    start[0] = cen[0];																	//指定轴
                    start[1] = cen[1] - ((cv % 2) ? (cv - 1) * 0.5 * dv : (cv * 0.5 - 0.5) * dv);		//转换X轴
                    start[2] = cen[2] - ((cp % 2) ? (cp - 1) * 0.5 * dp : (cp * 0.5 - 0.5) * dp);		//转换Y轴
                    break;
                case 'y':
                    start[0] = cen[0] - ((cp % 2) ? (cp - 1) * 0.5 * dp : (cp * 0.5 - 0.5) * dp);		//转换Y轴
                    start[1] = cen[1];																	//指定轴												
                    start[2] = cen[2] - ((cv % 2) ? (cv - 1) * 0.5 * dv : (cv * 0.5 - 0.5) * dv);		//转换X轴
                    break;
                case 'z':
                    start[0] = cen[0] - ((cv % 2) ? (cv - 1) * 0.5 * dv : (cv * 0.5 - 0.5) * dv);		//转换X轴
                    start[1] = cen[1] - ((cp % 2) ? (cp - 1) * 0.5 * dp : (cp * 0.5 - 0.5) * dp);		//转换Y轴
                    start[2] = cen[2];																	//指定轴			
                    break;
                default:
                    break;
            }
        } else {
            start = cen;
        }

        const lines = new THREE.Group();			//所有的line放到一个group里,方便操作
        const mz = (cp - 1) * dp, my = (cv - 1) * dv;
        let pa = [0, 0, 0], pb = [0, 0, 0];
        for (let i = 0; i < cv; i++) {
            switch (ax) {
                case 'x':
                    pa = [start[0], start[1] + i * dv, start[2]];
                    pb = [start[0], start[1] + i * dv, start[2] + mz];
                    break;
                case 'y':
                    pa = [start[0], start[1], start[2] + i * dv];
                    pb = [start[0] + mz, start[1], start[2] + i * dv];
                    break;
                case 'z':
                    pa = [start[0] + i * dv, start[1], start[2]];
                    pb = [start[0] + i * dv, start[1] + mz, start[2]];
                    break;
                default:
                    break;
            }
            lines.add(self.line(pa, pb, material));
        }
        for (let i = 0; i < cp; i++) {
            switch (ax) {
                case 'x':
                    pa = [start[0], start[1], start[2] + i * dp];
                    pb = [start[0], start[1] + my, start[2] + i * dp];
                    break;
                case 'y':
                    pa = [start[0] + i * dp, start[1], start[2]];
                    pb = [start[0] + i * dp, start[1], start[2] + my];
                    break;
                case 'z':
                    pa = [start[0], start[1] + i * dp, start[2]];
                    pb = [start[0] + my, start[1] + i * dp, start[2]];
                    break;
                default:
                    break;
            }
            lines.add(self.line(pa, pb, material));
        }

        return lines;
    },

    line:(pa,pb,material)=>{
        const points = [];
        points.push( new THREE.Vector3( pa[0], pa[1], pa[2]) );
        points.push( new THREE.Vector3( pb[0], pb[1], pb[2]) );
        const geometry = new THREE.BufferGeometry().setFromPoints( points );
        const line=new THREE.Line(geometry,material);
        return line;
    },
    

    //提供standard的数据输出，可以进行比较处理，也供valid来使用
    sample: () => {
        return {
            size: [],
        }
    },

    /* get the grid parameters
     * @param	x           number      //block X
     * @param	y           number      //block Y
     * @param   elevation   number      //block elevation
     * @param	size        object      //{x:x,y:y,z:z}
     * @param	offset      object      //{ox:ox,oy:oy,oz:oz}
     * @param	face        string      //['x','y','z','-x','-y','-z']
     * @param   side        number[]    //[sideX,sideY]       
     * @param	density     object      //{offsetX:1,offsetY:1,limitZ:10}
     * */
    getFaceConfig:  (x,y, elevation, size, offset, face, side , density) => {
        const {offsetX,offsetY,limitZ} = density;
        const len = face.length;
        const f = len == 1 ? face : face[1];     //判断face的情况

        const ps = [];
        const s = side[0];
        let cen, color, countX, countY;
        switch (f) {
            case 'x':
                cen = [
                    len == 2 ? (s * (x - 1) + offset.ox - 0.5 * size.x) : (s * (x - 1) + offset.ox + 0.5 * size.x),
                    s * (y - 1),
                    elevation
                ]
                color = 0x990000;
                countX = s / offsetX + 1;       //相对轴数量的计算
                countY = limitZ / offsetY + 1;  //相对轴数量的计算
                break;
            case 'y':
                cen = [
                    s * (x - 1), 
                    len == 2 ? s * (y - 1) + offset.oy - 0.5 * size.y : s * (y - 1) + offset.oy + 0.5 * size.y,
                    elevation
                ];
                color = 0x009900;
                countY = s / offsetY + 1;       //相对轴数量的计算
                countX = limitZ / offsetX + 1;  //相对轴数量的计算
                break;
            case 'z':
                cen = [
                    s * (x - 1),
                    s * (y - 1),
                    len == 2 ? elevation + offset.oz - 0.5 * size.z : elevation + offset.oz + 0.5 * size.z
                ]
                color = 0x000099;
                countX = s / offsetX + 1;       //相对轴数量的计算
                countY = s / offsetY + 1;       //相对轴数量
                break;
            default:
                break;
        }
        return { 
            ax: f, 
            cen: cen, 
            color: color, 
            points: ps,
            countX: countX,
            countY: countY,
            cornor: true
        };
    },

    valid: (params) => {
        return true;
    },
}

const extend_grid = {
    create: (params) => {
        if (!self.valid(params)) return { error: "Invalid parameters to create BOX." };
        return self.get(params);
    },
    standard: () => {
        return self.sample();
    },
};

export default extend_grid;