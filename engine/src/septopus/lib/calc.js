const self = {
    // whether in stop projection surface
    projection: (px, py, stops) => {
        const list = {};
        for (let i in stops) {
            const row = stops[i];
            const { size, position, side, block, orgin } = row;

            switch (orgin.type) {
                case "box":
                    const xmin = position[0] - size[0] * 0.5, xmax = position[0] + size[0] * 0.5;
                    const ymin = position[1] - size[1] * 0.5, ymax = position[1] + size[1] * 0.5;

                    if ((px > xmin && px < xmax) &&
                        (py > ymin && py < ymax)) {
                        list[i] = row;
                    }
                    break;

                case "ball":
                    const radius = 0.5 * size[0];
                    const center = [position[0], position[1]];     //ball center
                    const dis = Calc.distance([px, py], center);

                    if (dis < radius) {
                        list[i] = row;
                    }
                    break;

                default:
                    break;
            }
        }
        return list;
    },

    /** player Z position calculation
     * @param   {number}    stand       //player stand height
     * @param   {number}    body        //player body height
     * @param   {number}    cap         //max height player can go cross
     * @param   {number}    elevation   //player elevacation
     * @param   {object[]}  list        //{id:stop,id:stop,...}, stop list to check
     * 
     * */
    relationZ: (stand, body, cap, list) => {
        //console.log(`Basic, player stand height: ${stand}, 
        //body height ${body}, able to cross ${cap}`);
        const arr = [];
        const def = {
            "BODY_STOP": 1,  //stop the body
            "FOOT_STOP": 2,  //stop on foot
            "HEAD_STOP": 3,  //stop beyond header
        }

        for (let id in list) {
            const row = list[id];
            const { position, size } = row;
            const zmin = position[2] - size[2] * 0.5 - row.elevation;
            const zmax = position[2] + size[2] * 0.5 - row.elevation;

            //TODO, here to check BALL type stop
            if (zmin >= stand + body) {
                //a.stop upon header
                arr.push({
                    stop: false,
                    way: def.HEAD_STOP,
                    index: parseInt(id),
                    orgin: row.orgin,
                });
            } else if (zmin < stand + body && zmin >= stand + cap) {
                //b.normal stop 
                arr.push({
                    stop: true,
                    way: def.BODY_STOP,
                    index: parseInt(id),
                    orgin: row.orgin,
                });
            } else {
                //c.stop on foot
                const zd = zmax - stand; //height to cross
                if (zd > cap) {
                    arr.push({
                        stop: true,
                        way: def.FOOT_STOP,
                        index: parseInt(id),
                        orgin: row.orgin,
                    });
                } else {
                    arr.push({
                        stop: false,
                        delta: zd,
                        index: parseInt(id),
                        orgin: row.orgin,
                    });
                }
            }
        }
        return arr;
    },

    filter: (arr) => {
        const result = { stop: false, index: -1 }
        let max = null;
        for (let i in arr) {
            const row = arr[i];
            if (row.stop == true) {
                result.stop = true;
                result.index = row.index;
                result.way = row.way;
                result.orgin = row.orgin;
                return result;
            }

            if (row.delta != undefined) {
                if (max == null) max = row;
                if (row.delta > max.delta) max = row;
            }
        }
        if (max != null) {
            result.index = max.index;
            result.orgin = max.orgin;
            result.delta = max.delta;
        }
        return result;
    },

    empty: (obj) => {
        if (JSON.stringify(obj) === "{}") return true;
        return false;
    },


    zCheck:(stand,height,objs)=>{
        const head=stand+height;
        for(let k in objs){
            const row=objs[k];
            const bottom=row.position[2]-0.5*row.size[2];
            const top=row.position[2]+0.5*row.size[2];
            if(head>bottom && head<top) return row.orgin;
        }
        return false;
    },
}

const Calc = {
    /**
    * calc distance of two points
    * @param {number[]}   pa  - [x,y]
    * @param {number[]}   pb  - [x,y]
    * @return {number}  - distance of two points
    */
    distance: (pa, pb) => {
        const dx = pb[0] - pa[0];
        const dy = pb[1] - pa[1];
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
    * calc distance to revise offset
    * @param    {number}   start   - the position before point
    * @param    {number}   point   - the position right now
    * @param    {number}   offset   - grid offset
    * @return   {object}    - {offset:0.2, size:0.5}
    */
    reviseSizeOffset: (start, point, offset) => {
        const fs = point > offset ? offset * 0.5 : (
            ((point * .5 + start) > offset) ? (offset - 0.5 * point) : 
                (start < 0.5 * point ? 0.5 * point : start)
        );
        const sz = point > offset ? offset : point;
        return { offset: fs, size: sz };
    },

    /**
    * player leave from special object to block
    * @functions
    * 1. reset player position.
    * @param {number[]}     pos     - [x,y,z],player position right now
    * @param {object[]}     objs    - stop array.
    * @param {object}       cfg     - {"cap":310,"height":1700,"elevation":1900,"cross":true,"next":200}
    * 
    * @return   {object}
    * {"interact":true,"move":true,"index":0,"delta":0,"orgin":{"adjunct":"box","index":0,"type":"box"}}
    */
    check: (pos, objs, cfg) => {
        //console.log(JSON.stringify(cfg),JSON.stringify(pos));
        //console.log(`Amount of stop: ${objs.length}`);

        const result = {         //stop result
            interact: false,     //whether on a stop
            move: true,          //whether allow to move
            //index: -1,          //index of stops
        }
        if(cfg.cross){
            result.cross=true;
            result.edelta=cfg.next-cfg.elevation;
        }
        if (objs.length < 1) return result;

        //1.check whether interact with stop from top view ( in projection ).
        const [dx, dy, pz] = pos;       //player position
        const list = self.projection(dx, dy, objs);

        if (self.empty(list)) return result;
        result.interact = true;

        //2.check position of stop;
        const cap = cfg.cap;
        const body = cfg.height;
        //console.log(`Stand height from env.player: ${pz}`);
        const stand=pz+(cfg.cross?(cfg.elevation-cfg.next):0);
        const arr = self.relationZ(stand, body, cap, list);

        //3.filter out the target stop for movement;
        const fs = self.filter(arr);
        result.move = !fs.stop;
        //result.index = fs.index;
        if (fs.delta !== undefined) result.delta = fs.delta;
        if (fs.orgin) result.orgin = fs.orgin;
        
        return result;  
    },

    /**
    * check wether inside objects
    * @param    {number[]}      pos     - [x,y,stand],the position to check
    * @param    {object[]}      objs    - 3D objects
    * @param    {number}        height  - grid offset
    * @return   {false|object}      - if inside, retuen {adjunct:"wall",index:3} 
    */
    inside: (pos, objs, height) => {
        if (objs.length < 1) return false;
        const [dx, dy, stand] = pos;       //player position
        const list = self.projection(dx, dy, objs);
        if (!list || self.empty(list)) return false;
        
        return self.zCheck(stand, height,list);
    }
    
}

export default Calc